import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case
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
from models.commission_rule import CommissionRule
from models.country import Country
from schemas.order import OrderOut, OrderStatusUpdate
from datetime import datetime, timedelta
from services.order_service import advance_order_status, find_sub_admin_for_country
from auth.dependencies import require_admin, require_super_admin
from passlib.context import CryptContext
from utils.timezones import country_to_tz
import secrets, os

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter(prefix="/api/admin", tags=["admin"])
log = logging.getLogger("ppa")

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


def _own_order_or_404(db: Session, order_id: int, admin: User) -> Order:
    """Orden del admin que pregunta, o 404.

    La lista ya filtra por super_admin_id, así que un admin no ve las órdenes
    del otro — pero eso es solo la pantalla. Estos endpoints buscaban la orden
    por id a secas, de modo que con el id a mano un super-admin podía aprobar
    o mover la orden de otro. 404 y no 403: si no es suya, para él no existe.
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.super_admin_id == admin.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return order


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
    paid_only: bool = False,
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

    # Órdenes cuyo dinero ya entró. 'pendiente_pago' es una tarjeta creada y
    # sin cobrar: aparece en el pipeline, donde se ve el flujo, pero no en la
    # lista de órdenes ni en los totales, que son el registro de lo recibido.
    if paid_only:
        query = query.filter(Order.status != "pendiente_pago")

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

    # Totales por moneda. Se calculan aquí, sobre la consulta completa, y no
    # sumando los items en el frontend: esa lista viene paginada, así que a
    # partir de page_size órdenes el total mostrado sería menor que el real.
    # Agrupado por moneda porque el cliente elige la divisa de origen
    # (CLP, COP, USD, EUR...) y sumar montos de monedas distintas no significa
    # nada.
    filas = (
            query.order_by(None)  # el ORDER BY created_at rompe el GROUP BY
            .with_entities(
                Order.currency_from,
                func.count(Order.id),
                func.sum(Order.amount_sent),
                func.count(case((Order.status == "completado", Order.id))),
                func.sum(case((Order.status == "completado", Order.amount_sent), else_=0)),
            )
        .group_by(Order.currency_from)
        .all()
    )

    # Cada moneda, además, convertida a pesos chilenos. Un panel con "320.000
    # CLP" y "20.000 USD" en columnas separadas no dice cuánto se movió: hay
    # que sumarlo de cabeza a la tasa del día. Con el equivalente calculado, el
    # desglose pasa a ser el detalle y no la única lectura posible.
    from services.exchange_service import get_rate

    totals = []
    total_clp = 0.0
    for row in filas:
        moneda = row[0]
        monto = float(row[2] or 0)
        completado = float(row[4] or 0)
        tasa = 1.0 if moneda == "CLP" else (get_rate(db, moneda, "CLP") or 0)
        equivalente = monto * tasa if tasa else None
        if equivalente:
            total_clp += equivalente
        totals.append({
            "currency": moneda,
            "count": row[1],
            "amount_sent": monto,
            "completed_count": row[3],
            "completed_amount_sent": completado,
            "amount_clp": equivalente,
        })
    totals.sort(key=lambda t: t["amount_clp"] or t["amount_sent"], reverse=True)

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
            "totals": totals,
            "total_clp": total_clp,
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
    order = _own_order_or_404(db, order_id, _admin)
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
    order = _own_order_or_404(db, order_id, _admin)
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
    order = _own_order_or_404(db, order_id, _admin)
    if order.status != "en_aprobacion":
        raise HTTPException(status_code=400, detail="La orden no está pendiente de aprobación")
    if not order.payment_proof:
        raise HTTPException(status_code=400, detail="La orden no tiene comprobante adjunto")

    # Aprobar el comprobante no siempre libera el envío: si es el primero de un
    # cliente nuevo y pasa del límite, queda retenido para una segunda mirada.
    # El admin acaba de comprobar que el dinero entró, no quién lo mandó.
    from services import retencion_service
    retener, motivo = retencion_service.evaluar(db, order)

    old_status = order.status
    if retener:
        order.status = "retenido"
        order.hold_reason = motivo
        order.sub_admin_id = None
        sub_admin_id = None
    else:
        sub_admin_id = find_sub_admin_for_country(db, order.receiver_country, order.super_admin_id)
        order.status = "en_proceso"
        order.sub_admin_id = sub_admin_id
    db.commit()
    db.refresh(order)

    try:
        from services.notification_service import notify_status_change, notify_sub_admin
        notify_status_change(db, order, old_status, order.status)
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


class RejectBody(BaseModel):
    reason: str


@router.post("/orders/{order_id}/reject", response_model=dict)
def reject_order(
    order_id: int,
    data: RejectBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    """Rechaza el comprobante. No cierra la orden: el cliente puede subir otro.

    El caso normal es un comprobante ilegible o con un monto que no cuadra, no
    un fraude. Al subir uno nuevo (routers/orders.py) la orden vuelve sola a
    en_aprobacion y reaparece en el panel.
    """
    reason = (data.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Escribe el motivo del rechazo")

    order = _own_order_or_404(db, order_id, _admin)
    if order.status != "en_aprobacion":
        raise HTTPException(status_code=400, detail="La orden no está pendiente de aprobación")

    order.status = "rechazado"
    order.rejection_reason = reason
    db.commit()
    db.refresh(order)

    try:
        from services.notification_service import notify
        notify(
            db, order.client_id, order.id, "status_change",
            title=f"Comprobante rechazado: {order.order_number}",
            body=f"{reason} · Sube un comprobante nuevo para reintentar",
        )
    except Exception as e:
        print(f"[notify reject] {e}")

    return {
        "success": True,
        "data": _order_with_bank(order, db),
        "message": "Comprobante rechazado — el cliente puede subir otro",
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
        Order.created_at >= today_start, Order.created_at <= today_end,
        Order.super_admin_id == _admin.id,
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
    from datetime import timezone as _tz
    user.password = pwd_context.hash(data.new_password)
    user.must_change_password = True  # Fuerza al usuario a cambiar en próximo login
    # Invalida sus sesiones abiertas: entra de nuevo y ve el aviso al instante.
    user.password_changed_at = datetime.now(_tz.utc)
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
    trusted: bool = False


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
        trusted=bool(data.trusted),
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


# ── Commission rules ──────────────────────────────────────────────────────────

COMMISSION_CURRENCIES = ["CLP", "COP", "USD", "EUR", "PEN", "BRL", "MXN", "ARS", "CAD", "VES"]

CURRENCY_LABELS = {
    "CLP": "Chile (CLP)", "COP": "Colombia (COP)", "USD": "EE.UU. (USD)",
    "EUR": "España/Europa (EUR)", "PEN": "Perú (PEN)", "BRL": "Brasil (BRL)",
    "MXN": "México (MXN)", "ARS": "Argentina (ARS)", "CAD": "Canadá (CAD)",
    "VES": "Venezuela (VES)",
}

CURRENCY_FLAGS = {
    "CLP": "🇨🇱", "COP": "🇨🇴", "USD": "🇺🇸", "EUR": "🇪🇸",
    "PEN": "🇵🇪", "BRL": "🇧🇷", "MXN": "🇲🇽", "ARS": "🇦🇷",
    "CAD": "🇨🇦", "VES": "🇻🇪",
}


class CommissionRuleIn(BaseModel):
    from_currency: str
    to_currency: str
    commission_pct: float
    apply_to_all: bool = False


class CommissionRuleDelete(BaseModel):
    from_currency: str
    to_currency: str


@router.get("/commissions", response_model=dict)
def get_commissions(db: Session = Depends(get_db), admin: User = Depends(require_super_admin)):
    global_default = float(_get_setting(db, "commission_pct") or "1.5")

    # Reglas específicas (from→to real)
    global_rules = {
        f"{r.from_currency}_{r.to_currency}": r.commission_pct
        for r in db.query(CommissionRule).filter(
            CommissionRule.super_admin_id == None,
            CommissionRule.to_currency != '*',
        ).all()
    }
    my_rules = {
        f"{r.from_currency}_{r.to_currency}": r.commission_pct
        for r in db.query(CommissionRule).filter(
            CommissionRule.super_admin_id == admin.id,
            CommissionRule.to_currency != '*',
        ).all()
    }

    # % base por país origen (to_currency='*')
    my_from_defaults = {
        r.from_currency: r.commission_pct
        for r in db.query(CommissionRule).filter(
            CommissionRule.super_admin_id == admin.id,
            CommissionRule.to_currency == '*',
        ).all()
    }
    global_from_defaults = {
        r.from_currency: r.commission_pct
        for r in db.query(CommissionRule).filter(
            CommissionRule.super_admin_id == None,
            CommissionRule.to_currency == '*',
        ).all()
    }

    def _effective(fc, tc):
        k = f"{fc}_{tc}"
        if k in my_rules:
            return my_rules[k], "mine"
        if k in global_rules:
            return global_rules[k], "global_rule"
        if fc in my_from_defaults:
            return my_from_defaults[fc], "from_default_mine"
        if fc in global_from_defaults:
            return global_from_defaults[fc], "from_default_global"
        return global_default, "default"

    matrix = []
    for fc in COMMISSION_CURRENCIES:
        for tc in COMMISSION_CURRENCIES:
            if fc == tc:
                continue
            eff, src = _effective(fc, tc)
            matrix.append({
                "from_currency": fc,
                "to_currency": tc,
                "from_label": CURRENCY_LABELS.get(fc, fc),
                "to_label": CURRENCY_LABELS.get(tc, tc),
                "from_flag": CURRENCY_FLAGS.get(fc, ""),
                "to_flag": CURRENCY_FLAGS.get(tc, ""),
                "my_pct": my_rules.get(f"{fc}_{tc}"),
                "global_pct": global_rules.get(f"{fc}_{tc}"),
                "effective_pct": eff,
                "source": src,
            })

    return {
        "success": True,
        "data": {
            "matrix": matrix,
            "global_default": global_default,
            "my_from_defaults": my_from_defaults,
            "global_from_defaults": global_from_defaults,
            "currencies": COMMISSION_CURRENCIES,
            "labels": CURRENCY_LABELS,
            "flags": CURRENCY_FLAGS,
        },
        "message": "",
    }


@router.get("/commissions/all-rates", response_model=dict)
def get_all_rates_for_base(
    from_currency: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    from services.exchange_service import get_rate
    rates = {}
    for tc in COMMISSION_CURRENCIES:
        if tc == from_currency:
            continue
        r = get_rate(db, from_currency, tc)
        rates[tc] = r
    return {"success": True, "data": rates, "message": ""}


@router.put("/commissions", response_model=dict)
def set_commission_rule(
    data: CommissionRuleIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    if data.from_currency == data.to_currency:
        raise HTTPException(400, "from y to no pueden ser iguales")
    if data.commission_pct < 0 or data.commission_pct > 100:
        raise HTTPException(400, "Comisión debe estar entre 0 y 100")

    def _upsert(to_currency: str):
        rule = db.query(CommissionRule).filter(
            CommissionRule.super_admin_id == admin.id,
            CommissionRule.from_currency == data.from_currency,
            CommissionRule.to_currency == to_currency,
        ).first()
        if rule:
            rule.commission_pct = data.commission_pct
            rule.updated_at = datetime.utcnow()
        else:
            db.add(CommissionRule(
                super_admin_id=admin.id,
                from_currency=data.from_currency,
                to_currency=to_currency,
                commission_pct=data.commission_pct,
            ))

    if data.apply_to_all:
        # "Aplicar a todos" = el mismo % para TODOS LOS DESTINOS de esta
        # moneda de origen, solo para quien lo pulsa.
        #
        # Antes significaba otra cosa: escribía una regla global y una por
        # cada super-admin del sistema, así que un admin cambiaba en silencio
        # los precios de los demás. Con un solo admin no se notaba; con dos es
        # justo lo contrario del aislamiento que tiene el resto del panel.
        destinos = [
            c.currency for c in db.query(Country).filter(
                Country.active == True, Country.can_receive == True
            ).all()
        ]
        for to_cur in {d for d in destinos if d != data.from_currency}:
            _upsert(to_cur)
    else:
        _upsert(data.to_currency)

    db.commit()
    return {"success": True, "data": {}, "message": "Comisión guardada"}


# ── Países ────────────────────────────────────────────────
# Lista única para toda la plataforma, no por super-admin: el calculador del
# home es público y no tiene forma de saber de qué admin mostrar los países.


class CountryCreate(BaseModel):
    name: str
    currency: str
    iso2: str
    can_send: bool = False
    can_receive: bool = True


class CountryUpdate(BaseModel):
    name: Optional[str] = None
    currency: Optional[str] = None
    iso2: Optional[str] = None
    can_send: Optional[bool] = None
    can_receive: Optional[bool] = None
    active: Optional[bool] = None


def _country_dict(c: Country) -> dict:
    return {
        "id": c.id, "name": c.name, "currency": c.currency, "iso2": c.iso2,
        "can_send": c.can_send, "can_receive": c.can_receive, "active": c.active,
    }


@router.get("/countries", response_model=dict)
def list_countries(db: Session = Depends(get_db), _admin: User = Depends(require_super_admin)):
    rows = db.query(Country).order_by(Country.name).all()
    return {"success": True, "data": [_country_dict(c) for c in rows], "message": ""}


@router.post("/countries", response_model=dict)
def create_country(
    data: CountryCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    name = data.name.strip()
    iso2 = data.iso2.strip().lower()
    currency = data.currency.strip().upper()
    if not name or not currency:
        raise HTTPException(status_code=400, detail="Nombre y moneda son obligatorios")
    # iso2 obligatorio y de dos letras: es lo que dibuja la bandera. Sin él el
    # país sale sin bandera en los desplegables.
    if len(iso2) != 2 or not iso2.isalpha():
        raise HTTPException(status_code=400, detail="El código de bandera debe ser de 2 letras (ej: cl, co)")
    if db.query(Country).filter(func.lower(Country.name) == name.lower()).first():
        raise HTTPException(status_code=400, detail=f"Ya existe un país llamado {name}")

    country = Country(
        name=name, currency=currency, iso2=iso2,
        can_send=data.can_send, can_receive=data.can_receive, active=True,
    )
    db.add(country)
    db.commit()
    db.refresh(country)
    return {"success": True, "data": _country_dict(country), "message": f"{name} añadido"}


@router.patch("/countries/{country_id}", response_model=dict)
def update_country(
    country_id: int,
    data: CountryUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    country = db.query(Country).filter(Country.id == country_id).first()
    if not country:
        raise HTTPException(status_code=404, detail="País no encontrado")

    if data.name is not None:
        country.name = data.name.strip()
    if data.currency is not None:
        country.currency = data.currency.strip().upper()
    if data.iso2 is not None:
        iso2 = data.iso2.strip().lower()
        if len(iso2) != 2 or not iso2.isalpha():
            raise HTTPException(status_code=400, detail="El código de bandera debe ser de 2 letras")
        country.iso2 = iso2
    if data.can_send is not None:
        country.can_send = data.can_send
    if data.can_receive is not None:
        country.can_receive = data.can_receive
    if data.active is not None:
        country.active = data.active

    db.commit()
    db.refresh(country)
    return {"success": True, "data": _country_dict(country), "message": "País actualizado"}


@router.delete("/countries/{country_id}", response_model=dict)
def delete_country(
    country_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_super_admin),
):
    """Desactiva el país en vez de borrarlo.

    Las órdenes guardan el país como texto (`receiver_country`), así que
    borrar la fila dejaría el historial mostrando países que ya no existen y
    los sub-admins asignados a ese país sin referencia. Desactivar lo saca de
    los desplegables y conserva todo lo demás.
    """
    country = db.query(Country).filter(Country.id == country_id).first()
    if not country:
        raise HTTPException(status_code=404, detail="País no encontrado")
    country.active = False
    db.commit()
    return {"success": True, "data": _country_dict(country), "message": f"{country.name} desactivado"}


@router.delete("/commissions", response_model=dict)
def delete_commission_rule(
    data: CommissionRuleDelete,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    db.query(CommissionRule).filter(
        CommissionRule.super_admin_id == admin.id,
        CommissionRule.from_currency == data.from_currency,
        CommissionRule.to_currency == data.to_currency,
    ).delete()
    db.commit()
    return {"success": True, "data": {}, "message": "Regla eliminada"}


@router.get("/commissions/preview", response_model=dict)
def preview_commission(
    from_currency: str,
    to_currency: str,
    amount: float,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    from services.order_service import _get_commission
    from services.exchange_service import get_rate
    pct = _get_commission(db, from_currency, to_currency, admin.id)
    rate = get_rate(db, from_currency, to_currency)
    fee = round(amount * pct / 100, 2)
    net = amount - fee
    received = round(net * rate, 2) if rate else None
    return {
        "success": True,
        "data": {
            "from_currency": from_currency,
            "to_currency": to_currency,
            "amount": amount,
            "commission_pct": pct,
            "fee": fee,
            "net_amount": net,
            "rate": rate,
            "amount_received": received,
        },
        "message": "",
    }


# ── Retenciones ───────────────────────────────────────────────

class LiberarIn(BaseModel):
    confiable: bool = False


class RechazarRetenidaIn(BaseModel):
    motivo: str


@router.get("/holds", response_model=dict)
def listar_retenciones(
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Envíos detenidos esperando revisión.

    Solo los de los clientes de este super-admin: una retención incluye el
    nombre del receptor y el monto, y eso no se comparte entre cuentas.
    """
    filas = db.query(Order).filter(
        Order.status == "retenido",
        Order.deleted_at == None,
        Order.super_admin_id == admin.id,
    ).order_by(Order.created_at.desc()).all()

    salida = []
    for o in filas:
        cliente = db.query(User).filter(User.id == o.client_id).first()
        salida.append({
            "id": o.id,
            "order_number": o.order_number,
            "amount_sent": o.amount_sent,
            "currency_from": o.currency_from,
            "amount_received": o.amount_received,
            "currency_to": o.currency_to,
            "receiver_name": o.receiver_name,
            "receiver_country": o.receiver_country,
            "receiver_id_num": o.receiver_id_num,
            "payment_method": o.payment_method,
            "hold_reason": o.hold_reason,
            "paid_at": o.paid_at.isoformat() if o.paid_at else None,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "cliente": {
                "id": cliente.id if cliente else None,
                "full_name": cliente.full_name if cliente else None,
                "email": cliente.email if cliente else None,
                "phone": cliente.phone if cliente else None,
                "document_type": getattr(cliente, "document_type", None) if cliente else None,
                "document_number": getattr(cliente, "document_number", None) if cliente else None,
                "email_verified": bool(getattr(cliente, "email_verified_at", None)) if cliente else False,
                "is_trusted": bool(getattr(cliente, "is_trusted", False)) if cliente else False,
            } if cliente else None,
        })

    return {"success": True, "data": salida, "message": ""}


