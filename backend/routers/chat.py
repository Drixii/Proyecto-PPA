from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Dict, List
from database import get_db, SessionLocal
from models.message import Message
from models.order import Order
from models.user import User
from schemas.order import MessageOut
from auth.dependencies import get_current_user, get_user_from_ws_token
import json

router = APIRouter(tags=["chat"])


class ConnectionManager:
    def __init__(self):
        # order_id → list of (websocket, user_id)
        self.active: Dict[int, List[tuple]] = {}

    async def connect(self, ws: WebSocket, order_id: int, user_id: int):
        await ws.accept()
        if order_id not in self.active:
            self.active[order_id] = []
        self.active[order_id].append((ws, user_id))

    def disconnect(self, ws: WebSocket, order_id: int):
        if order_id in self.active:
            self.active[order_id] = [(w, uid) for w, uid in self.active[order_id] if w != ws]

    async def broadcast(self, order_id: int, message: dict):
        if order_id in self.active:
            dead = []
            for ws, uid in self.active[order_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append((ws, uid))
            for item in dead:
                self.active[order_id].remove(item)


manager = ConnectionManager()


@router.websocket("/ws/chat/{order_id}")
async def websocket_chat(
    websocket: WebSocket,
    order_id: int,
    token: str = Query(...),
):
    db = SessionLocal()
    try:
        user = get_user_from_ws_token(token, db)
        if not user:
            await websocket.close(code=4001)
            return

        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            await websocket.close(code=4004)
            return
        # Solo el cliente dueño, admin o sub-admin asignado puede conectarse
        if user.role not in ("admin", "sub_admin") and order.client_id != user.id:
            await websocket.close(code=4003)
            return

        await manager.connect(websocket, order_id, user.id)
        try:
            while True:
                data = await websocket.receive_text()
                payload = json.loads(data)
                content = payload.get("content", "").strip()
                if not content:
                    continue
                msg = Message(order_id=order_id, sender_id=user.id, content=content)
                db.add(msg)
                db.commit()
                db.refresh(msg)
                # Crear notificacion para el otro lado
                try:
                    from services.notification_service import notify_message
                    notify_message(db, order, user, content)
                except Exception as e:
                    print(f"[notify_message error] {e}")
                    db.rollback()
                out = {
                    "id": msg.id,
                    "order_id": msg.order_id,
                    "sender_id": msg.sender_id,
                    "sender_name": user.full_name,
                    "sender_role": user.role,
                    "content": msg.content,
                    "created_at": msg.created_at.isoformat(),
                }
                await manager.broadcast(order_id, out)
        except WebSocketDisconnect:
            manager.disconnect(websocket, order_id)
    finally:
        db.close()


@router.get("/api/chat/{order_id}/history", response_model=dict)
def get_history(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if current_user.role not in ("admin", "sub_admin") and order.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sin acceso")
    messages = db.query(Message).filter(Message.order_id == order_id).order_by(Message.created_at.asc()).all()
    return {
        "success": True,
        "data": [MessageOut.model_validate(m).model_dump() for m in messages],
        "message": ""
    }


@router.post("/api/chat/{order_id}/read", response_model=dict)
def mark_read(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db.query(Message).filter(
        Message.order_id == order_id,
        Message.sender_id != current_user.id,
        Message.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"success": True, "data": None, "message": "Mensajes marcados como leídos"}
