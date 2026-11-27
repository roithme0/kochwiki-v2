from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.infrastructure.embeddings.refresh import RefreshCoordinator
from app.infrastructure.embeddings.service import EmbeddingService
from app.recipes.models.embedding import RecipeEmbedding
from app.recipes.models.recipe import RecipeVersion
from app.recipes.models.version_state import (
    SEARCHABLE_RECIPE_STATES,
    RecipeVersionState,
)

recipe_refresh = RefreshCoordinator[UUID]("recipe_embedding_refresh", "Recipe")


def mark_recipe_refresh(session: Session, recipe_id: UUID) -> None:
    recipe_refresh.mark(session, recipe_id)


def remove_recipe_embedding(session: Session, version_id: UUID) -> None:
    session.execute(
        delete(RecipeEmbedding).where(RecipeEmbedding.recipe_version_id == version_id),
        execution_options={"kochwiki_query_name": "Delete recipe embedding"},
    )


class RecipeEmbeddingService(EmbeddingService[UUID, RecipeEmbedding]):
    label = "Recipe"

    def _load_source_text(
        self, session: Session, record_id: UUID, *, for_update: bool
    ) -> str | None:
        statement = select(RecipeVersion).where(RecipeVersion.version_id == record_id)
        query_name = "Get recipe embedding source"
        if for_update:
            statement = statement.with_for_update()
            query_name = "Lock recipe embedding source"
        version = session.scalar(
            statement, execution_options={"kochwiki_query_name": query_name}
        )
        return (
            version.name
            if version is not None and version.state in SEARCHABLE_RECIPE_STATES
            else None
        )

    def _load_embedding(
        self, session: Session, record_id: UUID
    ) -> RecipeEmbedding | None:
        return session.get(
            RecipeEmbedding,
            record_id,
            execution_options={"kochwiki_query_name": "Get recipe embedding by ID"},
        )

    def _new_embedding(
        self, record_id: UUID, profile: str, text: str, vector: list[float]
    ) -> RecipeEmbedding:
        return RecipeEmbedding(
            recipe_version_id=record_id,
            profile=profile,
            source_text=text,
            vector=vector,
        )

    def _refresh_ids(self, session: Session) -> list[UUID]:
        return list(
            session.scalars(
                select(RecipeVersion.version_id)
                .where(RecipeVersion.state.in_(SEARCHABLE_RECIPE_STATES))
                .order_by(RecipeVersion.version_id),
                execution_options={
                    "kochwiki_query_name": "List recipe embedding refresh IDs"
                },
            )
        )

    def _before_sweep(self) -> None:
        with self.sessions() as session, session.begin():
            session.execute(
                delete(RecipeEmbedding).where(
                    RecipeEmbedding.recipe_version_id.in_(
                        select(RecipeVersion.version_id).where(
                            RecipeVersion.state == RecipeVersionState.HISTORICAL
                        )
                    )
                ),
                execution_options={
                    "kochwiki_query_name": "Delete historical recipe embeddings"
                },
            )
