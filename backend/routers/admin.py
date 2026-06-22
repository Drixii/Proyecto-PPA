from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List
from pydantic import BaseModel
from database import get_db
from models.order import Order
from models.bank import Bank
from models.user import User
from models.setting import Setting
from models.sub_admin_country import SubAdminCountry
from models.point import PointTransaction
from models.invite_code import InviteCode
from models.admin_sub_admin import AdminSubAdmin
from schemas.order import OrderOut, OrderStatusUpdate
from datetime import datetime, timedelta
from services.order_service import advance_order_status, find_sub_admin_for_country
from auth.dependencies import require_admin, require_super_admin
from passlib.context import CryptContext
from utils.timezones import country_to_tz
import secrets, os

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/api/admin", tags=["admin"])

DEFAULT_SETTINGS = {
    "commission_pct": "1.5",
}


def _get_setting(db: Session, key: str) -> str:
    row = db.query(Setting).filter(Setting.key == key).first()
    if row:
        return row.value
    return DEFAULT_SETTINGS.get(key, "")


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


def _sub_admin_countries(db: Session, user_id: int) -> list:
    rows = db.query(SubAdminCountry).filter(SubAdminCountry.user_id == user_id).all()
    return [r.country for r in rows]


# ── Orders ────────────────────────────────────────────────

