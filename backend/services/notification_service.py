from sqlalchemy.orm import Session
from models.notification import Notification
from models.user import User
from models.order import Order

STATUS_LABELS = {
    "en_aprobacion": "En Aprobación",
    "en_proceso": "En Proceso",
    "completado": "Completado",
}


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


def notify_admins(db: Session, order_id: int, kind: str, title: str, body: str = None, super_admin_id: int = None):
    q = db.query(User).filter(User.role == "admin", User.is_active == True)
    if super_admin_id:
        q = q.filter(User.id == super_admin_id)
    for admin in q.all():
        notify(db, admin.id, order_id, kind, title, body, commit=False)
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

    # Notify owning super-admin (or all if no owner set)
    admin_q = db.query(User).filter(User.role == "admin", User.is_active == True)
    if order.super_admin_id:
        admin_q = admin_q.filter(User.id == order.super_admin_id)
    admins = admin_q.all()
    for admin in admins:
        if assigned_sa:
            title = f"Pedido (tarjeta) de {order.sender_name}"
            body = f"Derivado a {assigned_sa.full_name} · {order.receiver_country} → {order.receiver_name}"
        else:
            title = f"Nuevo pedido de {order.sender_name}"
            body = f"{order.amount_sent:,.0f} {order.currency_from} → {order.receiver_country}"
        notify(db, admin.id, order.id, "new_order", title=title, body=body, commit=False)

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

    # When completado: notify owning super-admin (or all if no owner)
    if new_status == "completado":
        admin_q = db.query(User).filter(User.role == "admin", User.is_active == True)
        if order.super_admin_id:
            admin_q = admin_q.filter(User.id == order.super_admin_id)
        for admin in admin_q.all():
            notify(db, admin.id, order.id, "status_change",
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
        # Notify owning super-admin (or all if no owner)
        admin_q = db.query(User).filter(User.role == "admin", User.is_active == True)
        if order.super_admin_id:
            admin_q = admin_q.filter(User.id == order.super_admin_id)
        for admin in admin_q.all():
            notify(db, admin.id, order.id, "message",
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
