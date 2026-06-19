from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime, timezone, timedelta
import shutil, uuid, os
from database import get_db
from models.order import Order
from models.bank import Bank
from models.user import User
from models.sub_admin_country import SubAdminCountry
from schemas.order import OrderOut
from auth.dependencies import require_sub_admin

router = APIRouter(prefix="/api/sub-admin", tags=["sub-admin"])


def _managed_countries(db: Session, user_id: int) -> list:
    rows = db.query(SubAdminCountry).filter(SubAdminCountry.user_id == user_id).all()
    return [r.country for r in rows]


def _order_with_bank(order, db: Session) -> dict:
    data = OrderOut.model_validate(order).model_dump()
    if order.receiver_bank_id:
        bank = db.query(Bank).filter(Bank.id == order.receiver_bank_id).first()
        data["receiver_bank_name"] = bank.name if bank else None
    else:
        data["receiver_bank_name"] = None
    data["completion_proof_url"] = f"/uploads/completions/{order.completion_proof}" if order.completion_proof else None
    return data


def _parse_dt(s: str):
    from datetime import datetime, timezone
    try:
        s = s.split('.')[0].replace('Z', '')
        dt = datetime.fromisoformat(s)
        if dt.tzinfo:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None


@router.get("/orders", response_model=dict)
def list_sub_admin_orders(
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = Query(None, alias="q"),
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sub_admin),
):
    countries = _managed_countries(db, current_user.id)

    # en_aprobacion: filter by receiver_country (not yet assigned to sub_admin)
    # en_proceso + completado: filter by sub_admin_id
    if status == "en_aprobacion":
        if not countries:
            query = db.query(Order).filter(Order.id == -1)  # empty
        else:
            query = db.query(Order).filter(
                Order.status == "en_aprobacion",
                Order.payment_proof.isnot(None),
                Order.receiver_country.in_(countries),
            )
    elif status in ("en_proceso", "completado"):
        query = db.query(Order).filter(
            Order.status == status,
            Order.sub_admin_id == current_user.id,
        )
    else:
        # All statuses for this sub-admin
        if countries:
            query = db.query(Order).filter(
                ((Order.status == "en_aprobacion") &
                 (Order.payment_proof.isnot(None)) &
                 (Order.receiver_country.in_(countries))) |
                ((Order.status.in_(["en_proceso", "completado"])) &
                 (Order.sub_admin_id == current_user.id))
            )
        else:
            query = db.query(Order).filter(
                Order.sub_admin_id == current_user.id
            )

    query = query.order_by(Order.created_at.asc())

    if search:
        like = f"%{search}%"
        query = query.filter(
            Order.sender_name.ilike(like) |
            Order.receiver_name.ilike(like) |
            Order.order_number.ilike(like) |
            Order.receiver_country.ilike(like) |
            Order.sender_id_num.ilike(like) |
            Order.receiver_account.ilike(like)
        )

    if date_from:
        dt = _parse_dt(date_from)
        if dt:
            query = query.filter(Order.created_at >= dt)

    if date_to:
        dt = _parse_dt(date_to)
        if dt:
            query = query.filter(Order.created_at <= dt)

    total = query.count()
    orders = query.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "success": True,
        "data": {
            "items": [_order_with_bank(o, db) for o in orders],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
        "message": ""
    }


@router.get("/stats", response_model=dict)
def sub_admin_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sub_admin),
):
    countries = _managed_countries(db, current_user.id)

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    en_proceso_today = db.query(Order).filter(
        Order.status == "en_proceso",
        Order.sub_admin_id == current_user.id,
        Order.updated_at >= today_start,
        Order.updated_at < today_end,
    ).count()

    en_aprobacion = 0
    if countries:
        en_aprobacion = db.query(Order).filter(
            Order.status == "en_aprobacion",
            Order.payment_proof.isnot(None),
            Order.receiver_country.in_(countries),
        ).count()

    # All orders relevant to this sub-admin updated today (all statuses)
    from sqlalchemy import or_, and_
    base_filter = or_(
        Order.sub_admin_id == current_user.id,
        and_(
            Order.status == "en_aprobacion",
            Order.payment_proof.isnot(None),
            Order.receiver_country.in_(countries) if countries else False,
        )
    )
    today_orders = db.query(Order).filter(
        base_filter,
        Order.updated_at >= today_start,
        Order.updated_at < today_end,
    ).order_by(Order.updated_at.desc()).limit(30).all()

    return {
        "success": True,
        "data": {
            "en_proceso_today": en_proceso_today,
            "en_aprobacion_pending": en_aprobacion,
            "managed_countries": countries,
            "today_orders": [
                {
                    "id": o.id,
                    "order_number": o.order_number,
                    "sender_name": o.sender_name,
                    "receiver_name": o.receiver_name,
                    "receiver_country": o.receiver_country,
                    "status": o.status,
                    "updated_at": o.updated_at.isoformat() if o.updated_at else None,
                    "created_at": o.created_at.isoformat() if o.created_at else None,
                }
                for o in today_orders
            ],
        },
        "message": "",
    }


@router.get("/orders/{order_id}", response_model=dict)
def get_sub_admin_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sub_admin),
):
    countries = _managed_countries(db, current_user.id)
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    # Allow access if: assigned sub_admin OR country is managed + en_aprobacion
    is_assigned = order.sub_admin_id == current_user.id
    is_country_match = (
        order.status == "en_aprobacion" and
        order.payment_proof is not None and
        order.receiver_country in countries
    )
    if not is_assigned and not is_country_match:
        raise HTTPException(status_code=403, detail="Sin acceso a esta orden")

    return {"success": True, "data": _order_with_bank(order, db), "message": ""}


@router.post("/orders/{order_id}/complete", response_model=dict)
async def complete_order(
    order_id: int,
    completion_proof: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sub_admin),
):
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.sub_admin_id == current_user.id
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order.status != "en_proceso":
        raise HTTPException(status_code=400, detail="Solo se pueden completar órdenes En Proceso")

    # Save completion proof file
    ext = os.path.splitext(completion_proof.filename or "")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".pdf"):
        raise HTTPException(status_code=400, detail="Formato no permitido (jpg/png/webp/pdf)")
    filename = f"completion_{uuid.uuid4().hex}{ext}"
    os.makedirs("uploads/completions", exist_ok=True)
    with open(f"uploads/completions/{filename}", "wb") as f:
        shutil.copyfileobj(completion_proof.file, f)

    order.completion_proof = filename

    from services.order_service import advance_order_status
    order = advance_order_status(db, order, "completado")
    return {
        "success": True,
        "data": _order_with_bank(order, db),
        "message": "Orden marcada como completada"
    }


@router.get("/me", response_model=dict)
def get_sub_admin_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_sub_admin),
):
    countries = _managed_countries(db, current_user.id)
    return {
        "success": True,
        "data": {
            "id": current_user.id,
            "full_name": current_user.full_name,
            "email": current_user.email,
            "managed_countries": countries,
        },
        "message": ""
    }
