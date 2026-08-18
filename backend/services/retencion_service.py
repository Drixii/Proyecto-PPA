"""Retención de envíos grandes de clientes nuevos.

Qué hace
--------
Un envío por encima de cierto monto, hecho por alguien que todavía no ha
completado ninguno, no pasa al encargado hasta que un super-admin lo mire.

Por qué solo el primero y solo si es grande
-------------------------------------------
Casi todo el fraude ocurre en la primera operación: quien usa una cuenta
robada no vuelve mañana, así que no tiene motivo para empezar despacio. Un
cliente real que manda 30.000 no merece la fricción; uno que manda 2.000.000
en su primera hora, sí.

Retener no es bloquear. El dinero ya entró — lo que se detiene es el pago al
destinatario, que es el único momento en el que todavía se puede deshacer.

El umbral se compara en CLP
---------------------------
Para que "un millón de pesos chilenos" signifique lo mismo enviando desde
Colombia o Argentina, el monto se convierte a CLP con la tasa vigente. Sin eso
el umbral sería un millón de pesos colombianos en Colombia — unos 250 mil CLP
— y retendría casi todo.

Si no hay tasa para convertir, se retiene. Ante la duda, que lo mire alguien.
"""
import logging

log = logging.getLogger("ppa")

# Ajustes editables desde el panel.
CLAVE_UMBRAL = "retencion_umbral_clp"
CLAVE_ACTIVA = "retencion_activa"

UMBRAL_POR_DEFECTO = 1_000_000.0


def _ajuste(db, clave: str, por_defecto):
    from models.setting import Setting
    try:
        row = db.query(Setting).filter(Setting.key == clave).first()
    except Exception:
        return por_defecto
    if not row or row.value in (None, ""):
        return por_defecto
    return row.value


def umbral_clp(db) -> float:
    try:
        return float(_ajuste(db, CLAVE_UMBRAL, UMBRAL_POR_DEFECTO))
    except (TypeError, ValueError):
        return UMBRAL_POR_DEFECTO


def activa(db) -> bool:
    return str(_ajuste(db, CLAVE_ACTIVA, "true")).strip().lower() == "true"


def a_clp(db, monto: float, moneda: str) -> float | None:
    """Convierte a CLP. None si no hay tasa."""
    from services.exchange_service import get_rate

    moneda = (moneda or "").upper()
    if moneda == "CLP":
        return float(monto or 0)
    tasa = get_rate(db, moneda, "CLP")
    if not tasa:
        return None
    return float(monto or 0) * tasa


def envios_completados(db, client_id) -> int:
    from models.order import Order
    if not client_id:
        return 0
    return db.query(Order).filter(
        Order.client_id == client_id,
        Order.status == "completado",
        Order.deleted_at == None,
    ).count()


def es_confiable(user) -> bool:
    """Marcado a mano por un super-admin. Se salta la retención siempre."""
    return bool(getattr(user, "is_trusted", False))


def evaluar(db, order, user=None) -> tuple[bool, str]:
    """¿Hay que retener este envío? Devuelve (retener, motivo).

    El motivo se guarda con la orden: sin él, quien revisa ve una orden
    detenida y no sabe por qué, y acaba aprobando a ciegas.
    """
    if not activa(db):
        return False, ""

    if user is None:
        from models.user import User
        user = db.query(User).filter(User.id == order.client_id).first()

    if user is not None and es_confiable(user):
        return False, ""

    completados = envios_completados(db, order.client_id)
    if completados > 0:
        return False, ""

    tope = umbral_clp(db)
    en_clp = a_clp(db, order.amount_sent, order.currency_from)

    if en_clp is None:
        # Sin tasa no se puede comparar. Se retiene: es preferible una espera a
        # dejar pasar un monto que quizá supera el umbral.
        return True, (
            f"Primer envío del cliente y no se pudo convertir "
            f"{order.amount_sent:,.0f} {order.currency_from} a CLP para comparar"
        )

    if en_clp < tope:
        return False, ""

    if (order.currency_from or "").upper() == "CLP":
        detalle = f"{en_clp:,.0f} CLP"
    else:
        detalle = f"{order.amount_sent:,.0f} {order.currency_from} (~{en_clp:,.0f} CLP)"

    return True, f"Primer envío del cliente por {detalle}, sobre el límite de {tope:,.0f} CLP"


def supera_umbral(db, monto: float, moneda: str) -> bool:
    """Solo el monto, sin mirar al cliente. Para avisar antes de pagar."""
    if not activa(db):
        return False
    en_clp = a_clp(db, monto, moneda)
    if en_clp is None:
        return True
    return en_clp >= umbral_clp(db)
