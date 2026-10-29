from pgvector.sqlalchemy import Vector
from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.embeddings.config import STORAGE_DIMENSIONS


class EmbeddingMixin:
    profile: Mapped[str] = mapped_column(String(128), nullable=False)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    vector: Mapped[list[float]] = mapped_column(
        Vector(STORAGE_DIMENSIONS), nullable=False
    )
