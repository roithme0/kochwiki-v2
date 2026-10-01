"""Operational commands: python -m app.foodstuff_semantic refresh|search."""
import argparse
import logging

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.embeddings import EmbeddingClient
from app.services.foodstuff_embeddings import FoodstuffEmbeddingService
from app.services.foodstuff_search import FoodstuffSemanticSearch, QueryEmbeddingError, SemanticSearchUnavailable


def run_refresh(service: FoodstuffEmbeddingService) -> int:
    report = service.refresh_all()
    print(f"Refreshed: {report.refreshed}; current/obsolete/deleted: {report.skipped}; failed: {report.failed}")
    return 1 if report.failed else 0


def run_search(service: FoodstuffSemanticSearch, query: str, limit: int) -> int:
    candidates = service.search(query, limit)
    for rank, candidate in enumerate(candidates, 1):
        foodstuff = candidate.foodstuff
        print(f"{rank}. [{foodstuff.id}] {foodstuff.name} ({foodstuff.brand or 'no brand'}): cosine distance {candidate.cosine_distance:.6f}")
    if not candidates:
        print("No current foodstuff embeddings")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh foodstuff embeddings or search ingredient aliases")
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
            return run_refresh(FoodstuffEmbeddingService(SessionLocal, embeddings))
        return run_search(FoodstuffSemanticSearch(SessionLocal, embeddings), args.query, args.limit)
    except (ValueError, SemanticSearchUnavailable, QueryEmbeddingError) as error:
        print(str(error))
        return 1
    finally:
        embeddings.close()


if __name__ == "__main__":
    raise SystemExit(main())
