from collections.abc import Callable
import logging
from typing import Protocol, TypeVar

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.infrastructure.database.session import SessionLocal
from app.infrastructure.embeddings.refresh import RefreshReport
from app.infrastructure.embeddings.embeddings import (
    EmbeddingClient,
    QueryEmbeddingError,
    SemanticSearchUnavailable,
)
from app.infrastructure.embeddings.semantic_search import SemanticSearch

Candidate = TypeVar("Candidate")


class RefreshService(Protocol):
    def refresh_all(self) -> RefreshReport: ...


def run_refresh_command(
    factory: Callable[[Callable[[], Session], EmbeddingClient], RefreshService],
) -> int:
    def refresh(embeddings: EmbeddingClient) -> int:
        report = factory(SessionLocal, embeddings).refresh_all()
        print(
            f"Refreshed: {report.refreshed}; current/obsolete/deleted: {report.skipped}; failed: {report.failed}"
        )
        return 1 if report.failed else 0

    return _run_with_embeddings(refresh)


def run_search_command(
    factory: Callable[
        [Callable[[], Session], EmbeddingClient], SemanticSearch[Candidate]
    ],
    query: str,
    limit: int,
    formatter: Callable[[int, Candidate], str],
    empty_message: str,
) -> int:
    def search(embeddings: EmbeddingClient) -> int:
        candidates = factory(SessionLocal, embeddings).search(query, limit)
        for rank, candidate in enumerate(candidates, 1):
            print(formatter(rank, candidate))
        if not candidates:
            print(empty_message)
        return 0

    return _run_with_embeddings(search)


def _run_with_embeddings(operation: Callable[[EmbeddingClient], int]) -> int:
    logging.basicConfig(level=logging.INFO)
    embeddings = EmbeddingClient.from_settings(get_settings())
    try:
        if not embeddings.available:
            raise SemanticSearchUnavailable(
                "Semantic capability unavailable: AI_GATEWAY_URL is missing"
            )
        return operation(embeddings)
    except (ValueError, SemanticSearchUnavailable, QueryEmbeddingError) as error:
        print(str(error))
        return 1
    finally:
        embeddings.close()
