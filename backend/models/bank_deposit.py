from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text
from sqlalchemy.sql import func
from database import Base


class BankDeposit(Base):
    """Depósito recibido en una cuenta bancaria de la empresa (Global66).

    Es un registro de lo que avisó el proveedor, no una decisión. Ninguna orden
    cambia de estado por esta tabla: el aviso llega, se guarda y se muestra al
    admin junto con la orden que probablemente le corresponde. Aprobar sigue
    siendo un acto humano hasta que hayamos visto avisos reales y sepamos que
    el cruce acierta.

    `transaction_id` es único a propósito. Global66 no reintenta los avisos,
    pero sí puede mandar el mismo depósito varias veces mientras cambia de
    estado (PENDING → COMPLETED), y dos filas del mismo dinero harían creer
    que entró el doble.
    """
    __tablename__ = "bank_deposits"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, nullable=False, default="global66", index=True)
    transaction_id = Column(String, nullable=False, unique=True, index=True)

    # Lo que manda el proveedor
    tipo = Column(String, nullable=True)            # DEPOSIT, ...
    amount = Column(Float, nullable=True)
    currency = Column(String, nullable=True, index=True)
    amount_usd = Column(Float, nullable=True)
    country_code = Column(String, nullable=True)
    account_branch = Column(String, nullable=True)  # a cuál de nuestras cuentas llegó
    remitter_name = Column(String, nullable=True)   # thirdPartyClientName
    remitter_bank = Column(String, nullable=True)
    customer_id = Column(String, nullable=True)
    status = Column(String, nullable=True, index=True)

    # El cuerpo entero tal cual llegó. Sin esto, cualquier campo que no
    # hayamos previsto se pierde y no hay forma de reconstruir qué pasó.
    raw = Column(Text, nullable=True)

    # Cruce sugerido. Nunca decide nada por sí solo.
    match_order_id = Column(Integer, nullable=True, index=True)
    match_note = Column(String, nullable=True)

    # Lo marca un admin cuando ya usó este aviso para aprobar una orden.
    applied = Column(Boolean, default=False, nullable=False)

    received_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
