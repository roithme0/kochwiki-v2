from sqlalchemy import case, literal, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.foodstuffs.models.embedding import FoodstuffEmbedding
from app.foodstuffs.models.foodstuff import Foodstuff
from app.infrastructure.embeddings.refresh import RefreshCoordinator
from app.infrastructure.embeddings.service import EmbeddingService

foodstuff_refresh = RefreshCoordinator[int]("foodstuff_embedding_refresh", "Foodstuff")


def mark_foodstuff_refresh(session: Session, foodstuff_id: int) -> None:
    foodstuff_refresh.mark(session, foodstuff_id)


def source_text(name: str, brand: str | None, details: str | None = None) -> str:
    return (
        name
        + ("\nBrand: " + brand if brand else "")
        + ("\nDetails: " + details if details else "")
    )


def current_source_text() -> ColumnElement[str]:
    return (
        Foodstuff.name
        + case(
            (
                (Foodstuff.brand.is_not(None)) & (Foodstuff.brand != ""),
                literal("\nBrand: ") + Foodstuff.brand,
            ),
            else_=literal(""),
        )
        + case(
            (
                Foodstuff.details.is_not(None),
                literal("\nDetails: ") + Foodstuff.details,
            ),
            else_=literal(""),
        )
    )


class FoodstuffEmbeddingService(EmbeddingService[int, FoodstuffEmbedding]):
    label = "Foodstuff"

    def _load_source_text(
        self, session: Session, record_id: int, *, for_update: bool
    ) -> str | None:
        statement = select(Foodstuff).where(Foodstuff.id == record_id)
        query_name = "Get foodstuff embedding source"
        if for_update:
            statement = statement.with_for_update()
            query_name = "Lock foodstuff embedding source"
        foodstuff = session.scalar(
            statement, execution_options={"kochwiki_query_name": query_name}
        )
        return (
            source_text(foodstuff.name, foodstuff.brand, foodstuff.details)
            if foodstuff is not None
            else None
        )

    def _load_embedding(
        self, session: Session, record_id: int
    ) -> FoodstuffEmbedding | None:
        return session.get(
            FoodstuffEmbedding,
            record_id,
            execution_options={"kochwiki_query_name": "Get foodstuff embedding by ID"},
        )

    def _new_embedding(
        self, record_id: int, profile: str, text: str, vector: list[float]
    ) -> FoodstuffEmbedding:
        return FoodstuffEmbedding(
            foodstuff_id=record_id, profile=profile, source_text=text, vector=vector
        )

    def _refresh_ids(self, session: Session) -> list[int]:
        return list(
            session.scalars(
                select(Foodstuff.id).order_by(Foodstuff.id),
                execution_options={
                    "kochwiki_query_name": "List foodstuff embedding refresh IDs"
                },
            )
        )
