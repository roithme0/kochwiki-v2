from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database.base import Base
from app.infrastructure.embeddings.models import EmbeddingMixin


class FoodstuffEmbedding(EmbeddingMixin, Base):
    __tablename__ = "foodstuff_embedding"

    foodstuff_id: Mapped[int] = mapped_column(ForeignKey("foodstuff.id", ondelete="CASCADE"), primary_key=True)
