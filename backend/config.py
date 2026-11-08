import os

from pydantic_settings import BaseSettings

_DEV_SECRET = "casa-cambios-dev-secret-key-change-in-production-2024"


class Settings(BaseSettings):
    SECRET_KEY: str = _DEV_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 7
    # El panel se abre todos los días y desde el teléfono. Con la sesión
    # caducando cada semana, el admin tenía que escribir la contraseña
    # delante de quien estuviera al lado para mirar una cifra. `/auth/me`
    # renueva el token en cada apertura, así que esto es el tope de tiempo
    # que puede pasar SIN abrir la app antes de tener que entrar de nuevo.
    ACCESS_TOKEN_EXPIRE_DAYS_ADMIN: int = 365
    FEE_PERCENTAGE: float = 1.5  # 1.5% comisión por defecto

    # extra="ignore" es obligatorio: pydantic-settings carga TODAS las claves
    # del .env como entradas del modelo y por defecto aborta ante cualquiera
    # que no sea un campo de esta clase. El .env de producción también lleva
    # DATABASE_URL, FRONTEND_URL, DUFFEL_API_KEY y SPACES_*, que se leen por
    # os.environ en otros módulos. Sin esto, la app no arranca.
    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


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
