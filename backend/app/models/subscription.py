from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.user import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    plan_slug = Column(String(32), nullable=False)          # basic | pro | enterprise
    mp_preapproval_id = Column(String(255), nullable=True)  # MercadoPago preapproval id
    status = Column(
        Enum("pending", "authorized", "paused", "cancelled", name="subscription_status"),
        default="pending",
        nullable=False,
    )
    analyses_per_month = Column(Integer, nullable=False)
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="subscriptions")
