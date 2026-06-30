from sqlalchemy.orm import Session
from models.order import Order
from models.user import User
from models.setting import Setting
from services.exchange_service import get_rate
from config import settings
from datetime import datetime, timezone
from typing import Optional


def _get_commission(db: Session, from_currency: str = None, to_currency: str = None, super_admin_id: int = None) -> float:
    from models.commission_rule import CommissionRule

    # 1. Regla específica del super admin para esta ruta
    if super_admin_id and from_currency and to_currency:
        rule = db.query(CommissionRule).filter(
            CommissionRule.super_admin_id == super_admin_id,
            CommissionRule.from_currency == from_currency,
            CommissionRule.to_currency == to_currency,
        ).first()
        if rule:
            return rule.commission_pct

    # 2. Regla global para esta ruta (super_admin_id IS NULL)
    if from_currency and to_currency:
        rule = db.query(CommissionRule).filter(
            CommissionRule.super_admin_id == None,
            CommissionRule.from_currency == from_currency,
            CommissionRule.to_currency == to_currency,
        ).first()
        if rule:
            return rule.commission_pct

    # 3. Comisión global genérica
    row = db.query(Setting).filter(Setting.key == "commission_pct").first()
    if row:
        try:
            return float(row.value)
        except ValueError:
            pass
    return settings.FEE_PERCENTAGE


def generate_order_number(db: Session) -> str:
    year = datetime.now().year
    count = db.query(Order).count() + 1
    return f"CC-{year}-{count:04d}"


def find_sub_admin_for_country(db: Session, country: str, super_admin_id: Optional[int] = None) -> Optional[int]:
    from models.sub_admin_country import SubAdminCountry
    from models.admin_sub_admin import AdminSubAdmin
    # Prefer sub-admin linked to this super admin
    if super_admin_id:
        linked = [r.sub_admin_id for r in db.query(AdminSubAdmin).filter(AdminSubAdmin.admin_id == super_admin_id).all()]
        if linked:
            row = (
                db.query(SubAdminCountry)
                .join(User, User.id == SubAdminCountry.user_id)
                .filter(
                    SubAdminCountry.country == country,
                    User.is_active == True,
                    User.role == "sub_admin",
                    User.id.in_(linked),
                )
                .first()
            )
            if row:
                return row.user_id
    # Fallback: any sub-admin for that country
    row = (
        db.query(SubAdminCountry)
        .join(User, User.id == SubAdminCountry.user_id)
        .filter(
            SubAdminCountry.country == country,
            User.is_active == True,
            User.role == "sub_admin",
        )
        .first()
    )
    return row.user_id if row else None


def create_order(db: Session, data, client: User) -> Order:
    rate = get_rate(db, data.currency_from, data.currency_to)
    if not rate:
        raise ValueError(f"Tasa no disponible: {data.currency_from} -> {data.currency_to}")

    client_super_admin_id = getattr(client, "super_admin_id", None)
    commission_pct = _get_commission(db, data.currency_from, data.currency_to, client_super_admin_id)
    fee = round(data.amount_sent * commission_pct / 100, 2)
    amount_received = round((data.amount_sent - fee) * rate, 2)

    # Tarjeta → en_proceso con sub_admin asignado. Transferencia → en_aprobacion (sin asignar aún).
    is_card = (getattr(data, "payment_method", None) or "").lower() == "tarjeta"
    initial_status = "en_proceso" if is_card else "en_aprobacion"
    sub_admin_id = find_sub_admin_for_country(db, data.receiver_country, client_super_admin_id) if is_card else None

    order = Order(
        order_number=generate_order_number(db),
        client_id=client.id,
        super_admin_id=client_super_admin_id,
        sender_name=data.sender_name,
        sender_id_type=data.sender_id_type,
        sender_id_num=data.sender_id_num,
        sender_phone=data.sender_phone,
        sender_country=data.sender_country,
        receiver_name=data.receiver_name,
        receiver_phone=data.receiver_phone,
        receiver_country=data.receiver_country,
        receiver_bank_id=data.receiver_bank_id,
        receiver_account=data.receiver_account,
        receiver_id_type=data.receiver_id_type,
        receiver_id_num=data.receiver_id_num,
        amount_sent=data.amount_sent,
        currency_from=data.currency_from,
        currency_to=data.currency_to,
        exchange_rate=rate,
        amount_received=amount_received,
        fee=fee,
        payment_method=data.payment_method,
        payment_bank=data.payment_bank,
        status=initial_status,
        sub_admin_id=sub_admin_id,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    try:
        from services.notification_service import notify_new_order
        notify_new_order(db, order)
    except Exception as e:
        print(f"[notify_new_order error] {e}")
        db.rollback()
    return order


STATUS_FLOW = ["en_aprobacion", "en_proceso", "completado"]


def _award_points(db: Session, order: Order):
    try:
        from models.point import PointAccount, PointTransaction
        fee_pct_row = db.query(Setting).filter(Setting.key == "points_fee_pct").first()
        fee_pct = float(fee_pct_row.value) if fee_pct_row else 10.0
        points = int(order.fee * fee_pct / 100)
        if points <= 0:
            return
        acc = db.query(PointAccount).filter(PointAccount.user_id == order.client_id).first()
        if not acc:
            acc = PointAccount(user_id=order.client_id, total_points=0)
            db.add(acc)
            db.flush()
        acc.total_points += points
        db.add(PointTransaction(
            account_id=acc.id,
            order_id=order.id,
            points=points,
            type="earned",
            description=f"Puntos por transferencia {order.order_number}",
        ))
        db.commit()
    except Exception as e:
        print(f"[award_points error] {e}")


def advance_order_status(db: Session, order: Order, new_status: str) -> Order:
    if new_status not in STATUS_FLOW:
        raise ValueError(f"Estado invalido: {new_status}")
    old_status = order.status
    order.status = new_status
    if new_status == "completado":
        order.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)
    if new_status == "completado" and old_status != "completado":
        _award_points(db, order)
    if old_status != new_status:
        try:
            from services.notification_service import notify_status_change
            notify_status_change(db, order, old_status, new_status)
        except Exception as e:
            print(f"[notify_status_change error] {e}")
            db.rollback()
    return order