@router.post("/holds/{order_id}/release", response_model=dict)
def liberar_retencion(
    order_id: int,
    data: LiberarIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Deja pasar el envío: se asigna encargado y sigue su curso normal."""
    from datetime import datetime, timezone

    order = db.query(Order).filter(
        Order.id == order_id,
        Order.status == "retenido",
        Order.deleted_at == None,
        Order.super_admin_id == admin.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Retención no encontrada")

    order.status = "en_proceso"
    order.sub_admin_id = find_sub_admin_for_country(db, order.receiver_country, order.super_admin_id)
    order.released_at = datetime.now(timezone.utc)
    order.released_by_id = admin.id

    # Marcar al cliente como confiable es opcional y va aquí a propósito: es
    # el momento en que alguien acaba de comprobar quién es. Sus próximos
    # envíos ya no se retienen.
    if data.confiable and order.client_id:
        cliente = db.query(User).filter(User.id == order.client_id).first()
        if cliente:
            cliente.is_trusted = True

    db.commit()
    db.refresh(order)

    try:
        from services.notification_service import notify_status_change, notify_sub_admin
        notify_status_change(db, order, "retenido", "en_proceso")
        if order.sub_admin_id:
            notify_sub_admin(db, order, order.sub_admin_id)
    except Exception as e:
        log.error("[retencion] liberada pero fallaron las notificaciones: %s", e)

    return {"success": True, "data": None, "message": f"{order.order_number} liberada"}


@router.post("/holds/{order_id}/reject", response_model=dict)
def rechazar_retencion(
    order_id: int,
    data: RechazarRetenidaIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Rechaza el envío retenido.

    No devuelve el dinero: eso se hace fuera, por el mismo medio por el que
    entró. Aquí solo se deja constancia de que no se va a entregar.
    """
    motivo = (data.motivo or "").strip()
    if not motivo:
        raise HTTPException(status_code=400, detail="Escribe el motivo del rechazo")

    order = db.query(Order).filter(
        Order.id == order_id,
        Order.status == "retenido",
        Order.deleted_at == None,
        Order.super_admin_id == admin.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Retención no encontrada")

    order.status = "rechazado"
    order.rejection_reason = motivo
    db.commit()

    try:
        from services.notification_service import notify_status_change
        notify_status_change(db, order, "retenido", "rechazado")
    except Exception as e:
        log.error("[retencion] rechazada pero fallaron las notificaciones: %s", e)

    return {"success": True, "data": None, "message": f"{order.order_number} rechazada"}


class ConfiableIn(BaseModel):
    is_trusted: bool


@router.put("/users/{user_id}/trusted", response_model=dict)
def marcar_confiable(
    user_id: int,
    data: ConfiableIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    """Marca o desmarca a un cliente como confiable."""
    cliente = db.query(User).filter(
        User.id == user_id,
        User.deleted_at == None,
    ).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    if cliente.role == "client" and cliente.super_admin_id != admin.id:
        raise HTTPException(status_code=403, detail="Ese cliente no es tuyo")

    cliente.is_trusted = bool(data.is_trusted)
    db.commit()
    return {
        "success": True,
        "data": {"is_trusted": cliente.is_trusted},
        "message": "Cliente marcado como confiable" if cliente.is_trusted else "Marca de confianza retirada",
    }
