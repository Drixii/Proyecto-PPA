from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.notification import Notification
from models.order import Order
from models.user import User
from auth.dependencies import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _serialize(n: Notification, db: Session) -> dict:
    order = db.query(Order).filter(Order.id == n.order_id).first() if n.order_id else None
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
