from abc import ABC, abstractmethod
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.infrastructure.embeddings.embeddings import (
    EmbeddingClient,
    QueryEmbeddingError,
    SemanticSearchUnavailable,
)


class SemanticSearch[Candidate](ABC):
    def __init__(
        self, sessions: Callable[[], Session], embeddings: EmbeddingClient
    ) -> None:
        self.sessions = sessions
        self.embeddings = embeddings
        self.profile = embeddings.profile

    def search(self, query: str, limit: int = 5) -> list[Candidate]:
        if not query.strip():
            raise ValueError("Query must not be blank")
        if (
            isinstance(limit, bool)
            or not isinstance(limit, int)
            or not 1 <= limit <= 20
        ):
            raise ValueError("Result limit must be between 1 and 20")
        if not self.embeddings.available:
            raise SemanticSearchUnavailable(
                "Semantic search unavailable: AI_GATEWAY_URL is missing"
            )
        try:
            vector = self.embeddings.embed(query.strip(), self.profile)
        except Exception as error:  # noqa: BLE001 - isolate optional service failures
            raise QueryEmbeddingError(
                "Query embedding failed (" + type(error).__name__ + ")"
            ) from None
        return self._retrieve(vector, limit)

    @abstractmethod
    def _retrieve(self, vector: list[float], limit: int) -> list[Candidate]: ...
