"""Operational commands: python -m app.recipes.semantic refresh|search."""

import argparse

from app.infrastructure.embeddings.commands import (
    run_refresh_command,
    run_search_command,
)
from app.recipes.services.embeddings import RecipeEmbeddingService
from app.recipes.services.search import RecipeSearchCandidate, RecipeSemanticSearch


def format_candidate(rank: int, candidate: RecipeSearchCandidate) -> str:
    return candidate.recipe.model_dump_json()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Refresh recipe embeddings or search recipe names"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("refresh")
    search = commands.add_parser("search")
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    if args.command == "refresh":
        return run_refresh_command(RecipeEmbeddingService)
    return run_search_command(
        RecipeSemanticSearch,
        args.query,
        args.limit,
        format_candidate,
        "No current recipe embeddings",
    )


if __name__ == "__main__":
    raise SystemExit(main())
