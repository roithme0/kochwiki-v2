from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.recipe import Ingredient, RecipeVersion
from app.models.enums import SEARCHABLE_RECIPE_STATES
from app.models.recipe_embedding import RecipeEmbedding
from app.schemas.recipe import RecipeVersionOut
from app.services.semantic_search import SemanticSearch
from app.services.recipes import recipe_version_out


@dataclass(frozen=True)
class RecipeSearchCandidate:
    recipe: RecipeVersionOut
    cosine_distance: float


class RecipeSemanticSearch(SemanticSearch[RecipeSearchCandidate]):
    def _retrieve(self, vector: list[float], limit: int) -> list[RecipeSearchCandidate]:
        distance = RecipeEmbedding.vector.cosine_distance(vector).label("distance")
        statement = (select(RecipeVersion, distance)
            .join(RecipeEmbedding, RecipeEmbedding.recipe_version_id == RecipeVersion.version_id)
            .where(RecipeVersion.state.in_(SEARCHABLE_RECIPE_STATES), RecipeEmbedding.model == self.model,
                   RecipeEmbedding.source_text == RecipeVersion.name)
            .options(selectinload(RecipeVersion.ingredients).selectinload(Ingredient.foodstuff),
                     selectinload(RecipeVersion.steps))
            .order_by(distance, RecipeVersion.version_id).limit(limit))
        with self.sessions() as session:
            return [RecipeSearchCandidate(recipe_version_out(version), float(distance_value))
                    for version, distance_value in session.execute(statement)]
