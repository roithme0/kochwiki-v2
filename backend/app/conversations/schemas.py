from datetime import datetime, timezone
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    field_validator,
)


class ArtifactCapability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    description: str
    payloadSchema: dict[str, JsonValue]
    metadataSchema: dict[str, JsonValue] | None = None
    titleDescription: str | None = None
    subtitleDescription: str | None = None


class RecipeConversationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceRecipeVersionId: UUID
    artifact_capabilities: list[ArtifactCapability] = Field(default_factory=list)


class ConversationCreated(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str = Field(min_length=1)
    expires_at: AwareDatetime

    @field_validator("expires_at")
    @classmethod
    def utc_expiry(cls, value: datetime) -> datetime:
        return value.astimezone(timezone.utc)
