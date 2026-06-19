from sqlalchemy import Column, Integer, String, Boolean
from database import Base


class Bank(Base):
    __tablename__ = "banks"

    id = Column(Integer, primary_key=True, index=True)
    country = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    code = Column(String, nullable=True)
    active = Column(Boolean, default=True)
