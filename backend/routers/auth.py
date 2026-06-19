from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from utils.image import validate_and_convert
from sqlalchemy.orm import Session
from passlib.context import CryptContext
import shutil, uuid, os
from database import get_db
from models.user import User
from schemas.user import UserCreate, UserLogin, UserOut, TokenOut
from auth.jwt import create_access_token
from auth.dependencies import get_current_user
from utils.timezones import country_to_tz


def _user_out(user: User, db: Session) -> dict:
    """Build UserOut dict including managed_countries for sub-admins."""
    data = UserOut.model_validate(user).model_dump()
    if user.role == 'sub_admin':
        from models.sub_admin_country import SubAdminCountry
        rows = db.query(SubAdminCountry).filter(SubAdminCountry.user_id == user.id).all()
        data['managed_countries'] = [r.country for r in rows]
    return data

router = APIRouter(prefix="/api/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/register", response_model=dict)
def register(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")
    hashed = pwd_context.hash(data.password)
    user = User(
        email=data.email,
        full_name=data.full_name,
        password=hashed,
        phone=data.phone,
        country=data.country,
        timezone=country_to_tz(data.country),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {
        "success": True,
        "data": {"access_token": token, "token_type": "bearer", "user": _user_out(user, db)},
        "message": "Cuenta creada exitosamente"
    }


@router.post("/login", response_model=dict)
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not pwd_context.verify(data.password, user.password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    if user.deleted_at is not None:
        raise HTTPException(status_code=403, detail="Cuenta eliminada")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {
        "success": True,
        "data": {"access_token": token, "token_type": "bearer", "user": _user_out(user, db)},
        "message": "Login exitoso"
    }


@router.get("/me", response_model=dict)
def get_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {
        "success": True,
        "data": _user_out(current_user, db),
        "message": ""
    }


from typing import Optional
from pydantic import BaseModel as PydanticBase

class ProfileUpdate(PydanticBase):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None
    timezone: Optional[str] = None


@router.patch("/profile", response_model=dict)
def update_profile(
    data: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if data.full_name is not None:
        current_user.full_name = data.full_name.strip()
    if data.phone is not None:
        current_user.phone = data.phone.strip() or None
    if data.country is not None:
        country = data.country.strip() or None
        current_user.country = country
        if country:
            current_user.timezone = country_to_tz(country)
    elif data.timezone is not None:
        current_user.timezone = data.timezone
    if data.new_password:
        if not data.current_password:
            raise HTTPException(status_code=400, detail="Debes ingresar tu contraseña actual")
        if not pwd_context.verify(data.current_password, current_user.password):
            raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
        if len(data.new_password) < 6:
            raise HTTPException(status_code=400, detail="La nueva contraseña debe tener al menos 6 caracteres")
        current_user.password = pwd_context.hash(data.new_password)
        current_user.must_change_password = False
    db.commit()
    db.refresh(current_user)
    return {
        "success": True,
        "data": _user_out(current_user, db),
        "message": "Perfil actualizado"
    }


@router.post("/profile/avatar", response_model=dict)
async def upload_avatar(
    avatar: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ext = os.path.splitext(avatar.filename or "")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        raise HTTPException(status_code=400, detail="Solo jpg/png/webp permitidos")
    content = await avatar.read()
    content = validate_and_convert(content, min_kb=5)
    filename = f"avatar_{current_user.id}_{uuid.uuid4().hex[:8]}.webp"
    os.makedirs("uploads/avatars", exist_ok=True)
    with open(f"uploads/avatars/{filename}", "wb") as f:
        f.write(content)
    current_user.avatar = filename
    db.commit()
    db.refresh(current_user)
    return {
        "success": True,
        "data": _user_out(current_user, db),
        "message": "Avatar actualizado"
    }


class ForcePasswordChange(PydanticBase):
    new_password: str


@router.patch("/force-change-password", response_model=dict)
def force_change_password(
    data: ForcePasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
    current_user.password = pwd_context.hash(data.new_password)
    current_user.must_change_password = False
    db.commit()
    db.refresh(current_user)
    return {
        "success": True,
        "data": _user_out(current_user, db),
        "message": "Contraseña actualizada exitosamente",
    }


@router.get("/my-coverage", response_model=dict)
def my_coverage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from models.sub_admin_country import SubAdminCountry
    if not current_user.country:
        return {"success": True, "data": {"countries": [], "sub_admin": None}, "message": ""}
    row = db.query(SubAdminCountry).filter(
        SubAdminCountry.country == current_user.country
    ).first()
    if not row:
        return {"success": True, "data": {"countries": [current_user.country], "sub_admin": None}, "message": ""}
    sub_admin = db.query(User).filter(User.id == row.user_id, User.deleted_at == None).first()
    all_countries = db.query(SubAdminCountry).filter(SubAdminCountry.user_id == row.user_id).all()
    return {
        "success": True,
        "data": {
            "countries": [c.country for c in all_countries],
            "sub_admin": sub_admin.full_name if sub_admin else None,
        },
        "message": "",
    }
