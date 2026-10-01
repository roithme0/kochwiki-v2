import logging
import math
from typing import Protocol

from openai import OpenAI
from sqlalchemy import case, literal
from sqlalchemy.sql.elements import ColumnElement

from app.core.config import Settings
from app.models.foodstuff import Foodstuff

MODEL = "text-embedding-3-large"
DIMENSIONS = 3072
logger = logging.getLogger(__name__)


class EmbeddingProvider(Protocol):
    def embed(self, text: str, model: str) -> list[float]: ...
    def close(self) -> None: ...


class OpenAIEmbeddingProvider:
    def __init__(self, api_key: str) -> None:
        self.client = OpenAI(api_key=api_key, max_retries=0, timeout=30.0)

    def embed(self, text: str, model: str) -> list[float]:
        response = self.client.embeddings.create(input=text, model=model, encoding_format="float")
        if response.model != model or len(response.data) != 1:
            raise ValueError("Embedding response model or result count differs from request")
        return response.data[0].embedding

    def close(self) -> None:
        self.client.close()


def source_text(name: str, brand: str | None) -> str:
    return name + ("\nBrand: " + brand if brand else "")


def validate_vector(vector: list[float]) -> None:
    if len(vector) != DIMENSIONS or not all(math.isfinite(value) for value in vector) or not any(vector):
        raise ValueError("Expected a finite nonzero 3072-dimensional embedding")


def current_source_text() -> ColumnElement[str]:
    return Foodstuff.name + case(
        ((Foodstuff.brand.is_not(None)) & (Foodstuff.brand != ""), literal("\nBrand: ") + Foodstuff.brand),
        else_=literal(""),
    )


class EmbeddingClient:
    def __init__(self, provider: EmbeddingProvider | None, model: str = MODEL) -> None:
        if model != MODEL:
            raise ValueError("Only text-embedding-3-large with 3072 dimensions is supported")
        self.provider = provider
        self.model = model

    @classmethod
    def from_settings(cls, settings: Settings) -> "EmbeddingClient":
        key = settings.openai_api_key
        provider = OpenAIEmbeddingProvider(key.get_secret_value()) if key and key.get_secret_value() else None
        if provider is None:
            logger.warning("Foodstuff embedding refresh disabled: OPENAI_API_KEY is missing; semantic search unavailable")
        return cls(provider, settings.foodstuff_embedding_model)

    @property
    def available(self) -> bool:
        return self.provider is not None

    def embed(self, text: str, model: str) -> list[float]:
        if self.provider is None:
            raise RuntimeError("Embedding capability unavailable: OPENAI_API_KEY is missing")
        vector = self.provider.embed(text, model)
        validate_vector(vector)
        return vector

    def close(self) -> None:
        if self.provider:
            self.provider.close()
