from sqlalchemy import String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database.base import Base


class User(Base):
    __tablename__ = "custom_user"
    __table_args__ = (
        UniqueConstraint("issuer", "subject", name="uq_custom_user_identity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    display_name: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    issuer: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
