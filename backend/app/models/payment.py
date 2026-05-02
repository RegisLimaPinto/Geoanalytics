from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.user import Base


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    mp_preference_id = Column(String(255), nullable=True)   # MercadoPago preference id
    mp_payment_id = Column(String(255), nullable=True)       # MercadoPago payment id
    status = Column(
        Enum("pending", "approved", "rejected", "cancelled", name="payment_status"),
        default="pending",
        nullable=False,
    )
    product_type = Column(
        Enum("single_analysis", name="product_type"),
        default="single_analysis",
        nullable=False,
    )
    amount = Column(Float, nullable=False)
    credits_granted = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="payments")


class UserCredits(Base):
    __tablename__ = "user_credits"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    balance = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="credits")
