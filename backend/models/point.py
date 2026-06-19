from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime
from sqlalchemy.sql import func
from database import Base


class PointAccount(Base):
    __tablename__ = "point_accounts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    total_points = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PointTransaction(Base):
    __tablename__ = "point_transactions"
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("point_accounts.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    points = Column(Integer, nullable=False)
    type = Column(String, nullable=False)  # "earned", "redeemed", "manual"
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PointReward(Base):
    __tablename__ = "point_rewards"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    points_cost = Column(Integer, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    image_filename = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PointRedemption(Base):
    __tablename__ = "point_redemptions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reward_id = Column(Integer, ForeignKey("point_rewards.id"), nullable=False)
    reward_name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    points_used = Column(Integer, nullable=False)
    status = Column(String, default="pending", nullable=False)  # "pending", "used"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
