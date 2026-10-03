import argparse
from collections.abc import Callable
import logging
from typing import Protocol, TypeVar

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.embedding_refresh import RefreshReport
from app.services.embeddings import EmbeddingClient, QueryEmbeddingError, SemanticSearchUnavailable
from app.services.semantic_search import SemanticSearch

Candidate = TypeVar("Candidate")


class RefreshService(Protocol):
    def refresh_all(self) -> RefreshReport: ...


def run_refresh(service: RefreshService) -> int:
    report = service.refresh_all()
    print(f"Refreshed: {report.refreshed}; current/obsolete/deleted: {report.skipped}; failed: {report.failed}")
    return 1 if report.failed else 0


def run_search(service: SemanticSearch[Candidate], query: str, limit: int,
               formatter: Callable[[int, Candidate], str], empty_message: str) -> int:
    candidates = service.search(query, limit)
    for rank, candidate in enumerate(candidates, 1):
        print(formatter(rank, candidate))
    if not candidates:
        print(empty_message)
    return 0


def run_command(*, description: str,
                refresh_factory: Callable[[Callable[[], Session], EmbeddingClient], RefreshService],
                search_factory: Callable[[Callable[[], Session], EmbeddingClient], SemanticSearch[Candidate]],
                formatter: Callable[[int, Candidate], str], empty_message: str) -> int:
    parser = argparse.ArgumentParser(description=description)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("refresh")
    search = commands.add_parser("search")
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    embeddings = EmbeddingClient.from_settings(get_settings())
    try:
        if not embeddings.available:
            raise SemanticSearchUnavailable("Semantic capability unavailable: OPENAI_API_KEY is missing")
        if args.command == "refresh":
            return run_refresh(refresh_factory(SessionLocal, embeddings))
        return run_search(search_factory(SessionLocal, embeddings), args.query, args.limit, formatter, empty_message)
    except (ValueError, SemanticSearchUnavailable, QueryEmbeddingError) as error:
        print(str(error))
        return 1
    finally:
        embeddings.close()
