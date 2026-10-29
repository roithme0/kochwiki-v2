"""Operational commands: python -m app.recipes.semantic refresh|search."""

from app.infrastructure.embeddings.commands import run_command
from app.recipes.services.embeddings import RecipeEmbeddingService
from app.recipes.services.search import RecipeSearchCandidate, RecipeSemanticSearch


def format_candidate(rank: int, candidate: RecipeSearchCandidate) -> str:
    return candidate.recipe.model_dump_json()


def main() -> int:
    return run_command(
        description="Refresh recipe embeddings or search recipe names",
        refresh_factory=RecipeEmbeddingService,
        search_factory=RecipeSemanticSearch,
        formatter=format_candidate,
        empty_message="No current recipe embeddings",
    )


if __name__ == "__main__":
    raise SystemExit(main())
