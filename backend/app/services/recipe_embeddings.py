from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.enums import SEARCHABLE_RECIPE_STATES, RecipeVersionState
from app.models.recipe import RecipeVersion
from app.models.recipe_embedding import RecipeEmbedding
from app.services.embedding_service import EmbeddingService

def remove_recipe_embedding(session: Session, version_id: UUID) -> None:
    session.execute(delete(RecipeEmbedding).where(RecipeEmbedding.recipe_version_id == version_id))


class RecipeEmbeddingService(EmbeddingService[UUID, RecipeEmbedding]):
    label = "Recipe"

    def _load_source_text(self, session: Session, record_id: UUID, *, for_update: bool) -> str | None:
        statement = select(RecipeVersion).where(RecipeVersion.version_id == record_id)
        if for_update:
            statement = statement.with_for_update()
        version = session.scalar(statement)
        return version.name if version is not None and version.state in SEARCHABLE_RECIPE_STATES else None

    def _load_embedding(self, session: Session, record_id: UUID) -> RecipeEmbedding | None:
        return session.get(RecipeEmbedding, record_id)

    def _new_embedding(self, record_id: UUID, model: str, text: str, vector: list[float]) -> RecipeEmbedding:
        return RecipeEmbedding(recipe_version_id=record_id, model=model, source_text=text, vector=vector)

    def _refresh_ids(self, session: Session) -> list[UUID]:
        return list(session.scalars(select(RecipeVersion.version_id)
            .where(RecipeVersion.state.in_(SEARCHABLE_RECIPE_STATES)).order_by(RecipeVersion.version_id)))

    def _before_sweep(self) -> None:
        with self.sessions() as session, session.begin():
            session.execute(delete(RecipeEmbedding).where(RecipeEmbedding.recipe_version_id.in_(
                select(RecipeVersion.version_id).where(RecipeVersion.state == RecipeVersionState.HISTORICAL)
            )))
