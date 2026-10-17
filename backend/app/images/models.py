from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Enum, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.images.config import IMAGE_CONTENT_TYPE, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE
from app.infrastructure.database.base import Base


class ImageKind(StrEnum):
    RECIPE = "recipe"
    FOODSTUFF = "foodstuff"


class ImageAsset(Base):
    __tablename__ = "image_asset"
    __table_args__ = (
        UniqueConstraint("kind", "object_key", name="uq_image_asset_kind_object_key"),
        CheckConstraint(f"size BETWEEN 1 AND {MAX_IMAGE_BYTES}", name="ck_image_asset_size"),
        CheckConstraint(f"width BETWEEN 1 AND {MAX_IMAGE_SIDE}", name="ck_image_asset_width"),
        CheckConstraint(f"height BETWEEN 1 AND {MAX_IMAGE_SIDE}", name="ck_image_asset_height"),
        CheckConstraint(f"content_type = '{IMAGE_CONTENT_TYPE}'", name="ck_image_asset_content_type"),
        CheckConstraint("length(sha256) = 64", name="ck_image_asset_sha256"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    kind: Mapped[ImageKind] = mapped_column(
        Enum(
            ImageKind, native_enum=False, create_constraint=True,
            name="ck_image_asset_kind", values_callable=lambda kinds: [kind.value for kind in kinds],
        ),
        nullable=False,
    )
    object_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    size: Mapped[int] = mapped_column(nullable=False)
    width: Mapped[int] = mapped_column(nullable=False)
    height: Mapped[int] = mapped_column(nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
