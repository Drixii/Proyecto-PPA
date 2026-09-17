from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class Review(Base):
    """Reseña que deja un cliente sobre un envío suyo ya completado.

    Una por orden: la reseña habla de un envío concreto, y así nadie puede
    llenar la portada de estrellas desde una misma cuenta.

    Nace `pendiente` y solo se publica cuando el super-admin dueño del cliente
    la aprueba. Aprobar no permite editar el texto: se publica tal cual lo
    escribió el cliente o no se publica.

    `nombre_publico` se fija al escribirla —nombre e inicial del apellido— y
    no se recalcula si el cliente cambia su nombre después: es lo que aceptó
    que se mostrara.
    """
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("order_id", name="uq_review_order"),)

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    super_admin_id = Column(Integer, nullable=True, index=True)

    rating = Column(Integer, nullable=False)          # 1 a 5
    comment = Column(String(600), nullable=False)
    nombre_publico = Column(String(80), nullable=False)
    pais_origen = Column(String(60), nullable=True)
    pais_destino = Column(String(60), nullable=True)

    # pendiente | aprobada | rechazada
    status = Column(String(20), nullable=False, default="pendiente", index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
