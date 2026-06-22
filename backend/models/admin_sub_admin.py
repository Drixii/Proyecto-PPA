from sqlalchemy import Column, Integer, ForeignKey
from database import Base


class AdminSubAdmin(Base):
    __tablename__ = "admin_sub_admin"

    admin_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    sub_admin_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
