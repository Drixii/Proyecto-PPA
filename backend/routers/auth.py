import re
from pydantic import BaseModel
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
    # Se deriva de la fecha: el front solo necesita saber si esta o no.
    data["email_verified"] = bool(getattr(user, "email_verified_at", None))
    # Si no hay servidor de correo configurado no se puede exigir nada: el
    # front necesita saberlo para no pedir un código que no va a llegar.
    from services import email_service
    data["email_verification_required"] = email_service.configurado()
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

    # Validate invite code
    super_admin_id = None
    if data.invite_code:
        from models.invite_code import InviteCode
        code_row = db.query(InviteCode).filter(
            InviteCode.code == data.invite_code.strip().upper(),
            InviteCode.is_used == False,
        ).first()
        if not code_row:
            raise HTTPException(status_code=400, detail="Código de invitación inválido o ya utilizado")
        if code_row.email.lower().strip() != data.email.lower().strip():
            raise HTTPException(status_code=400, detail="El correo no coincide con el de la invitación")
        super_admin_id = code_row.super_admin_id
    else:
        raise HTTPException(status_code=400, detail="Se requiere un código de invitación para registrarse")

    # Documento: válido y de nadie más.
    #
    # La validación es aritmética (dígito verificador) donde el país lo
    # permite. No prueba que el documento sea suyo — eso solo lo da una
    # verificación con el registro civil — pero descarta números inventados y,
    # sobre todo, erratas: un dígito mal escrito convierte a una persona en dos
    # a ojos del sistema, y todo lo que depende del documento deja de funcionar
    # sin que nadie se entere.
    from services import documento_service as docs

    ok, motivo = docs.valida(data.document_type, data.document_number)
    if not ok:
        raise HTTPException(status_code=400, detail=motivo)

    documento = docs.normaliza(data.document_type, data.document_number)

    # Una persona, una cuenta. Sin esto, cualquier límite por cliente se
    # esquiva abriendo otra cuenta y repartiendo los envíos.
    ya_existe = db.query(User).filter(
        User.document_number == documento,
        User.deleted_at == None,
    ).first()
    if ya_existe:
        # Mensaje neutro a propósito: decir a qué correo pertenece confirmaría
        # a un desconocido que ese documento tiene cuenta aquí, y con quién.
        raise HTTPException(
            status_code=400,
            detail="Ese documento ya tiene una cuenta. Si es tuyo y perdiste el acceso, escríbenos.",
        )

    telefono = (data.phone or "").strip()
    if len(re.sub(r"\D", "", telefono)) < 8:
        raise HTTPException(status_code=400, detail="El teléfono no parece válido")

    hashed = pwd_context.hash(data.password)
    user = User(
        email=data.email,
        full_name=data.full_name,
        password=hashed,
        phone=telefono,
        document_type=data.document_type.upper().strip(),
        document_number=documento,
        country=data.country,
        timezone=country_to_tz(data.country),
        super_admin_id=super_admin_id,
        invite_code_used=data.invite_code.strip().upper() if data.invite_code else None,
        # La confianza viene del código con el que se le invitó: si quien
        # invita ya sabe quién es, su primer envío no se retiene.
        is_trusted=bool(getattr(code_row, "trusted", False)) if data.invite_code else False,
    )
    db.add(user)
    db.flush()

    # Mark code as used
    if data.invite_code:
        from models.invite_code import InviteCode
        code_row = db.query(InviteCode).filter(
            InviteCode.code == data.invite_code.strip().upper(),
        ).first()
        if code_row:
            code_row.is_used = True
            code_row.used_by_id = user.id

    db.commit()
    db.refresh(user)

    # Código de verificación. Si SMTP no está configurado la cuenta se crea
    # igual y queda sin verificar: preferible a dejar fuera a los clientes
    # porque falte una credencial. El envío de dinero es lo que se bloquea.
    from services import email_service
    enviado = False
    if email_service.configurado():
        enviado, _ = email_service.enviar_codigo(db, user.email)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {
        "success": True,
        "data": {
            "access_token": token,
            "token_type": "bearer",
            "user": _user_out(user, db),
            "email_verification_sent": enviado,
        },
        "message": "Cuenta creada exitosamente"
    }


class CodigoIn(BaseModel):
    code: str


@router.post("/verify-email/send", response_model=dict)
def enviar_verificacion(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manda (o reenvía) el código al correo del usuario."""
    from services import email_service

    if current_user.email_verified_at:
        return {"success": True, "data": {"verificado": True}, "message": "Tu correo ya está verificado"}
    if not email_service.configurado():
        raise HTTPException(status_code=400, detail="El envío de correos no está configurado. Escríbenos para verificar tu cuenta.")

    ok, motivo = email_service.enviar_codigo(db, current_user.email)
    if not ok:
        raise HTTPException(status_code=400, detail=motivo)
    return {"success": True, "data": {}, "message": "Te enviamos un código"}


@router.post("/verify-email", response_model=dict)
def verificar_email(
    data: CodigoIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Comprueba el código y marca el correo como verificado."""
    from services import email_service
    from datetime import datetime, timezone

    if current_user.email_verified_at:
        return {"success": True, "data": {"verificado": True}, "message": "Tu correo ya está verificado"}

    ok, motivo = email_service.verificar_codigo(db, current_user.email, data.code)
    if not ok:
        raise HTTPException(status_code=400, detail=motivo)

    current_user.email_verified_at = datetime.now(timezone.utc)
    db.commit()
    return {"success": True, "data": {"verificado": True}, "message": "Correo verificado"}


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


# def (no async): lectura de archivo + Pillow + escritura a disco son bloqueantes
# y en async def congelarían el event loop para todos los demás usuarios.
@router.post("/profile/avatar", response_model=dict)
def upload_avatar(
    avatar: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ext = os.path.splitext(avatar.filename or "")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        raise HTTPException(status_code=400, detail="Solo jpg/png/webp permitidos")
    content = avatar.file.read()
    content = validate_and_convert(content)
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


class CheckEmailPayload(PydanticBase):
    email: str

@router.post("/check-email", response_model=dict)
def check_email_invite(data: CheckEmailPayload, db: Session = Depends(get_db)):
    from models.invite_code import InviteCode
    from sqlalchemy import func
    code_row = db.query(InviteCode).filter(
        func.lower(InviteCode.email) == data.email.strip().lower(),
        InviteCode.is_used == False,
    ).first()
    if not code_row:
        raise HTTPException(status_code=400, detail="El correo no es el correcto")
    return {"success": True, "message": ""}


@router.get("/check-invite-code/{code}", response_model=dict)
def check_invite_code(code: str, db: Session = Depends(get_db)):
    from models.invite_code import InviteCode
    code_row = db.query(InviteCode).filter(
        InviteCode.code == code.strip().upper(),
        InviteCode.is_used == False,
    ).first()
    if not code_row:
        return {"success": True, "data": {"valid": False, "email": None}, "message": ""}
    return {"success": True, "data": {"valid": True, "email": code_row.email}, "message": ""}


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
