from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.foodstuff import Foodstuff
from app.models.foodstuff_embedding import FoodstuffEmbedding
from app.services.embedding_service import EmbeddingService
from app.services.foodstuff_embedding_text import source_text


class FoodstuffEmbeddingService(EmbeddingService[int, FoodstuffEmbedding]):
    label = "Foodstuff"

    def _load_source_text(self, session: Session, record_id: int, *, for_update: bool) -> str | None:
        statement = select(Foodstuff).where(Foodstuff.id == record_id)
        if for_update:
            statement = statement.with_for_update()
        foodstuff = session.scalar(statement)
        return source_text(foodstuff.name, foodstuff.brand) if foodstuff is not None else None

    def _load_embedding(self, session: Session, record_id: int) -> FoodstuffEmbedding | None:
        return session.get(FoodstuffEmbedding, record_id)

    def _new_embedding(self, record_id: int, model: str, text: str, vector: list[float]) -> FoodstuffEmbedding:
        return FoodstuffEmbedding(foodstuff_id=record_id, model=model, source_text=text, vector=vector)

    def _refresh_ids(self, session: Session) -> list[int]:
        return list(session.scalars(select(Foodstuff.id).order_by(Foodstuff.id)))
