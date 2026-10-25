from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database.base import Base


class DelegationToken(Base):
    __tablename__ = "delegation_token"
    __table_args__ = (
        CheckConstraint("expires_at > created_at", name="ck_delegation_token_lifetime"),
        CheckConstraint(
            "length(secret_hash) = 64", name="ck_delegation_token_secret_hash"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    secret_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("application_session.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    audience: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
