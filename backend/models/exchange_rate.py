from sqlalchemy import Column, Integer, String, Float, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    # Un par de monedas = una fila. Sin esto llegaron a existir dos filas por
    # par: una se actualizaba y la otra quedaba congelada, y get_rate() leía
    # cualquiera de las dos.
    __table_args__ = (
        UniqueConstraint("from_currency", "to_currency", name="ux_exchange_rates_pair"),
    )

    id = Column(Integer, primary_key=True, index=True)
    from_currency = Column(String, nullable=False, index=True)
    to_currency = Column(String, nullable=False, index=True)
    rate = Column(Float, nullable=False)
    is_manual = Column(String, default=False)  # True para VES y monedas sin API
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Con que tasa se compara para decir si subio o bajo. Se congela y se
    # renueva cada 24 h, asi que la cinta de la portada enseña la variacion del
    # dia y no la del ultimo refresco, que son decimales sin interes.
    ref_rate = Column(Float, nullable=True)
    ref_at = Column(DateTime(timezone=True), nullable=True)
