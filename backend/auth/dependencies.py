from fastapi import Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from auth.jwt import decode_token

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    user = db.query(User).filter(User.id == int(user_id), User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    # Un token emitido antes del último cambio de contraseña ya no vale. Sin
    # esto, cambiarle la clave a alguien no lo echaba de las sesiones abiertas:
    # si se la cambias porque le robaron la cuenta, el intruso seguía dentro.
    # De paso arregla el aviso de "cambia tu contraseña", que tardaba en salir
    # porque el navegador seguía con la sesión y los datos viejos en memoria.
    if user.password_changed_at:
        emitido = payload.get("iat")
        if emitido is None or emitido < user.password_changed_at.timestamp():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tu contraseña cambió. Vuelve a iniciar sesión.",
            )
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso solo para administradores")
    return current_user


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso solo para super-administradores")
    return current_user


def require_sub_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "sub_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso solo para sub-administradores")
    return current_user


def require_any_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "sub_admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso solo para administradores")
    return current_user


def get_user_from_ws_token(token: str, db: Session) -> User:
    """Para autenticar WebSocket via query param ?token="""
    payload = decode_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return db.query(User).filter(User.id == int(user_id), User.is_active == True).first()
