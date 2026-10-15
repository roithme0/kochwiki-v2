from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.recipe_images import IMAGE_CONTENT_TYPE, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE
from app.db.base import Base


class RecipeImage(Base):
    __tablename__ = "recipe_image"
    __table_args__ = (
        CheckConstraint(f"size BETWEEN 1 AND {MAX_IMAGE_BYTES}", name="ck_recipe_image_size"),
        CheckConstraint(f"width BETWEEN 1 AND {MAX_IMAGE_SIDE}", name="ck_recipe_image_width"),
        CheckConstraint(f"height BETWEEN 1 AND {MAX_IMAGE_SIDE}", name="ck_recipe_image_height"),
        CheckConstraint(f"content_type = '{IMAGE_CONTENT_TYPE}'", name="ck_recipe_image_content_type"),
        CheckConstraint("length(sha256) = 64", name="ck_recipe_image_sha256"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    object_key: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    size: Mapped[int] = mapped_column(nullable=False)
    width: Mapped[int] = mapped_column(nullable=False)
    height: Mapped[int] = mapped_column(nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
