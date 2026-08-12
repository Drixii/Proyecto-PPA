import os

from pydantic_settings import BaseSettings

_DEV_SECRET = "casa-cambios-dev-secret-key-change-in-production-2024"


class Settings(BaseSettings):
    SECRET_KEY: str = _DEV_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 7
    FEE_PERCENTAGE: float = 1.5  # 1.5% comisión por defecto

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

# El SECRET_KEY de desarrollo está en el repo público: cualquiera puede firmar
# un JWT de admin con él. En producción (Postgres) no se permite arrancar sin
# una clave propia. En local con SQLite se deja pasar para no estorbar.
_is_production = "postgres" in os.environ.get("DATABASE_URL", "").lower()

if _is_production and settings.SECRET_KEY == _DEV_SECRET:
    raise RuntimeError(
        "SECRET_KEY no configurada en producción. "
        "Generar con: openssl rand -hex 32  y ponerla en el .env"
    )
