from datetime import datetime, timedelta, timezone

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base

# Cuanto vive un codigo sin usar. Corto a proposito: un codigo es una puerta
# abierta a la plataforma y ya no va atado a un correo, asi que lo usa quien lo
# tenga. Media hora es tiempo de sobra para pasarselo a alguien por chat y que
# se registre, y poco para que uno reenviado siga sirviendo manana.
MINUTOS_VALIDO = 30


def vencido(invite) -> bool:
    """Si el codigo ya no sirve por antiguedad.

    Se calcula sobre created_at y no se guarda una fecha de caducidad: asi
    cambiar MINUTOS_VALIDO vale para todos, tambien para los ya emitidos.

    Sin fecha de creacion se da por valido: son filas anteriores a que la
    columna existiera, y caducar de golpe algo que no se puede fechar dejaria
    fuera a gente sin motivo.
    """
    if not invite or not invite.created_at:
        return False
    creado = invite.created_at
    if creado.tzinfo is None:
        creado = creado.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - creado > timedelta(minutes=MINUTOS_VALIDO)


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
