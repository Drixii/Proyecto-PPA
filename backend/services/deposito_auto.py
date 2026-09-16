"""Aprobar sola una transferencia cuando el aviso del banco la identifica.

Esto mueve dinero sin que nadie lo mire, asi que las condiciones son mas duras
que las del cruce que se le sugiere al admin. Alli basta un parecido razonable,
porque decide una persona; aqui no decide nadie.

Para aplicarse solo tienen que cumplirse TODAS:

  1. El interruptor esta encendido.
  2. El aviso dice que el dinero entro (RECEIVED), no que lo rechazaron.
  3. El cruce encontro una sola orden. Si hubo empate ya viene sin candidata.
  4. El monto coincide al centimo. Sin tolerancia: la que se le permite al
     admin existe porque un banco corresponsal puede descontar comision en
     transito, y eso es justo lo que uno quiere mirar con sus propios ojos.
  5. La moneda coincide.
  6. El nombre de quien transfirio y el del titular comparten al menos dos
     palabras. Con una sola no alcanza: "Maria" la comparten miles de personas,
     y el nombre es lo unico que ata el dinero a la orden cuando la cuenta de
     cobro es compartida.
  7. La orden sigue sin pagar y esperando.

Si algo de eso no se cumple, no pasa nada malo: el deposito queda como estaba,
sugerido, y lo aprueba el admin. Es el comportamiento que habia antes.
"""
import logging

from sqlalchemy.orm import Session

from models.order import Order
from models.setting import Setting

log = logging.getLogger(__name__)

CLAVE = "deposito_auto_aprobar"


def activo(db: Session) -> bool:
    """Encendido salvo que alguien lo apague. Se pidio asi expresamente."""
    fila = db.query(Setting).filter(Setting.key == CLAVE).first()
    if not fila or fila.value in (None, ""):
        return True
    return str(fila.value).strip().lower() == "true"


def set_activo(db: Session, valor: bool) -> bool:
    fila = db.query(Setting).filter(Setting.key == CLAVE).first()
    texto = "true" if valor else "false"
    if fila:
        fila.value = texto
    else:
        db.add(Setting(key=CLAVE, value=texto))
    db.commit()
    return valor


def _palabras(nombre: str | None) -> set:
    from services.global66_service import _tokens

    return _tokens(nombre or "")


def _apellido(nombre: str | None) -> str:
    """La ultima palabra util del nombre. En la region, el primer apellido.

    Hace falta porque con solo contar palabras en comun se colaba un caso real:
    "Maria Jose Solis" contra "Maria Jose Ruiz" comparte dos —Maria y Jose— y
    son dos personas distintas. Los nombres de pila dobles son comunes aqui;
    los apellidos, no tanto.
    """
    from services.global66_service import _LIMPIA

    import unicodedata
    s = unicodedata.normalize("NFKD", nombre or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    partes = [t for t in _LIMPIA.sub(" ", s).upper().split() if len(t) > 2]
    return partes[-1] if partes else ""


def evaluar(db: Session, deposito) -> tuple[bool, str]:
    """Si este deposito puede aplicarse solo. Devuelve (si, por que no)."""
    if not activo(db):
        return False, "la aprobación automática está apagada"
    if deposito.applied:
        return False, "ya estaba aplicado"
    if (deposito.status or "").upper() != "RECEIVED":
        return False, f"el aviso dice {deposito.status or 'sin estado'}"
    if not deposito.match_order_id:
        return False, "el cruce no señaló una orden"

    orden = db.query(Order).filter(
        Order.id == deposito.match_order_id,
        Order.deleted_at == None,
    ).first()
    if not orden:
        return False, "la orden del cruce ya no existe"
    if orden.paid_at:
        return False, f"{orden.order_number} ya estaba pagada"
    if orden.status not in ("en_aprobacion", "pendiente_pago"):
        return False, f"{orden.order_number} está en {orden.status}"

    if (deposito.currency or "").upper() != (orden.currency_from or "").upper():
        return False, f"llegó en {deposito.currency} y la orden es en {orden.currency_from}"

    diferencia = abs(float(orden.amount_sent or 0) - float(deposito.amount or 0))
    if diferencia >= 0.01:
        return False, f"llegaron {deposito.amount} y la orden es de {orden.amount_sent}"

    del_banco = _palabras(deposito.remitter_name)
    comunes = del_banco & _palabras(orden.sender_name)
    apellido = _apellido(orden.sender_name)
    if len(comunes) < 2 or not apellido or apellido not in del_banco:
        vistas = ", ".join(sorted(comunes)) or "ninguna"
        return False, (f"el nombre no basta: «{deposito.remitter_name}» contra "
                       f"«{orden.sender_name}» (coincide {vistas})")

    return True, (f"{orden.order_number}: monto exacto y el nombre coincide "
                  f"en {len(comunes)} palabras, apellido incluido")


def intentar(db: Session, deposito, marcar_pagada) -> bool:
    """Aplica el deposito si procede. `marcar_pagada` hace el trabajo de verdad.

    Se le pasa la funcion en vez de importarla para no cerrar un circulo entre
    este modulo y el router de pagos, que es quien la tiene.
    """
    puede, motivo = evaluar(db, deposito)
    if not puede:
        log.info("[deposito] %s NO se aplica solo: %s", deposito.transaction_id, motivo)
        return False

    orden_id = deposito.match_order_id
    numero = db.query(Order.order_number).filter(Order.id == orden_id).scalar()

    deposito.applied = True
    deposito.match_note = f"{deposito.match_note} · aplicado automáticamente"
    db.commit()

    log.info("[deposito] %s aplicado solo — %s", deposito.transaction_id, motivo)
    marcar_pagada(deposito.transaction_id, order_id=orden_id,
                  order_number=numero, proveedor="deposito")
    return True
