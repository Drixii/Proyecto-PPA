from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str = "casa-cambios-dev-secret-key-change-in-production-2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 7
    FEE_PERCENTAGE: float = 1.5  # 1.5% comisión por defecto

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
