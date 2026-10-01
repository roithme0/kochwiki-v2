from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FoodstuffEmbedding(Base):
    __tablename__ = "foodstuff_embedding"

    foodstuff_id: Mapped[int] = mapped_column(ForeignKey("foodstuff.id", ondelete="CASCADE"), primary_key=True)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    vector: Mapped[list[float]] = mapped_column(Vector(3072), nullable=False)
