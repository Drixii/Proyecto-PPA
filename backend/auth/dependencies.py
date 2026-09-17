from fastapi import Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from auth.jwt import decode_token

bearer_scheme = HTTPBearer()


def _usuario_del_token(payload: dict | None, db: Session) -> tuple[User | None, str]:
    """Quién es el dueño de un token, o (None, motivo) si no vale.

    Única regla para la API y para el WebSocket del chat, que antes validaba
    por su cuenta y se saltaba los controles de abajo.
    """
    if not payload:
        return None, "Token inválido o expirado"
    user_id = payload.get("sub")
    if not user_id:
        return None, "Token inválido"
    user = db.query(User).filter(
        User.id == int(user_id),
        User.is_active == True,  # noqa: E712
        # Una cuenta borrada no entra. Antes solo se miraba is_active, y un
        # cliente enviado a la papelera seguía usando su sesión abierta.
        User.deleted_at == None,  # noqa: E711
    ).first()
    if not user:
        return None, "Usuario no encontrado"

    emitido = payload.get("iat")

    # Un token emitido antes de que existiera la cuenta no es de esta cuenta.
    # El token solo lleva el número de usuario, y la base se rehízo en la
    # migración con los números empezando otra vez desde 1: la sesión que
    # alguien tenía abierta en la base anterior, firmada con la misma clave,
    # entraba en la cuenta que hoy tiene ese número, que es de otra persona.
    if user.created_at is not None:
        # 5 s de margen por si el reloj de la base y el de la API difieren un
        # poco: el token del propio registro se emite en el mismo segundo.
        if emitido is None or emitido < int(user.created_at.timestamp()) - 5:
            return None, "Tu sesión ya no es válida. Vuelve a iniciar sesión."

    # Un token emitido antes del último cambio de contraseña ya no vale. Sin
    # esto, cambiarle la clave a alguien no lo echaba de las sesiones abiertas:
    # si se la cambias porque le robaron la cuenta, el intruso seguía dentro.
    # Truncado a segundos: 'iat' va en segundos enteros y password_changed_at
    # lleva microsegundos; en crudo, el token emitido justo después del cambio
    # salía «anterior» y el usuario no podía volver a entrar nunca.
    if user.password_changed_at:
        if emitido is None or emitido < int(user.password_changed_at.timestamp()):
            return None, "Tu contraseña cambió. Vuelve a iniciar sesión."
    return user, ""


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
) -> User:
    user, motivo = _usuario_del_token(decode_token(credentials.credentials), db)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=motivo)
    return user


_bearer_opcional = HTTPBearer(auto_error=False)


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_opcional),
    db: Session = Depends(get_db),
) -> User | None:
    """Quien llama, si viene identificado; None si no.

    Para endpoints publicos que ademas ensenan algo propio de cada usuario:
    /payments/config lo usan tanto la web sin sesion como un cliente dentro, y
    a este ultimo hay que mostrarle las cuentas de cobro de SU super-admin.
    Cualquier fallo del token se trata como "sin sesion" en vez de 401: es un
    endpoint que tiene que seguir respondiendo aunque la sesion haya caducado.
    """
    if not credentials:
        return None
    try:
        return get_current_user(credentials, db)
    except HTTPException:
        return None


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
    user, _ = _usuario_del_token(decode_token(token), db)
    return user
