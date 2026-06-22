from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id = Column(Integer, primary_key=True)
    code = Column(String(16), unique=True, nullable=False, index=True)
    email = Column(String, nullable=False)
    super_admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_used = Column(Boolean, default=False)
    used_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
