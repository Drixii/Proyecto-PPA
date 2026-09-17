"""Reseñas de clientes.

Solo puede opinar quien envió dinero: la reseña se ata a una orden propia y
completada, una por orden. Nace pendiente y se publica cuando el super-admin
la aprueba; la portada solo enseña las aprobadas.

La portada no dice de qué casa es cada reseña, pero cada super-admin solo ve y
modera las de sus propios clientes, igual que el resto del panel.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_super_admin
from database import get_db
from models.order import Order
from models.review import Review
from models.user import User

router = APIRouter(prefix="/api", tags=["reviews"])

ESTADOS = ("pendiente", "aprobada", "rechazada")


def nombre_publico(nombre_completo: str) -> str:
    """«María José González» → «María G.»: nombre y la inicial del apellido."""
    partes = [p for p in (nombre_completo or "").split() if p]
    if not partes:
        return "Cliente"
    if len(partes) == 1:
        return partes[0].capitalize()
    return f"{partes[0].capitalize()} {partes[-1][0].upper()}."


def _publica(r: Review) -> dict:
    return {
        "id": r.id,
        "nombre": r.nombre_publico,
        "rating": r.rating,
        "comentario": r.comment,
        "pais_origen": r.pais_origen,
        "pais_destino": r.pais_destino,
        "fecha": r.created_at.isoformat() if r.created_at else None,
    }


def _completa(r: Review) -> dict:
    d = _publica(r)
    d.update({
        "order_id": r.order_id,
        "status": r.status,
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
    })
    return d


# ── Cliente ───────────────────────────────────────────────────────────────

class ReviewIn(BaseModel):
    order_id: int
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=10, max_length=600)


@router.post("/reviews", response_model=dict)
def crear_resena(data: ReviewIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    orden = db.query(Order).filter(
        Order.id == data.order_id,
        Order.client_id == user.id,
        Order.deleted_at == None,  # noqa: E711
    ).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if orden.status != "completado":
        raise HTTPException(status_code=400, detail="Solo puedes opinar sobre un envío completado")
    if db.query(Review).filter(Review.order_id == orden.id).first():
        raise HTTPException(status_code=409, detail="Ya dejaste tu opinión sobre este envío")

    texto = " ".join(data.comment.split())
    if len(texto) < 10:
        raise HTTPException(status_code=400, detail="Cuéntanos un poco más (mínimo 10 caracteres)")

    r = Review(
        order_id=orden.id,
        client_id=user.id,
        super_admin_id=orden.super_admin_id,
        rating=data.rating,
        comment=texto,
        nombre_publico=nombre_publico(user.full_name),
        pais_origen=orden.sender_country,
        pais_destino=orden.receiver_country,
        status="pendiente",
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"success": True, "data": _completa(r), "message": "¡Gracias por tu opinión!"}


@router.get("/reviews/order/{order_id}", response_model=dict)
def mi_resena(order_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = db.query(Review).filter(Review.order_id == order_id, Review.client_id == user.id).first()
    return {"success": True, "data": _completa(r) if r else None, "message": ""}


# ── Portada ───────────────────────────────────────────────────────────────

@router.get("/reviews/public", response_model=dict)
def resenas_publicas(limit: int = Query(30, ge=1, le=60), db: Session = Depends(get_db)):
    aprobadas = db.query(Review).filter(Review.status == "aprobada")
    total = aprobadas.count()
    promedio = None
    if total:
        promedio = round(sum(r.rating for r in aprobadas.all()) / total, 1)
    lista = aprobadas.order_by(Review.created_at.desc()).limit(limit).all()
    return {
        "success": True,
        "data": {"items": [_publica(r) for r in lista], "total": total, "promedio": promedio},
        "message": "",
    }


# ── Super-admin ───────────────────────────────────────────────────────────

@router.get("/admin/reviews", response_model=dict)
def listar_resenas(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    q = db.query(Review).filter(Review.super_admin_id == admin.id)
    if status in ESTADOS:
        q = q.filter(Review.status == status)
    lista = q.order_by(Review.created_at.desc()).all()
    pendientes = db.query(Review).filter(Review.super_admin_id == admin.id, Review.status == "pendiente").count()
    return {"success": True, "data": {"items": [_completa(r) for r in lista], "pendientes": pendientes}, "message": ""}


class ModeracionIn(BaseModel):
    status: str


@router.patch("/admin/reviews/{review_id}", response_model=dict)
def moderar_resena(
    review_id: int,
    data: ModeracionIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    if data.status not in ESTADOS:
        raise HTTPException(status_code=400, detail="Estado no válido")
    r = db.query(Review).filter(Review.id == review_id, Review.super_admin_id == admin.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Reseña no encontrada")
    r.status = data.status
    r.reviewed_at = datetime.now(timezone.utc) if data.status != "pendiente" else None
    db.commit()
    mensajes = {"aprobada": "Reseña publicada", "rechazada": "Reseña rechazada", "pendiente": "Reseña devuelta a pendientes"}
    return {"success": True, "data": _completa(r), "message": mensajes[data.status]}
