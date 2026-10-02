from pgvector.sqlalchemy import Vector
from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.embedding import DIMENSIONS


class EmbeddingMixin:
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    vector: Mapped[list[float]] = mapped_column(Vector(DIMENSIONS), nullable=False)
