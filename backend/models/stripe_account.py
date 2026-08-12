from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from database import Base


class StripeAccount(Base):
    """Cuenta de Stripe conectada de un super-admin.

    Aquí NO se guarda ninguna clave. Con Stripe Connect el admin se da de alta
    en un formulario alojado por Stripe y lo único que vuelve es el
    identificador de su cuenta (`acct_...`), que no sirve para nada fuera de
    nuestra plataforma. Si esta base se filtrara, no se filtra el acceso a la
    cuenta de nadie — que es justo lo que pasaría guardando sus sk_live.
    """
    __tablename__ = "stripe_accounts"

    id = Column(Integer, primary_key=True, index=True)
    super_admin_id = Column(Integer, nullable=False, unique=True, index=True)
    account_id = Column(String, nullable=False, unique=True)  # acct_...
    # Copia local de lo que dice Stripe, para no llamar a su API en cada
    # pantalla. Se refresca al entrar en Ajustes.
    charges_enabled = Column(Boolean, default=False, nullable=False)
    details_submitted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
