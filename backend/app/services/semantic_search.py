from abc import ABC, abstractmethod
from collections.abc import Callable
from typing import Generic, TypeVar

from sqlalchemy.orm import Session

from app.services.embeddings import EmbeddingClient, QueryEmbeddingError, SemanticSearchUnavailable

Candidate = TypeVar("Candidate")


class SemanticSearch(Generic[Candidate], ABC):
    def __init__(self, sessions: Callable[[], Session], embeddings: EmbeddingClient) -> None:
        self.sessions = sessions
        self.embeddings = embeddings
        self.model = embeddings.model

    def search(self, query: str, limit: int = 5) -> list[Candidate]:
        if not query.strip():
            raise ValueError("Query must not be blank")
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 20:
            raise ValueError("Result limit must be between 1 and 20")
        if not self.embeddings.available:
            raise SemanticSearchUnavailable("Semantic search unavailable: OPENAI_API_KEY is missing")
        try:
            vector = self.embeddings.embed(query.strip(), self.model)
        except Exception as error:
            raise QueryEmbeddingError("Query embedding failed (" + type(error).__name__ + ")") from None
        return self._retrieve(vector, limit)

    @abstractmethod
    def _retrieve(self, vector: list[float], limit: int) -> list[Candidate]:
        ...
