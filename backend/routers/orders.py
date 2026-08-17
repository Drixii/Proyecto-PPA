from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from utils.image import validate_and_convert
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from database import get_db
from models.order import Order
from models.message import Message
from models.user import User
from models.point import PointTransaction
from schemas.order import OrderCreate, OrderOut
from schemas.order import MessageOut
from services.order_service import create_order
from auth.dependencies import get_current_user
import os
from datetime import datetime

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.post("", response_model=dict)
def new_order(data: OrderCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        order = create_order(db, data, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, "data": OrderOut.model_validate(order).model_dump(), "message": "Orden creada"}


@router.get("", response_model=dict)
def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(Order).filter(Order.client_id == current_user.id).order_by(Order.created_at.desc())
    total = q.count()
    orders = q.offset((page - 1) * page_size).limit(page_size).all()
    order_ids = [o.id for o in orders]
    points_map = {}
    if order_ids:
        txns = db.query(PointTransaction).filter(
            PointTransaction.order_id.in_(order_ids),
            PointTransaction.type == "earned",
        ).all()
        for t in txns:
            points_map[t.order_id] = t.points
    items = [{**OrderOut.model_validate(o).model_dump(), "points_earned": points_map.get(o.id, 0)} for o in orders]
    return {
        "success": True,
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        },
        "message": ""
    }


@router.get("/notifications", response_model=dict)
def get_client_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    active = db.query(Order).filter(
        Order.client_id == current_user.id,
        Order.status != "completado"
    ).order_by(Order.created_at.desc()).all()

    unread_rows = (
        db.query(Order, func.count(Message.id).label("cnt"))
        .join(Message, Message.order_id == Order.id)
        .join(User, Message.sender_id == User.id)
        .filter(
            Order.client_id == current_user.id,
            User.role.in_(["admin", "sub_admin"]),
            Message.is_read == False
        )
        .group_by(Order.id)
        .order_by(Order.updated_at.desc())
        .all()
    )

    return {
        "success": True,
        "data": {
            "active_orders": [OrderOut.model_validate(o).model_dump() for o in active],
            "unread_messages": [
                {**OrderOut.model_validate(o).model_dump(), "unread_count": cnt}
                for o, cnt in unread_rows
            ],
        },
        "message": ""
    }


@router.get("/{order_id}", response_model=dict)
def get_order(order_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = db.query(Order).filter(Order.id == order_id, Order.client_id == current_user.id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return {"success": True, "data": OrderOut.model_validate(order).model_dump(), "message": ""}


# def (no async): el endpoint lee el archivo, lo convierte con Pillow y escribe
# a disco — todo bloqueante. En async def eso congela el event loop y con él
# TODAS las demás peticiones y los WebSocket del chat. Como def normal, FastAPI
# lo ejecuta en el threadpool, igual que el resto de endpoints.
@router.post("/{order_id}/upload-proof", response_model=dict)
def upload_proof(
    order_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id, Order.client_id == current_user.id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order.payment_method != "transferencia":
        raise HTTPException(status_code=400, detail="Solo órdenes de transferencia requieren comprobante")

    allowed = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Tipo de archivo no permitido. Usa JPG, PNG o PDF.")

    content = file.file.read()
    if ext != ".pdf":
        content = validate_and_convert(content)
        ext = ".webp"

    filename = f"{order_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}{ext}"
    dest = os.path.join("uploads", "proofs", filename)
    with open(dest, "wb") as f:
        f.write(content)

    order.payment_proof = filename
    # Si venía rechazada, este comprobante nuevo la devuelve a la cola del
    # admin: por eso rechazar no cierra la orden, deja reintentar.
    was_rejected = order.status == "rechazado"
    if was_rejected:
        order.status = "en_aprobacion"
        order.rejection_reason = None
    elif order.status == "pendiente_pago":
        # Empezó como pago externo —tarjeta, Khipu— y el cliente se pasó a
        # transferencia al no poder cobrarse. Sin esto la orden se quedaba en
        # pendiente_pago con el comprobante ya subido, esperando un cobro que
        # nunca iba a llegar y sin aparecer en la cola de nadie.
        order.status = "en_aprobacion"
    # Si no, se queda en en_aprobacion — el admin aprueba y pasa a en_proceso
    db.commit()
    db.refresh(order)

    try:
        from services.notification_service import notify_owning_admin
        notify_owning_admin(
            db, order, "proof_uploaded",
            title=("Comprobante reenviado" if was_rejected else "Comprobante subido")
                  + f": {order.order_number}",
            body=f"{order.sender_name} · {order.receiver_country}",
        )
    except Exception as e:
        print(f"[notify upload-proof] {e}")

    return {"success": True, "data": OrderOut.model_validate(order).model_dump(), "message": "Comprobante subido"}
