from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id = Column(Integer, primary_key=True)
    code = Column(String(16), unique=True, nullable=False, index=True)
    # Opcional. El codigo ya no se ata a un correo: se le manda a quien sea y
    # esa persona se registra con el correo que quiera. Ataba dos cosas que no
    # tienen por que coincidir — a quien se le pasa el codigo y con que cuenta
    # entra — y obligaba a acertar el correo antes de conocerlo.
    email = Column(String, nullable=True)
    super_admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_used = Column(Boolean, default=False)
    # Si el cliente nace marcado como confiable. Para gente que ya se conoce
    # fuera de la web: se le invita sabiendo quién es, así que la retención
    # del primer envío solo estorbaría.
    trusted = Column(Boolean, default=False)
    used_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
