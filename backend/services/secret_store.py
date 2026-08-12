"""Guarda secretos de terceros (claves de Stripe) cifrados en la base.

Se cifran, y no se guardan tal cual, por dos motivos concretos:

1. Una copia de seguridad de Postgres deja de ser un archivo con claves de
   cobro dentro. Los backups se mueven, se descargan y acaban en sitios menos
   cuidados que el servidor.
2. Cualquiera con acceso de solo lectura a la base (un `psql`, un panel de
   administración, una consulta mal hecha en un log) vería `sk_live_...` en
   texto plano.

La llave de cifrado se deriva de SECRET_KEY, que ya es obligatoria en
producción (config.py aborta el arranque sin ella). Eso implica algo que hay
que tener presente: **si SECRET_KEY cambia, estos secretos dejan de poder
descifrarse** y hay que volver a pegarlos. Es el precio de no añadir otro
secreto más que gestionar.
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from models.setting import Setting
from config import settings

_PREFIJO = "enc:v1:"


def _fernet() -> Fernet:
    # Fernet exige 32 bytes en base64url. SECRET_KEY es texto libre, así que
    # se normaliza con SHA-256 en vez de exigir un formato concreto.
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def set_secret(db: Session, key: str, value: str) -> None:
    """Guarda cifrado. Un valor vacío borra la entrada."""
    row = db.query(Setting).filter(Setting.key == key).first()
    if not value:
        if row:
            db.delete(row)
            db.commit()
        return

    cifrado = _PREFIJO + _fernet().encrypt(value.encode()).decode()
    if row:
        row.value = cifrado
    else:
        db.add(Setting(key=key, value=cifrado))
    db.commit()


def get_secret(db: Session, key: str) -> str | None:
    row = db.query(Setting).filter(Setting.key == key).first()
    if not row or not row.value:
        return None
    if not row.value.startswith(_PREFIJO):
        # Valor viejo sin cifrar: se acepta para no romper nada, pero se
        # devuelve igual. Al volver a guardarlo queda cifrado.
        return row.value
    try:
        return _fernet().decrypt(row.value[len(_PREFIJO):].encode()).decode()
    except InvalidToken:
        # Pasa si SECRET_KEY cambió. Devolver None es lo correcto: mejor que
        # el pago con tarjeta aparezca "sin configurar" y se vuelvan a pegar
        # las claves, a que la app intente cobrar con una clave corrupta.
        print(f"[secretos] no se pudo descifrar '{key}': ¿cambió SECRET_KEY?")
        return None


def mask(value: str | None) -> str | None:
    """Versión mostrable de un secreto: sk_live_••••4242.

    Lo que nunca se hace es devolver el valor completo al navegador. Una vez
    guardada, la clave solo sale de la base hacia Stripe.
    """
    if not value:
        return None
    if len(value) <= 12:
        return "•" * len(value)
    return f"{value[:8]}{'•' * 6}{value[-4:]}"
