from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.infrastructure.storage.storage import PresignedTransfer
from app.images.config import IMAGE_CONTENT_TYPE


class RecipeImageUploadOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uploadId: UUID
    url: str = Field(repr=False)
    method: Literal["PUT"]
    headers: dict[str, str]
    expiresIn: int


class RecipeImageOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    contentType: Literal["image/png"]
    size: int
    width: int
    height: int
    createdAt: datetime


class RecipeImageDownloadOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(repr=False)
    expiresIn: int = Field(gt=0)


@dataclass(frozen=True)
class ImageUpload:
    id: UUID
    transfer: PresignedTransfer


@dataclass(frozen=True)
class ValidatedRecipeImage:
    id: UUID
    object_key: str
    size: int
    width: int
    height: int
    sha256: str
    created_at: datetime
    content_type: str = IMAGE_CONTENT_TYPE
    cleanup_pending: bool = False
