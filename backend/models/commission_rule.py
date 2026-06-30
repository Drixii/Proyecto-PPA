from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from database import Base


class CommissionRule(Base):
    __tablename__ = "commission_rules"

    id = Column(Integer, primary_key=True, index=True)
    super_admin_id = Column(Integer, nullable=True, index=True)  # null = regla global
    from_currency = Column(String, nullable=False)
    to_currency = Column(String, nullable=False)
    commission_pct = Column(Float, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
