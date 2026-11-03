"""Operational commands: python -m app.foodstuffs.semantic refresh|search."""

import argparse
from functools import partial

from app.infrastructure.embeddings.commands import (
    run_refresh_command,
    run_search_command,
)
from app.foodstuffs.services.embeddings import FoodstuffEmbeddingService
from app.foodstuffs.services.search import (
    FoodstuffSearchCandidate,
    FoodstuffSemanticSearch,
)


def format_candidate(rank: int, candidate: FoodstuffSearchCandidate) -> str:
    foodstuff = candidate.foodstuff
    return f"{rank}. [{foodstuff.id}] {foodstuff.name} ({foodstuff.brand or 'no brand'}): cosine distance {candidate.cosine_distance:.6f}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Refresh foodstuff embeddings or search ingredient aliases"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("refresh")
    search = commands.add_parser("search")
    search.add_argument("query")
    search.add_argument("--owner-id", type=int, required=True)
    search.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    if args.command == "refresh":
        return run_refresh_command(FoodstuffEmbeddingService)
    if args.owner_id <= 0:
        print("Owner ID must be positive")
        return 1
    return run_search_command(
        partial(FoodstuffSemanticSearch, owner_id=args.owner_id),
        args.query,
        args.limit,
        format_candidate,
        "No current foodstuff embeddings",
    )


if __name__ == "__main__":
    raise SystemExit(main())
