from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from config import settings


def _dias_de_vida(data: dict) -> int:
    """Cuánto dura la sesión, según quién entra.

    El plazo no cuenta desde que se entró sino desde la última vez que se
    abrió la app: `/auth/me` devuelve un token nuevo en cada arranque. Para
    quien administra el plazo es de un año, o sea que en la práctica la
    sesión sigue abierta siempre.
    """
    if data.get("role") in ("admin", "sub_admin"):
        return settings.ACCESS_TOKEN_EXPIRE_DAYS_ADMIN
    return settings.ACCESS_TOKEN_EXPIRE_DAYS


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    ahora = datetime.now(timezone.utc)
    expire = ahora + timedelta(days=_dias_de_vida(data))
    # iat: hora de emisión. Permite invalidar los tokens anteriores a un cambio
    # de contraseña sin llevar una lista de sesiones abiertas.
    to_encode.update({"exp": expire, "iat": ahora})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None
