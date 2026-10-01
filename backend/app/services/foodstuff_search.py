from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.foodstuff import Foodstuff
from app.models.foodstuff_embedding import FoodstuffEmbedding
from app.schemas.foodstuff import FoodstuffSummaryOut
from app.services.embeddings import EmbeddingClient, current_source_text
from app.services.foodstuffs import foodstuff_summary_out


class SemanticSearchUnavailable(RuntimeError):
    pass


class QueryEmbeddingError(RuntimeError):
    pass


@dataclass(frozen=True)
class SearchCandidate:
    foodstuff: FoodstuffSummaryOut
    cosine_distance: float


class FoodstuffSemanticSearch:
    def __init__(self, sessions: Callable[[], Session], embeddings: EmbeddingClient) -> None:
        self.sessions = sessions
        self.embeddings = embeddings
        self.model = embeddings.model

    def search(self, query: str, limit: int = 5) -> list[SearchCandidate]:
        if not query.strip():
            raise ValueError("Query must not be blank")
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 20:
            raise ValueError("Result limit must be between 1 and 20")
        if not self.embeddings.available:
            raise SemanticSearchUnavailable("Semantic search unavailable: OPENAI_API_KEY is missing")
        try:
            vector = self.embeddings.embed(query.strip(), self.model)
        except Exception as error:
            raise QueryEmbeddingError("Query embedding failed (" + type(error).__name__ + ")") from None
        distance = FoodstuffEmbedding.vector.cosine_distance(vector).label("distance")
        statement = (select(Foodstuff, distance)
            .join(FoodstuffEmbedding, FoodstuffEmbedding.foodstuff_id == Foodstuff.id)
            .where(FoodstuffEmbedding.model == self.model, FoodstuffEmbedding.source_text == current_source_text())
            .order_by(distance, Foodstuff.id).limit(limit))
        with self.sessions() as session:
            return [SearchCandidate(foodstuff_summary_out(foodstuff), float(distance_value)) for foodstuff, distance_value in session.execute(statement)]
