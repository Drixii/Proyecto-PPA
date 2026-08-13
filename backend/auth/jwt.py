from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from config import settings


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    ahora = datetime.now(timezone.utc)
    expire = ahora + timedelta(days=settings.ACCESS_TOKEN_EXPIRE_DAYS)
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
