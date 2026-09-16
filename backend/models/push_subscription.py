from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class PushSubscription(Base):
    """Un navegador al que se le pueden mandar notificaciones del sistema.

    Una persona puede tener varias: el movil, el portatil, el del trabajo. Cada
    navegador da su propio `endpoint`, que es la URL del servicio de push de su
    fabricante (Google, Mozilla, Apple) mas un identificador; es unico, y por
    eso es la clave para no guardar la misma dos veces.

    `p256dh` y `auth` son las claves con las que el navegador descifra el aviso.
    Sin ellas el servicio de push transporta el mensaje pero nadie puede leerlo:
    el contenido va cifrado de extremo a extremo y ni Google ni Apple lo ven.
    """
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    endpoint = Column(String, nullable=False, unique=True, index=True)
    p256dh = Column(String, nullable=False)
    auth = Column(String, nullable=False)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
