from dataclasses import dataclass

from sqlalchemy import select

from app.foodstuffs.models.foodstuff import Foodstuff
from app.foodstuffs.models.foodstuff_embedding import FoodstuffEmbedding
from app.foodstuffs.schemas.foodstuff import FoodstuffSummaryOut
from app.infrastructure.embeddings.semantic_search import SemanticSearch
from app.foodstuffs.services.foodstuff_embedding_text import current_source_text
from app.foodstuffs.services.foodstuffs import foodstuff_summary_out


@dataclass(frozen=True)
class FoodstuffSearchCandidate:
    foodstuff: FoodstuffSummaryOut
    cosine_distance: float


class FoodstuffSemanticSearch(SemanticSearch[FoodstuffSearchCandidate]):
    def _retrieve(self, vector: list[float], limit: int) -> list[FoodstuffSearchCandidate]:
        distance = FoodstuffEmbedding.vector.cosine_distance(vector).label("distance")
        statement = (select(Foodstuff, distance)
            .join(FoodstuffEmbedding, FoodstuffEmbedding.foodstuff_id == Foodstuff.id)
            .where(FoodstuffEmbedding.model == self.model, FoodstuffEmbedding.source_text == current_source_text())
            .order_by(distance, Foodstuff.id).limit(limit))
        with self.sessions() as session:
            return [FoodstuffSearchCandidate(foodstuff_summary_out(foodstuff), float(distance_value)) for foodstuff, distance_value in session.execute(statement)]