@router.get("/orders", response_model=dict)
def list_all_orders(
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = Query(None, alias="q"),
    sub_admin_id: Optional[int] = None,
    country: Optional[str] = None,
    all_orders: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin)
):
    query = db.query(Order).filter(
        Order.deleted_at == None,
        Order.super_admin_id == _admin.id,
    ).order_by(Order.created_at.asc())

    # Status filter — evaluated first so it always takes precedence
    if status:
        if status == "en_aprobacion":
            query = query.filter(Order.status == "en_aprobacion", Order.payment_proof.isnot(None))
        else:
            query = query.filter(Order.status == status)
    elif not all_orders and not sub_admin_id and not country:
        # Default view (no explicit filters): only actionable orders
        query = query.filter(
            ((Order.status == "en_aprobacion") & (Order.payment_proof.isnot(None))) |
            (Order.status == "completado")
        )
    # else: all_orders=True or sub_admin_id/country provided → no status restriction

    # Sub-admin filter — status-aware to match sub-admin panel logic exactly:
    #   en_aprobacion  → matched by receiver_country (not yet assigned)
    #   en_proceso / completado → matched by sub_admin_id (already assigned)
    if sub_admin_id:
        countries = _sub_admin_countries(db, sub_admin_id)
        if countries:
            query = query.filter(
                ((Order.status == "en_aprobacion") & (Order.receiver_country.in_(countries))) |
                ((Order.status.in_(["en_proceso", "completado"])) & (Order.sub_admin_id == sub_admin_id))
            )
        else:
            query = query.filter(Order.sub_admin_id == sub_admin_id)

    if country:
        query = query.filter(Order.receiver_country == country)

    if search:
        like = f"%{search}%"
        query = query.filter(
            Order.sender_name.ilike(like) |
            Order.receiver_name.ilike(like) |
            Order.order_number.ilike(like) |
            Order.receiver_country.ilike(like) |
            Order.sender_id_num.ilike(like) |
            Order.receiver_account.ilike(like) |
            Order.sender_phone.ilike(like) |
            Order.receiver_phone.ilike(like)
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
    order_ids = [o.id for o in orders]
    points_map = {}
    if order_ids:
        txns = db.query(PointTransaction).filter(
            PointTransaction.order_id.in_(order_ids),
            PointTransaction.type == "earned",
        ).all()
        for t in txns:
            points_map[t.order_id] = t.points
    items = []
    for o in orders:
        d = _order_with_bank(o, db)
        d["points_earned"] = points_map.get(o.id, 0)
        items.append(d)
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


@router.get("/orders/trash", response_model=dict)
def get_orders_trash_early(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    orders = (
        db.query(Order)
        .filter(Order.deleted_at != None)
        .order_by(Order.deleted_at.desc())
        .all()
    )
    now = datetime.utcnow()
    result = []
    for o in orders:
        days_left = max(0, 30 - (now - o.deleted_at).days)
        result.append({
            "id": o.id,
            "order_number": o.order_number,
            "sender_name": o.sender_name,
            "receiver_name": o.receiver_name,
            "receiver_country": o.receiver_country,
            "amount_sent": o.amount_sent,
            "currency_from": o.currency_from,
            "currency_to": o.currency_to,
            "amount_received": o.amount_received,
            "status": o.status,
            "deleted_at": o.deleted_at.isoformat(),
            "days_left": days_left,
        })
    return {"success": True, "data": result, "message": ""}


@router.get("/orders/{order_id}", response_model=dict)
def get_order_admin(
    order_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    data = _order_with_bank(order, db)
    txn = db.query(PointTransaction).filter(
        PointTransaction.order_id == order.id,
        PointTransaction.type == "earned",
    ).first()
    data["points_earned"] = txn.points if txn else 0
    # Include sub-admin info if assigned
    if order.sub_admin_id:
        sa = db.query(User).filter(User.id == order.sub_admin_id).first()
        data["sub_admin_name"] = sa.full_name if sa else None
        data["sub_admin_id"] = order.sub_admin_id
    else:
        # Look up who would handle this country
        countries = (
            db.query(SubAdminCountry)
            .join(User, User.id == SubAdminCountry.user_id)
            .filter(
                SubAdminCountry.country == order.receiver_country,
                User.is_active == True,
                User.role == "sub_admin",
            )
            .first()
        )
        if countries:
            sa = db.query(User).filter(User.id == countries.user_id).first()
            data["sub_admin_name"] = sa.full_name if sa else None
            data["sub_admin_id"] = countries.user_id
        else:
            data["sub_admin_name"] = None
            data["sub_admin_id"] = None
    return {"success": True, "data": data, "message": ""}


@router.patch("/orders/{order_id}/status", response_model=dict)
def update_status(
    order_id: int,
    data: OrderStatusUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    try:
        order = advance_order_status(db, order, data.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, "data": _order_with_bank(order, db), "message": f"Estado actualizado a {data.status}"}


class ApproveBody(BaseModel):
    confirmation: str


@router.post("/orders/{order_id}/approve", response_model=dict)
def approve_order(
    order_id: int,
    data: ApproveBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    if data.confirmation != "COMPROBADO":
        raise HTTPException(status_code=400, detail="Debes escribir COMPROBADO exactamente para confirmar")
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    if order.status != "en_aprobacion":
        raise HTTPException(status_code=400, detail="La orden no está pendiente de aprobación")
    if not order.payment_proof:
        raise HTTPException(status_code=400, detail="La orden no tiene comprobante adjunto")

    # Assign sub-admin by receiver_country and advance to en_proceso
    sub_admin_id = find_sub_admin_for_country(db, order.receiver_country, order.super_admin_id)
    old_status = order.status
    order.status = "en_proceso"
    order.sub_admin_id = sub_admin_id
    db.commit()
    db.refresh(order)

    try:
        from services.notification_service import notify_status_change, notify_sub_admin
        notify_status_change(db, order, old_status, "en_proceso")
        if sub_admin_id:
            notify_sub_admin(db, order, sub_admin_id)
    except Exception as e:
        print(f"[notify approve] {e}")

    data_out = _order_with_bank(order, db)
    if sub_admin_id:
        sa = db.query(User).filter(User.id == sub_admin_id).first()
        data_out["sub_admin_name"] = sa.full_name if sa else None
        data_out["sub_admin_id"] = sub_admin_id
    return {
        "success": True,
        "data": data_out,
        "message": "Comprobante aprobado — orden derivada al encargado del país"
    }


# ── Stats ─────────────────────────────────────────────────

@router.get("/stats", response_model=dict)
def get_stats(db: Session = Depends(get_db), _admin: User = Depends(require_super_admin)):
    from datetime import datetime, timezone
    now_utc = datetime.now(timezone.utc)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=None)
    today_end = now_utc.replace(hour=23, minute=59, second=59, microsecond=999999).replace(tzinfo=None)
    today_q = db.query(Order).filter(Order.created_at >= today_start, Order.created_at <= today_end, Order.super_admin_id == _admin.id)
    total = today_q.count()
    by_status = dict(
        today_q.with_entities(Order.status, func.count(Order.id))
        .group_by(Order.status)
        .all()
    )
    volume_today = db.query(func.sum(Order.amount_sent)).filter(
        Order.created_at >= today_start, Order.created_at <= today_end
    ).scalar() or 0
    recent = today_q.order_by(Order.created_at.asc()).all()
    return {
        "success": True,
        "data": {
            "total_orders": total,
            "by_status": by_status,
            "volume_today": round(float(volume_today), 2),
            "recent_orders": [_order_with_bank(o, db) for o in recent],
        },
        "message": ""
    }


# ── Notifications ──────────────────────────────────────────

@router.get("/notifications", response_model=dict)
def get_admin_notifications(db: Session = Depends(get_db), _admin: User = Depends(require_super_admin)):
    from models.message import Message

    # Orders with uploaded proof awaiting approval (filtered by admin ownership)
    pending = (
        db.query(Order)
        .filter(Order.status == "en_aprobacion", Order.payment_proof.isnot(None), Order.super_admin_id == _admin.id)
        .order_by(Order.created_at.desc())
        .limit(20)
        .all()
    )

    unread_rows = (
        db.query(Order, func.count(Message.id).label("cnt"))
        .join(Message, Message.order_id == Order.id)
        .join(User, Message.sender_id == User.id)
        .filter(User.role == "client", Message.is_read == False, Order.super_admin_id == _admin.id)
        .group_by(Order.id)
        .order_by(Order.updated_at.desc())
        .all()
    )

    return {
        "success": True,
        "data": {
            "pending_orders": [_order_with_bank(o, db) for o in pending],
            "unread_messages": [
                {**_order_with_bank(o, db), "unread_count": cnt}
                for o, cnt in unread_rows
            ],
        },
        "message": ""
    }


# ── Settings ──────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    commission_pct: float


@router.get("/settings", response_model=dict)
def get_settings(db: Session = Depends(get_db), _admin: User = Depends(require_super_admin)):
    commission = float(_get_setting(db, "commission_pct") or "1.5")
    return {
        "success": True,
        "data": {"commission_pct": commission},
        "message": ""
    }


@router.put("/settings", response_model=dict)
def update_settings(
    data: SettingsUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin)
):
    row = db.query(Setting).filter(Setting.key == "commission_pct").first()
    if row:
        row.value = str(data.commission_pct)
    else:
        db.add(Setting(key="commission_pct", value=str(data.commission_pct)))
    db.commit()
    return {"success": True, "data": {"commission_pct": data.commission_pct}, "message": "Configuracion guardada"}


# ── User management ───────────────────────────────────────

class UserCreateAdmin(BaseModel):
    email: str
    full_name: str
    password: str
    role: str = "client"
    phone: Optional[str] = None
    country: Optional[str] = None
    managed_countries: Optional[List[str]] = None  # only for sub_admin role


class PasswordChangeAdmin(BaseModel):
    new_password: str


@router.get("/users", response_model=dict)
def list_users(
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin)
):
    q = db.query(User).filter(User.deleted_at == None)
    if role == "client":
        q = q.filter(User.role == "client", User.super_admin_id == _admin.id)
    elif role == "sub_admin":
        linked_ids = [r.sub_admin_id for r in db.query(AdminSubAdmin).filter(AdminSubAdmin.admin_id == _admin.id).all()]
        q = q.filter(User.role == "sub_admin", User.id.in_(linked_ids)) if linked_ids else q.filter(User.role == "sub_admin", False)
    elif role == "admin":
        q = q.filter(User.role == "admin")
    else:
        # Combined: this admin's clients + linked sub-admins + all admins
        linked_ids = [r.sub_admin_id for r in db.query(AdminSubAdmin).filter(AdminSubAdmin.admin_id == _admin.id).all()]
        from sqlalchemy import or_
        q = q.filter(
            or_(
                (User.role == "client") & (User.super_admin_id == _admin.id),
                (User.role == "sub_admin") & (User.id.in_(linked_ids if linked_ids else [-1])),
                User.role == "admin",
            )
        )
    users = q.order_by(User.created_at.desc()).all()

    result = []
    for u in users:
        row = {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "phone": u.phone,
            "country": u.country,
            "timezone": u.timezone or 'America/Santiago',
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        if u.role == "sub_admin":
            row["managed_countries"] = _sub_admin_countries(db, u.id)
        result.append(row)

    return {"success": True, "data": result, "message": ""}


@router.post("/users", response_model=dict)
def create_user_admin(
    data: UserCreateAdmin,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin)
):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")
    if data.role not in ("client", "admin", "sub_admin"):
        raise HTTPException(status_code=400, detail="Rol inválido")
    hashed = pwd_context.hash(data.password)
    # For sub_admin derive timezone from first managed country; otherwise from personal country
    if data.role == 'sub_admin' and data.managed_countries:
        tz = country_to_tz(data.managed_countries[0])
    else:
        tz = country_to_tz(data.country)
    user = User(
        email=data.email,
        full_name=data.full_name,
        password=hashed,
        role=data.role,
        phone=data.phone,
        country=data.country,
        timezone=tz,
        must_change_password=(data.role == 'sub_admin'),
        super_admin_id=_admin.id if data.role == "client" else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if data.role == "sub_admin" and data.managed_countries:
        for c in data.managed_countries:
            db.add(SubAdminCountry(user_id=user.id, country=c))
        db.commit()

    # Link sub-admin to creating admin
    if data.role == "sub_admin":
        existing = db.query(AdminSubAdmin).filter(
            AdminSubAdmin.admin_id == _admin.id,
            AdminSubAdmin.sub_admin_id == user.id,
        ).first()
        if not existing:
            db.add(AdminSubAdmin(admin_id=_admin.id, sub_admin_id=user.id))
            db.commit()

    return {
        "success": True,
        "data": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "managed_countries": data.managed_countries or [],
        },
        "message": "Usuario creado exitosamente"
    }


@router.patch("/users/{user_id}/password", response_model=dict)
def change_user_password(
    user_id: int,
    data: PasswordChangeAdmin,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Usa tu perfil para cambiar tu propia contraseña")
    user.password = pwd_context.hash(data.new_password)
    user.must_change_password = True  # Fuerza al usuario a cambiar en próximo login
    db.commit()
    return {"success": True, "data": None, "message": "Contraseña actualizada"}


@router.patch("/users/{user_id}/toggle-active", response_model=dict)
def toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")
    user.is_active = not user.is_active
    db.commit()
    return {"success": True, "data": {"is_active": user.is_active}, "message": "Estado actualizado"}


@router.get("/users/{user_id}/countries", response_model=dict)
def get_user_countries(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.role != "sub_admin":
        raise HTTPException(status_code=400, detail="Solo sub-administradores tienen países asignados")
    return {"success": True, "data": _sub_admin_countries(db, user_id), "message": ""}


class CountriesUpdate(BaseModel):
    countries: List[str]


@router.put("/users/{user_id}/countries", response_model=dict)
def update_user_countries(
    user_id: int,
    data: CountriesUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.role != "sub_admin":
        raise HTTPException(status_code=400, detail="Solo sub-administradores tienen países asignados")
    db.query(SubAdminCountry).filter(SubAdminCountry.user_id == user_id).delete()
    for c in data.countries:
        db.add(SubAdminCountry(user_id=user_id, country=c))
    if data.countries:
        user.timezone = country_to_tz(data.countries[0])
    db.commit()

    # Auto-asignar órdenes pendientes sin encargado para estos países
    if data.countries:
        unassigned = db.query(Order).filter(
            Order.status.in_(["en_aprobacion", "en_proceso"]),
            Order.sub_admin_id == None,
            Order.deleted_at == None,
            Order.receiver_country.in_(data.countries)
        ).all()
        for o in unassigned:
            o.sub_admin_id = user_id
        if unassigned:
            db.commit()

    return {"success": True, "data": data.countries, "message": "Países actualizados"}


@router.delete("/users/{user_id}", response_model=dict)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    user = db.query(User).filter(User.id == user_id, User.deleted_at == None).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="No puedes eliminar a un super-admin")
    user.deleted_at = datetime.utcnow()
    db.commit()
    return {"success": True, "data": None, "message": f"{user.full_name} movido a papelera"}


@router.get("/users/trash", response_model=dict)
def get_trash(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    users = (
        db.query(User)
        .filter(User.deleted_at != None)
        .order_by(User.deleted_at.desc())
        .all()
    )
    now = datetime.utcnow()
    result = []
    for u in users:
        days_left = max(0, 30 - (now - u.deleted_at).days)
        result.append({
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "deleted_at": u.deleted_at.isoformat(),
            "days_left": days_left,
            "expired": days_left == 0,
        })
    return {"success": True, "data": result, "message": ""}


@router.post("/users/{user_id}/restore", response_model=dict)
def restore_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    user = db.query(User).filter(User.id == user_id, User.deleted_at != None).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en papelera")
    user.deleted_at = None
    db.commit()
    return {"success": True, "data": None, "message": f"{user.full_name} restaurado exitosamente"}


@router.get("/sub-admins", response_model=dict)
def list_sub_admins(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin)
):
    linked_ids = {r.sub_admin_id for r in db.query(AdminSubAdmin).filter(AdminSubAdmin.admin_id == _admin.id).all()}
    sub_admins = db.query(User).filter(
        User.id.in_(linked_ids),
        User.role == "sub_admin",
        User.is_active == True,
        User.deleted_at == None,
    ).all()
    result = []
    for sa in sub_admins:
        result.append({
            "id": sa.id,
            "full_name": sa.full_name,
            "email": sa.email,
            "managed_countries": _sub_admin_countries(db, sa.id),
        })
    return {"success": True, "data": result, "message": ""}


# ── Banks ─────────────────────────────────────────────────

@router.get("/banks", response_model=dict)
def get_banks(
    country: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Bank).filter(Bank.active == True)
    if country:
        q = q.filter(Bank.country == country)
    banks = q.order_by(Bank.country, Bank.name).all()
    return {
        "success": True,
        "data": [{"id": b.id, "name": b.name, "country": b.country} for b in banks],
        "message": ""
    }


@router.delete("/orders/{order_id}", response_model=dict)
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    order = db.query(Order).filter(Order.id == order_id, Order.deleted_at == None).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    order.deleted_at = datetime.utcnow()
    db.commit()
    return {"success": True, "data": None, "message": f"Orden {order.order_number} movida a papelera"}


@router.post("/orders/{order_id}/restore", response_model=dict)
def restore_order(
    order_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    order = db.query(Order).filter(Order.id == order_id, Order.deleted_at != None).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada en papelera")
    order.deleted_at = None
    db.commit()
    return {"success": True, "data": None, "message": f"Orden {order.order_number} restaurada"}


# ── Invite Codes ───────────────────────────────────────────

class InviteCodeCreate(BaseModel):
    email: str


@router.post("/invite-codes", response_model=dict)
def create_invite_code(
    data: InviteCodeCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    code = secrets.token_urlsafe(6).upper()[:8]
    invite = InviteCode(
        code=code,
        email=data.email.strip().lower(),
        super_admin_id=_admin.id,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    from urllib.parse import quote
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
    reg_url = f"{frontend_url}/login?mode=register&code={code}&email={quote(invite.email)}"
    return {
        "success": True,
        "data": {
            "id": invite.id,
            "code": invite.code,
            "email": invite.email,
            "registration_url": reg_url,
            "is_used": invite.is_used,
            "created_at": invite.created_at.isoformat() if invite.created_at else None,
        },
        "message": "Código generado exitosamente",
    }


@router.get("/invite-codes", response_model=dict)
def list_invite_codes(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    codes = db.query(InviteCode).filter(
        InviteCode.super_admin_id == _admin.id
    ).order_by(InviteCode.created_at.desc()).all()
    from urllib.parse import quote
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
    result = []
    for c in codes:
        used_by_name = None
        if c.used_by_id:
            u = db.query(User).filter(User.id == c.used_by_id).first()
            used_by_name = u.full_name if u else None
        result.append({
            "id": c.id,
            "code": c.code,
            "email": c.email,
            "is_used": c.is_used,
            "used_by_name": used_by_name,
            "registration_url": f"{frontend_url}/login?mode=register&code={c.code}&email={quote(c.email)}",
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })
    return {"success": True, "data": result, "message": ""}


# ── Sub-admin sharing ──────────────────────────────────────

@router.post("/sub-admins/{sub_admin_id}/link", response_model=dict)
def link_sub_admin(
    sub_admin_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    sub = db.query(User).filter(User.id == sub_admin_id, User.role == "sub_admin").first()
    if not sub:
        raise HTTPException(status_code=404, detail="Sub-admin no encontrado")
    existing = db.query(AdminSubAdmin).filter(
        AdminSubAdmin.admin_id == _admin.id,
        AdminSubAdmin.sub_admin_id == sub_admin_id,
    ).first()
    if not existing:
        db.add(AdminSubAdmin(admin_id=_admin.id, sub_admin_id=sub_admin_id))
        db.commit()
    return {"success": True, "data": None, "message": "Sub-admin vinculado"}


@router.get("/sub-admins/available", response_model=dict)
def list_available_sub_admins(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    all_sub_admins = db.query(User).filter(
        User.role == "sub_admin",
        User.is_active == True,
        User.deleted_at == None,
    ).all()
    linked = {r.sub_admin_id for r in db.query(AdminSubAdmin).filter(AdminSubAdmin.admin_id == _admin.id).all()}
    result = []
    for sa in all_sub_admins:
        result.append({
            "id": sa.id,
            "full_name": sa.full_name,
            "email": sa.email,
            "managed_countries": _sub_admin_countries(db, sa.id),
            "linked": sa.id in linked,
        })
    return {"success": True, "data": result, "message": ""}
