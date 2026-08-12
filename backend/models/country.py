from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from database import Base


class Country(Base):
    """País disponible para enviar o recibir dinero.

    Lista única para toda la plataforma: el calculador del home es público, sin
    admin conectado, así que no podría elegir entre listas por super-admin.
    """
    __tablename__ = "countries"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    currency = Column(String, nullable=False)
    # Código de dos letras para la bandera (flagcdn). Obligatorio: antes el
    # frontend tenía su propio mapa de países y a los que faltaban (Canadá,
    # Reino Unido, China, Japón) no les salía bandera.
    iso2 = Column(String, nullable=False)
    can_send = Column(Boolean, default=False, nullable=False)      # se puede enviar DESDE
    can_receive = Column(Boolean, default=True, nullable=False)    # se puede recibir EN
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
