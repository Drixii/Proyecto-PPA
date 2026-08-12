import logging

from sqlalchemy.orm import Session
from models.notification import Notification
from models.user import User
from models.order import Order

log = logging.getLogger(__name__)

STATUS_LABELS = {
    "en_aprobacion": "En Aprobación",
    "en_proceso": "En Proceso",
    "completado": "Completado",
    "rechazado": "Rechazado",
}


def _owner_admin(db: Session, order: Order):
    """Super-admin dueño de la orden, o None.

    Cada super-admin solo debe enterarse de lo suyo. Antes, cuando no se sabía
    el dueño se avisaba a TODOS los admins activos: el cliente de un admin
    subía un comprobante y la notificación le llegaba también al otro.

    Y no se pierde nada por no tener respaldo: la lista de órdenes ya filtra
    por super_admin_id, así que una orden sin dueño no aparece en el panel de
    nadie. Avisar a todos no la hacía visible, solo filtraba información. Si
    pasa, queda en el log como lo que es: un dato roto que hay que mirar.
    """
    if order.super_admin_id:
        return order.super_admin_id

    # El registro exige código de invitación (routers/auth.py), así que el
    # cliente siempre tiene dueño aunque la orden se haya quedado sin él.
    client = db.query(User).filter(User.id == order.client_id).first()
    if client and client.super_admin_id:
        return client.super_admin_id

    log.warning(
        "Orden %s sin super_admin_id y su cliente tampoco tiene: nadie recibe aviso.",
        order.order_number,
    )
    return None


def notify(db: Session, recipient_id: int, order_id: int, kind: str, title: str, body: str = None, commit: bool = True):
    n = Notification(
        recipient_id=recipient_id,
        order_id=order_id,
        kind=kind,
        title=title,
        body=body,
    )
    db.add(n)
    if commit:
        db.commit()
    return n


def notify_owning_admin(db: Session, order: Order, kind: str, title: str, body: str = None, commit: bool = True):
    """Avisa solo al super-admin dueño de la orden."""
    admin_id = _owner_admin(db, order)
    if not admin_id:
        return
    admin = db.query(User).filter(
        User.id == admin_id, User.role == "admin", User.is_active == True
    ).first()
    if not admin:
        return
    notify(db, admin.id, order.id, kind, title, body, commit=False)
    if commit:
        db.commit()


def notify_sub_admin(db: Session, order: Order, sub_admin_id: int):
    notify(
        db, sub_admin_id, order.id, "order_assigned",
        title=f"Caso derivado: {order.order_number}",
        body=f"En Aprobación → En Proceso · {order.receiver_name} ({order.receiver_country})",
    )


def notify_new_order(db: Session, order: Order):
    # Resolve sub-admin (card payments already have sub_admin_id set at creation)
    assigned_sa = None
    if order.sub_admin_id:
        assigned_sa = db.query(User).filter(User.id == order.sub_admin_id).first()

    # Solo el super-admin dueño
    if assigned_sa:
        title = f"Pedido (tarjeta) de {order.sender_name}"
        body = f"Derivado a {assigned_sa.full_name} · {order.receiver_country} → {order.receiver_name}"
    else:
        title = f"Nuevo pedido de {order.sender_name}"
        body = f"{order.amount_sent:,.0f} {order.currency_from} → {order.receiver_country}"
    notify_owning_admin(db, order, "new_order", title=title, body=body, commit=False)

    # Notify sub-admin: card payments already assigned; transfer orders notify by country
    if assigned_sa:
        notify(db, assigned_sa.id, order.id, "new_order",
            title=f"Nuevo caso: {order.receiver_country}",
            body=f"{order.sender_name} → {order.receiver_name}",
            commit=False,
        )
    else:
        from services.order_service import find_sub_admin_for_country
        sub_admin_id = find_sub_admin_for_country(db, order.receiver_country, getattr(order, 'super_admin_id', None))
        if sub_admin_id:
            notify(db, sub_admin_id, order.id, "new_order",
                title=f"Nuevo pedido para {order.receiver_country}",
                body=f"{order.sender_name} → {order.receiver_name}",
                commit=False,
            )

    db.commit()


def notify_status_change(db: Session, order: Order, old_status: str, new_status: str):
    old_l = STATUS_LABELS.get(old_status, old_status)
    new_l = STATUS_LABELS.get(new_status, new_status)

    # Always notify client
    notify(
        db, order.client_id, order.id, "status_change",
        title=f"Pedido cambió de {old_l} a {new_l}",
        body=f"{order.order_number} · {order.receiver_name}",
        commit=False,
    )

    # Al completarse, avisar al super-admin dueño
    if new_status == "completado":
        notify_owning_admin(
            db, order, "status_change",
            title=f"Orden completada: {order.order_number}",
            body=f"{order.sender_name} → {order.receiver_name} ({order.receiver_country})",
            commit=False,
        )

    db.commit()


def notify_message(db: Session, order: Order, sender: User, content: str):
    preview = content[:60] + ("..." if len(content) > 60 else "")
    if sender.role in ("admin", "sub_admin"):
        notify(
            db, order.client_id, order.id, "message",
            title="Mensaje del operador",
            body=preview,
        )
    else:
        notify_owning_admin(
            db, order, "message",
            title=f"Mensaje de {sender.full_name}",
            body=preview,
            commit=False,
        )
        # Notify assigned sub-admin (if different from sender)
        if order.sub_admin_id and order.sub_admin_id != sender.id:
            notify(db, order.sub_admin_id, order.id, "message",
                title=f"Mensaje de {sender.full_name}",
                body=preview,
                commit=False,
            )
        db.commit()
