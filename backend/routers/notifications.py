from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.notification import Notification
from models.push_subscription import PushSubscription
from models.order import Order
from models.user import User
from auth.dependencies import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _serialize(n: Notification, db: Session) -> dict:
    order = db.query(Order).filter(Order.id == n.order_id).first() if n.order_id else None
    sa_name = None
    if order and order.super_admin_id:
        sa = db.query(User).filter(User.id == order.super_admin_id).first()
        sa_name = sa.full_name if sa else None
    return {
        "id": n.id,
        "order_id": n.order_id,
        "kind": n.kind,
        "title": n.title,
        "body": n.body,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        # contexto para abrir el modal correcto
        "client_name": order.sender_name if order else None,
        "receiver_name": order.receiver_name if order else None,
        "order_number": order.order_number if order else None,
        "status": order.status if order else None,
        "super_admin_name": sa_name,
    }


@router.get("", response_model=dict)
def list_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(Notification)
        .filter(Notification.recipient_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    unread = sum(1 for n in rows if not n.is_read)
    return {
        "success": True,
        "data": {
            "items": [_serialize(n, db) for n in rows],
            "unread_count": unread,
        },
        "message": ""
    }


@router.post("/mark-seen", response_model=dict)
def mark_all_seen(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(Notification).filter(
        Notification.recipient_id == current_user.id,
        Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"success": True, "data": None, "message": "Marcadas como leídas"}


@router.delete("", response_model=dict)
def delete_all(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(Notification).filter(Notification.recipient_id == current_user.id).delete()
    db.commit()
    return {"success": True, "data": None, "message": "Notificaciones eliminadas"}


@router.delete("/{notif_id}", response_model=dict)
def delete_one(notif_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.recipient_id == current_user.id
    ).delete()
    db.commit()
    return {"success": True, "data": None, "message": "Eliminada"}


# ── Notificaciones del navegador (Web Push) ──────────────────────────────────

class SuscripcionPushIn(BaseModel):
    endpoint: str
    keys: dict


@router.get("/push/clave", response_model=dict)
def clave_push():
    """La clave pública que el navegador necesita para suscribirse.

    Sin sesión a propósito: es pública por definición y la página la pide antes
    de saber si va a pedir permiso. `activo` en false significa que el servidor
    no tiene configuradas las claves y no hay nada que ofrecer.
    """
    from services import push_service

    return {
        "success": True,
        "data": {"clave": push_service.clave_publica(), "activo": push_service.activo()},
        "message": "",
    }


@router.post("/push/suscribir", response_model=dict)
def suscribir_push(
    data: SuscripcionPushIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Guarda este navegador para poder avisarle.

    El endpoint es único por navegador, así que si ya estaba solo se reasigna:
    el mismo equipo puede cambiar de manos —o de cuenta— y los avisos tienen
    que seguir a quien lo usa ahora, no a quien lo registró.
    """
    claves = data.keys or {}
    p256dh, auth = claves.get("p256dh"), claves.get("auth")
    if not p256dh or not auth:
        raise HTTPException(status_code=400, detail="Suscripción incompleta")

    fila = db.query(PushSubscription).filter(
        PushSubscription.endpoint == data.endpoint
    ).first()
    if fila:
        fila.user_id = current_user.id
        fila.p256dh = p256dh
        fila.auth = auth
    else:
        db.add(PushSubscription(
            user_id=current_user.id,
            endpoint=data.endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=(request.headers.get("user-agent") or "")[:300],
        ))
    db.commit()
    return {"success": True, "data": None, "message": "Notificaciones activadas"}


@router.delete("/push/suscribir", response_model=dict)
def desuscribir_push(
    endpoint: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deja de avisar a este navegador."""
    db.query(PushSubscription).filter(
        PushSubscription.endpoint == endpoint,
        PushSubscription.user_id == current_user.id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "data": None, "message": "Notificaciones desactivadas"}
