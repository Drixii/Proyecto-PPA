import os
import uuid
import secrets
import string
from utils.image import validate_and_convert
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models.point import PointAccount, PointTransaction, PointReward, PointRedemption
from models.user import User
from models.order import Order
from models.setting import Setting
from auth.dependencies import get_current_user, require_super_admin

router = APIRouter(prefix="/api", tags=["points"])

_DEFAULTS = {"points_fee_pct": "10", "points_clp_rate": "50"}
REWARDS_DIR = "uploads/rewards"
os.makedirs(REWARDS_DIR, exist_ok=True)


def _setting(db: Session, key: str) -> str:
    row = db.query(Setting).filter(Setting.key == key).first()
    return row.value if row else _DEFAULTS.get(key, "0")


def _set_setting(db: Session, key: str, value: str):
    row = db.query(Setting).filter(Setting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))


def _get_or_create_account(db: Session, user_id: int) -> PointAccount:
    acc = db.query(PointAccount).filter(PointAccount.user_id == user_id).first()
    if not acc:
        acc = PointAccount(user_id=user_id, total_points=0)
        db.add(acc)
        db.commit()
        db.refresh(acc)
    return acc


def _txn_to_dict(t: PointTransaction) -> dict:
    return {
        "id": t.id, "points": t.points, "type": t.type,
        "description": t.description, "order_id": t.order_id,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _reward_to_dict(r: PointReward, clp_rate: float = 0, include_clp: bool = False) -> dict:
    d = {
        "id": r.id, "name": r.name, "description": r.description,
        "points_cost": r.points_cost, "active": r.active,
        "image_url": f"/uploads/rewards/{r.image_filename}" if r.image_filename else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
    if include_clp:
        d["clp_equivalent"] = r.points_cost * clp_rate
    return d


def _generate_code() -> str:
    chars = string.ascii_uppercase + string.digits
    p1 = "".join(secrets.choice(chars) for _ in range(4))
    p2 = "".join(secrets.choice(chars) for _ in range(4))
    return f"KSA-{p1}-{p2}"


def _redemption_to_dict(r: PointRedemption) -> dict:
    return {
        "id": r.id, "reward_id": r.reward_id, "reward_name": r.reward_name,
        "code": r.code, "points_used": r.points_used, "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


# ── Client ────────────────────────────────────────────────

@router.get("/points/my")
def get_my_points(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = _get_or_create_account(db, current_user.id)
    txns = (db.query(PointTransaction)
            .filter(PointTransaction.account_id == acc.id)
            .order_by(PointTransaction.created_at.desc()).limit(20).all())
    return {"data": {"total_points": acc.total_points, "transactions": [_txn_to_dict(t) for t in txns]}}


@router.get("/points/rewards")
def get_rewards_public(db: Session = Depends(get_db)):
    rewards = db.query(PointReward).filter(PointReward.active == True).order_by(PointReward.points_cost).all()
    return {"data": [_reward_to_dict(r) for r in rewards]}


@router.get("/points/my-redemptions")
def get_my_redemptions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    items = (db.query(PointRedemption)
             .filter(PointRedemption.user_id == current_user.id)
             .order_by(PointRedemption.created_at.desc()).all())
    return {"data": [_redemption_to_dict(r) for r in items]}


class RedeemRequest(BaseModel):
    reward_id: int


@router.post("/points/redeem")
def redeem_reward(body: RedeemRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    reward = db.query(PointReward).filter(PointReward.id == body.reward_id, PointReward.active == True).first()
    if not reward:
        raise HTTPException(404, "Canjeable no encontrado o inactivo")
    acc = _get_or_create_account(db, current_user.id)
    if acc.total_points < reward.points_cost:
        raise HTTPException(400, f"Puntos insuficientes. Tienes {acc.total_points}, necesitas {reward.points_cost}")
    code = _generate_code()
    while db.query(PointRedemption).filter(PointRedemption.code == code).first():
        code = _generate_code()
    acc.total_points -= reward.points_cost
    db.add(PointTransaction(
        account_id=acc.id, order_id=None, points=-reward.points_cost,
        type="redeemed", description=f"Canje: {reward.name}",
    ))
    redemption = PointRedemption(
        user_id=current_user.id, reward_id=reward.id,
        reward_name=reward.name, code=code,
        points_used=reward.points_cost, status="pending",
    )
    db.add(redemption)
    db.commit()
    db.refresh(redemption)
    return {"data": _redemption_to_dict(redemption)}


# ── Admin ─────────────────────────────────────────────────

class PointsConfigUpdate(BaseModel):
    points_fee_pct: Optional[float] = None
    points_clp_rate: Optional[float] = None


class RewardCreate(BaseModel):
    name: str
    description: Optional[str] = None
    points_cost: int
    active: bool = True


class ManualAwardRequest(BaseModel):
    points: int
    description: Optional[str] = None


@router.get("/admin/points/config")
def get_points_config(db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    return {"data": {
        "points_fee_pct": float(_setting(db, "points_fee_pct")),
        "points_clp_rate": float(_setting(db, "points_clp_rate")),
    }}


@router.put("/admin/points/config")
def update_points_config(body: PointsConfigUpdate, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    if body.points_fee_pct is not None:
        _set_setting(db, "points_fee_pct", str(body.points_fee_pct))
    if body.points_clp_rate is not None:
        _set_setting(db, "points_clp_rate", str(body.points_clp_rate))
    db.commit()
    return {"data": {"ok": True}}


@router.get("/admin/points")
def get_all_points(db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    clp_rate = float(_setting(db, "points_clp_rate"))
    rows = (db.query(PointAccount, User)
            .join(User, User.id == PointAccount.user_id)
            .filter(User.role == "client")
            .order_by(PointAccount.total_points.desc()).all())

    account_ids = [acc.id for acc, _ in rows]
    txns_map: dict[int, list] = {acc.id: [] for acc, _ in rows}
    if account_ids:
        earned_txns = (db.query(PointTransaction, Order)
                       .outerjoin(Order, Order.id == PointTransaction.order_id)
                       .filter(
                           PointTransaction.account_id.in_(account_ids),
                           PointTransaction.type == "earned",
                       )
                       .order_by(PointTransaction.created_at.desc()).all())
        for t, o in earned_txns:
            txns_map[t.account_id].append({
                "txn_id": t.id,
                "points": t.points,
                "order_number": o.order_number if o else None,
                "amount_sent": o.amount_sent if o else None,
                "currency_from": o.currency_from if o else None,
                "receiver_country": o.receiver_country if o else None,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            })

    return {"data": {
        "clp_rate": clp_rate,
        "accounts": [
            {
                "user_id": u.id, "full_name": u.full_name, "email": u.email,
                "total_points": acc.total_points, "clp_equivalent": acc.total_points * clp_rate,
                "transactions": txns_map.get(acc.id, []),
            }
            for acc, u in rows
        ],
    }}


@router.get("/admin/points/{user_id}")
def get_user_points(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    acc = _get_or_create_account(db, user_id)
    clp_rate = float(_setting(db, "points_clp_rate"))
    txns = (db.query(PointTransaction)
            .filter(PointTransaction.account_id == acc.id)
            .order_by(PointTransaction.created_at.desc()).limit(10).all())
    return {"data": {
        "user_id": user_id, "full_name": user.full_name,
        "total_points": acc.total_points, "clp_equivalent": acc.total_points * clp_rate,
        "clp_rate": clp_rate, "transactions": [_txn_to_dict(t) for t in txns],
    }}


@router.post("/admin/points/{user_id}/award")
def award_points_manual(user_id: int, body: ManualAwardRequest, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    acc = _get_or_create_account(db, user_id)
    acc.total_points += body.points
    db.add(PointTransaction(
        account_id=acc.id, points=body.points, type="manual",
        description=body.description or "Puntos otorgados manualmente",
    ))
    db.commit()
    return {"data": {"total_points": acc.total_points}}


@router.get("/admin/rewards")
def get_rewards_admin(db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    clp_rate = float(_setting(db, "points_clp_rate"))
    rewards = db.query(PointReward).order_by(PointReward.points_cost).all()
    return {"data": {
        "clp_rate": clp_rate,
        "rewards": [_reward_to_dict(r, clp_rate, include_clp=True) for r in rewards],
    }}


@router.post("/admin/rewards")
def create_reward(body: RewardCreate, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    reward = PointReward(name=body.name, description=body.description, points_cost=body.points_cost, active=body.active)
    db.add(reward)
    db.commit()
    db.refresh(reward)
    return {"data": _reward_to_dict(reward)}


@router.put("/admin/rewards/{reward_id}")
def update_reward(reward_id: int, body: RewardCreate, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    r = db.query(PointReward).filter(PointReward.id == reward_id).first()
    if not r:
        raise HTTPException(404, "Recompensa no encontrada")
    r.name = body.name
    r.description = body.description
    r.points_cost = body.points_cost
    r.active = body.active
    db.commit()
    return {"data": _reward_to_dict(r)}


@router.post("/admin/rewards/{reward_id}/image")
async def upload_reward_image(reward_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    r = db.query(PointReward).filter(PointReward.id == reward_id).first()
    if not r:
        raise HTTPException(404, "Recompensa no encontrada")
    ext = os.path.splitext(file.filename or "img.jpg")[1].lower() or ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        raise HTTPException(400, "Formato no permitido. Usar jpg, png, webp o gif")
    if r.image_filename:
        old = os.path.join(REWARDS_DIR, r.image_filename)
        if os.path.exists(old):
            os.remove(old)
    content = await file.read()
    if ext != ".gif":
        content = validate_and_convert(content)
        ext = ".webp"
    filename = f"reward_{reward_id}_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(REWARDS_DIR, filename)
    with open(path, "wb") as f:
        f.write(content)
    r.image_filename = filename
    db.commit()
    return {"data": {"image_url": f"/uploads/rewards/{filename}"}}


@router.delete("/admin/rewards/{reward_id}")
def delete_reward(reward_id: int, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    r = db.query(PointReward).filter(PointReward.id == reward_id).first()
    if not r:
        raise HTTPException(404, "Recompensa no encontrada")
    if r.image_filename:
        path = os.path.join(REWARDS_DIR, r.image_filename)
        if os.path.exists(path):
            os.remove(path)
    db.delete(r)
    db.commit()
    return {"data": {"ok": True}}


@router.get("/admin/points/redemptions")
def get_all_redemptions(db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    items = (db.query(PointRedemption, User)
             .join(User, User.id == PointRedemption.user_id)
             .order_by(PointRedemption.created_at.desc()).all())
    return {"data": [
        {**_redemption_to_dict(r), "user_name": u.full_name, "user_email": u.email}
        for r, u in items
    ]}


@router.post("/admin/points/redemptions/{redemption_id}/use")
def mark_redemption_used(redemption_id: int, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    r = db.query(PointRedemption).filter(PointRedemption.id == redemption_id).first()
    if not r:
        raise HTTPException(404, "Canje no encontrado")
    r.status = "used"
    db.commit()
    return {"data": {"ok": True}}
