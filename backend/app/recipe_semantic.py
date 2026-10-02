"""Operational commands: python -m app.recipe_semantic refresh|search."""
from app.semantic_commands import run_command
from app.services.recipe_embeddings import RecipeEmbeddingService
from app.services.recipe_search import RecipeSearchCandidate, RecipeSemanticSearch


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
