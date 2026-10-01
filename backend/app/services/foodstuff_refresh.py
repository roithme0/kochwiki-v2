from sqlalchemy.orm import Session

from app.services.embedding_refresh import RefreshCoordinator

foodstuff_refresh = RefreshCoordinator[int]("foodstuff_embedding_refresh", "Foodstuff")


def mark_foodstuff_refresh(session: Session, foodstuff_id: int) -> None:
    foodstuff_refresh.mark(session, foodstuff_id)
