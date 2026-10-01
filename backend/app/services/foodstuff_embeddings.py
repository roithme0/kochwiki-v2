from collections.abc import Callable
from dataclasses import dataclass
import logging
from threading import Lock

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.foodstuff import Foodstuff
from app.models.foodstuff_embedding import FoodstuffEmbedding
from app.services.embeddings import EmbeddingClient, source_text

logger = logging.getLogger(__name__)


@dataclass
class RefreshReport:
    refreshed: int = 0
    skipped: int = 0
    failed: int = 0


class FoodstuffEmbeddingService:
    def __init__(self, sessions: Callable[[], Session], embeddings: EmbeddingClient) -> None:
        self.sessions = sessions
        self.embeddings = embeddings
        self.model = embeddings.model
        self.refresh_lock = Lock()

    def refresh_one(self, foodstuff_id: int) -> str:
        if not self.embeddings.available:
            return "disabled"
        with self.refresh_lock:
            try:
                return self._refresh_one(foodstuff_id)
            except Exception as error:
                logger.error("Foodstuff %s embedding refresh failed (%s); skipped", foodstuff_id, type(error).__name__)
                return "failed"

    def _refresh_one(self, foodstuff_id: int) -> str:
        with self.sessions() as session:
            foodstuff = session.get(Foodstuff, foodstuff_id)
            if foodstuff is None:
                return "skipped"
            requested_text = source_text(foodstuff.name, foodstuff.brand)
            requested_model = self.model
            existing = session.get(FoodstuffEmbedding, foodstuff_id)
            if existing and existing.model == requested_model and existing.source_text == requested_text:
                return "skipped"
        vector = self.embeddings.embed(requested_text, requested_model)
        with self.sessions() as session, session.begin():
            foodstuff = session.scalar(select(Foodstuff).where(Foodstuff.id == foodstuff_id).with_for_update())
            if foodstuff is None or source_text(foodstuff.name, foodstuff.brand) != requested_text or self.model != requested_model:
                return "skipped"
            existing = session.get(FoodstuffEmbedding, foodstuff_id)
            if existing is None:
                session.add(FoodstuffEmbedding(foodstuff_id=foodstuff_id, model=requested_model, source_text=requested_text, vector=vector))
            else:
                existing.model = requested_model
                existing.source_text = requested_text
                existing.vector = vector
        return "refreshed"

    def refresh_all(self, stop_requested: Callable[[], bool] = lambda: False) -> RefreshReport:
        report = RefreshReport()
        if not self.embeddings.available:
            logger.warning("Foodstuff embedding refresh disabled: OPENAI_API_KEY is missing")
            return report
        with self.sessions() as session:
            ids = list(session.scalars(select(Foodstuff.id).order_by(Foodstuff.id)))
        for foodstuff_id in ids:
            if stop_requested():
                break
            outcome = self.refresh_one(foodstuff_id)
            if outcome == "refreshed":
                report.refreshed += 1
            elif outcome == "failed":
                report.failed += 1
            else:
                report.skipped += 1
        return report
