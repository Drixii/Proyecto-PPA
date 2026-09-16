from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from database import Base


class CommissionRule(Base):
    __tablename__ = "commission_rules"

    id = Column(Integer, primary_key=True, index=True)
    super_admin_id = Column(Integer, nullable=True, index=True)  # null = regla global
    from_currency = Column(String, nullable=False)
    to_currency = Column(String, nullable=False)

    # Pais concreto de la ruta. Existe porque varios paises comparten divisa
    # —Ecuador, Estados Unidos y Panama usan el dolar— y cobrarles lo mismo
    # obligaba a tener un solo precio para los tres.
    #
    # Nulo = la regla vale para toda la moneda. Las de pais mandan sobre esas,
    # asi que se puede poner un precio general al dolar y luego uno propio a
    # Ecuador sin tocar el resto.
    from_country = Column(String, nullable=True, index=True)
    to_country = Column(String, nullable=True, index=True)
    commission_pct = Column(Float, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
