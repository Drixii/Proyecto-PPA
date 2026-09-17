"""Las órdenes que nunca se pagaron se caen solas a los tres días.

Una orden en `pendiente_pago` es una intención de envío: el cliente la creó y
no llegó a pagarla. No hay dinero de por medio y nadie tiene nada que hacer con
ella, pero se queda en el panel para siempre. Cuando pasan meses, "Pendiente de
pago" son cientos de órdenes muertas entre las que hay que buscar la de ayer
que sí importa.

A los tres días sin actividad se van a la papelera. A la papelera y no borradas
del todo: allí duran otros treinta días y se pueden restaurar, así que una que
se caiga por error se recupera. El dato nunca se pierde de golpe.

Actividad es cualquier señal de que la orden sigue viva: se tocó la orden
(`updated_at`, que sube al subir un comprobante, al cambiar de estado o al
editar cualquier campo) o alguien escribió un mensaje en ella. Mientras el
cliente y la casa sigan hablando, la cuenta atrás se reinicia.
"""
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.order import Order
from models.message import Message

DIAS = 3


def _naive(dt):
    """Quita la zona horaria para poder restar.

    Las columnas son `DateTime(timezone=True)`, así que Postgres las devuelve
    con zona y SQLite sin ella. Restar una con zona de una sin ella revienta
    con TypeError, y el servidor va en UTC, que es lo que guarda de todos
    modos: quitarla deja las dos comparables.
    """
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _sin_pagar(query):
    """Las que cuentan: creadas, sin cobrar y todavía en el panel."""
    return query.filter(
        Order.status == "pendiente_pago",
        Order.paid_at == None,   # noqa: E711
        Order.deleted_at == None,  # noqa: E711
    )


def ultimos_mensajes(db: Session, ids: list) -> dict:
    """Fecha del último mensaje de cada orden, en una sola consulta.

    Una consulta por orden dentro del bucle de la lista serían cientos de
    viajes a la base cada vez que el panel se refresca.
    """
    if not ids:
        return {}
    filas = (
        db.query(Message.order_id, func.max(Message.created_at))
        .filter(Message.order_id.in_(ids))
        .group_by(Message.order_id)
        .all()
    )
    return {fila[0]: fila[1] for fila in filas}


def dias_restantes(orden: Order, ultimo_mensaje=None):
    """Días que le quedan antes de irse a la papelera, o None si no aplica.

    Devuelve 0 cuando ya está vencida y solo falta que pase el barrido.
    """
    if orden.status != "pendiente_pago" or orden.paid_at or orden.deleted_at:
        return None

    actividad = max(
        x for x in (
            _naive(orden.updated_at),
            _naive(orden.created_at),
            _naive(ultimo_mensaje),
        ) if x is not None
    )
    pasados = (datetime.utcnow() - actividad).days
    return max(0, DIAS - pasados)


def barrer(db: Session) -> int:
    """Manda a la papelera las vencidas. Devuelve cuántas."""
    corte = datetime.utcnow() - timedelta(days=DIAS)

    candidatas = _sin_pagar(db.query(Order)).filter(Order.updated_at < corte).all()
    if not candidatas:
        return 0

    mensajes = ultimos_mensajes(db, [o.id for o in candidatas])

    ahora = datetime.utcnow()
    caidas = 0
    for orden in candidatas:
        # El filtro de arriba mira `updated_at`, que un mensaje no toca. Aquí
        # se vuelve a comprobar contando también la conversación.
        if dias_restantes(orden, mensajes.get(orden.id)) == 0:
            orden.deleted_at = ahora
            caidas += 1

    if caidas:
        db.commit()
    return caidas
