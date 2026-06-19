from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base
from sqlalchemy.orm import relationship


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String, unique=True, nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Remitente
    sender_name = Column(String, nullable=False)
    sender_id_type = Column(String, nullable=True)
    sender_id_num = Column(String, nullable=True)
    sender_phone = Column(String, nullable=True)
    sender_country = Column(String, nullable=True)

    # Receptor
    receiver_name = Column(String, nullable=False)
    receiver_phone = Column(String, nullable=True)
    receiver_country = Column(String, nullable=False)
    receiver_bank_id = Column(Integer, ForeignKey("banks.id"), nullable=True)
    receiver_account = Column(String, nullable=True)
    receiver_id_type = Column(String, nullable=True)
    receiver_id_num = Column(String, nullable=True)

    # Montos
    amount_sent = Column(Float, nullable=False)
    currency_from = Column(String, nullable=False)
    currency_to = Column(String, nullable=False)
    exchange_rate = Column(Float, nullable=False)
    amount_received = Column(Float, nullable=False)
    fee = Column(Float, default=0)

    # Estado: en_aprobacion | en_proceso | completado
    status = Column(String, default="en_aprobacion", index=True)

    # Sub-admin asignado (se asigna al aprobar o al crear con tarjeta)
    sub_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # Pago
    payment_method = Column(String, nullable=True)
    payment_bank = Column(String, nullable=True)
    payment_proof = Column(String, nullable=True)

    # Comprobante de pago enviado por sub-admin al completar
    completion_proof = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
