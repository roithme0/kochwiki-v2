"""Operational commands: python -m app.foodstuffs.semantic refresh|search."""

from app.infrastructure.embeddings.commands import run_command
from app.foodstuffs.services.embeddings import FoodstuffEmbeddingService
from app.foodstuffs.services.search import (
    FoodstuffSearchCandidate,
    FoodstuffSemanticSearch,
)


def format_candidate(rank: int, candidate: FoodstuffSearchCandidate) -> str:
    foodstuff = candidate.foodstuff
    return f"{rank}. [{foodstuff.id}] {foodstuff.name} ({foodstuff.brand or 'no brand'}): cosine distance {candidate.cosine_distance:.6f}"


def main() -> int:
    return run_command(
        description="Refresh foodstuff embeddings or search ingredient aliases",
        refresh_factory=FoodstuffEmbeddingService,
        search_factory=FoodstuffSemanticSearch,
        formatter=format_candidate,
        empty_message="No current foodstuff embeddings",
    )


if __name__ == "__main__":
    raise SystemExit(main())
