from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.recipes.models.recipe import Ingredient, RecipeVersion
from app.recipes.models.version_state import SEARCHABLE_RECIPE_STATES
from app.recipes.models.embedding import RecipeEmbedding
from app.recipes.schemas.recipe import RecipeVersionOut
from app.infrastructure.embeddings.semantic_search import SemanticSearch
from app.recipes.services.recipes import recipe_version_out


@dataclass(frozen=True)
class RecipeSearchCandidate:
    recipe: RecipeVersionOut
    cosine_distance: float


class RecipeSemanticSearch(SemanticSearch[RecipeSearchCandidate]):
    def _retrieve(self, vector: list[float], limit: int) -> list[RecipeSearchCandidate]:
        distance = RecipeEmbedding.vector.cosine_distance(vector).label("distance")
        statement = (
            select(RecipeVersion, distance)
            .join(
                RecipeEmbedding,
                RecipeEmbedding.recipe_version_id == RecipeVersion.version_id,
            )
            .where(
                RecipeVersion.state.in_(SEARCHABLE_RECIPE_STATES),
                RecipeEmbedding.profile == self.profile,
                RecipeEmbedding.source_text == RecipeVersion.name,
            )
            .options(
                selectinload(RecipeVersion.ingredients).selectinload(
                    Ingredient.foodstuff
                ),
                selectinload(RecipeVersion.steps),
            )
            .order_by(distance, RecipeVersion.version_id)
            .limit(limit)
        )
        with self.sessions() as session:
            return [
                RecipeSearchCandidate(
                    recipe_version_out(version), float(distance_value)
                )
                for version, distance_value in session.execute(statement)
            ]
