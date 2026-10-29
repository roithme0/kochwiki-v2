import logging
import math
from typing import Literal, Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import Settings
from app.infrastructure.embeddings.config import STORAGE_DIMENSIONS, PROFILE

logger = logging.getLogger(__name__)


class SemanticSearchUnavailable(RuntimeError):
    pass


class QueryEmbeddingError(RuntimeError):
    pass


class EmbeddingProvider(Protocol):
    def embed(self, text: str, profile: str) -> list[float]: ...
    def close(self) -> None: ...


class EmbeddingResult(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True, allow_inf_nan=False)

    profile: Literal["semantic-text-v1"]
    dimensions: int = Field(ge=STORAGE_DIMENSIONS, le=STORAGE_DIMENSIONS)
    vector: list[float] = Field(
        min_length=STORAGE_DIMENSIONS, max_length=STORAGE_DIMENSIONS
    )


class HTTPEmbeddingProvider:
    def __init__(self, service_url: str, *, client: httpx.Client | None = None) -> None:
        self.url = service_url.rstrip("/") + "/api/v1/embeddings"
        self.client = (
            client
            if client is not None
            else httpx.Client(timeout=httpx.Timeout(35.0, connect=5.0))
        )

    def embed(self, text: str, profile: str) -> list[float]:
        if profile != PROFILE:
            raise ValueError("Unsupported embedding profile")
        response = self.client.post(self.url, json={"profile": profile, "input": text})
        response.raise_for_status()
        result = EmbeddingResult.model_validate_json(response.content)
        validate_vector(result.vector)
        return result.vector

    def close(self) -> None:
        self.client.close()


def validate_vector(vector: list[float]) -> None:
    if (
        len(vector) != STORAGE_DIMENSIONS
        or not all(math.isfinite(value) for value in vector)
        or not any(vector)
    ):
        raise ValueError(
            f"Expected a finite nonzero {STORAGE_DIMENSIONS}-dimensional embedding"
        )


class EmbeddingClient:
    def __init__(
        self, provider: EmbeddingProvider | None, profile: str = PROFILE
    ) -> None:
        if profile != PROFILE:
            raise ValueError("Unsupported embedding profile")
        self.provider = provider
        self.profile = profile

    @classmethod
    def from_settings(cls, settings: Settings) -> "EmbeddingClient":
        provider = (
            HTTPEmbeddingProvider(settings.ai_gateway_url)
            if settings.ai_gateway_url
            else None
        )
        if provider is None:
            logger.warning(
                "Embedding refresh disabled: AI_GATEWAY_URL is missing; semantic search unavailable"
            )
        return cls(provider)

    @property
    def available(self) -> bool:
        return self.provider is not None

    def embed(self, text: str, profile: str) -> list[float]:
        if self.provider is None:
            raise RuntimeError(
                "Embedding capability unavailable: AI_GATEWAY_URL is missing"
            )
        if profile != self.profile:
            raise ValueError("Embedding profile differs from the configured profile")
        vector = self.provider.embed(text, profile)
        validate_vector(vector)
        return vector

    def close(self) -> None:
        if self.provider:
            self.provider.close()
