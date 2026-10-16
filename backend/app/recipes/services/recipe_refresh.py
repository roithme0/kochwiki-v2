from uuid import UUID

from sqlalchemy.orm import Session

from app.services.embedding_refresh import RefreshCoordinator

recipe_refresh = RefreshCoordinator[UUID]("recipe_embedding_refresh", "Recipe")


def mark_recipe_refresh(session: Session, recipe_id: UUID) -> None:
    recipe_refresh.mark(session, recipe_id)
