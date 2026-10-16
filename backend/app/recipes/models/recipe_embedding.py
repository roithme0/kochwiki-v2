from uuid import UUID

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.embedding import EmbeddingMixin


class RecipeEmbedding(EmbeddingMixin, Base):
    __tablename__ = "recipe_embedding"

    recipe_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("recipe_version.version_id", ondelete="CASCADE"), primary_key=True
    )
