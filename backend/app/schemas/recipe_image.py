from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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
