from abc import ABC, abstractmethod
from collections.abc import Callable
import logging
from threading import Lock
from typing import Generic, TypeVar

from sqlalchemy.orm import Session

from app.models.embedding import EmbeddingMixin
from app.services.embedding_refresh import RefreshId, RefreshReport
from app.services.embeddings import EmbeddingClient

EmbeddingRecord = TypeVar("EmbeddingRecord", bound=EmbeddingMixin)
logger = logging.getLogger(__name__)


class EmbeddingService(Generic[RefreshId, EmbeddingRecord], ABC):
    label: str

    def __init__(self, sessions: Callable[[], Session], embeddings: EmbeddingClient) -> None:
        self.sessions = sessions
        self.embeddings = embeddings
        self.model = embeddings.model
        self.refresh_lock = Lock()

    def refresh_one(self, record_id: RefreshId) -> str:
        if not self.embeddings.available:
            return "disabled"
        with self.refresh_lock:
            try:
                return self._refresh_one(record_id)
            except Exception as error:
                logger.error("%s %s embedding refresh failed (%s); skipped", self.label, record_id, type(error).__name__)
                return "failed"

    def _refresh_one(self, record_id: RefreshId) -> str:
        with self.sessions() as session:
            requested_text = self._load_source_text(session, record_id, for_update=False)
            if requested_text is None:
                return "skipped"
            requested_model = self.model
            existing = self._load_embedding(session, record_id)
            if existing and existing.model == requested_model and existing.source_text == requested_text:
                return "skipped"
        vector = self.embeddings.embed(requested_text, requested_model)
        with self.sessions() as session, session.begin():
            current_text = self._load_source_text(session, record_id, for_update=True)
            if current_text is None or current_text != requested_text or self.model != requested_model:
                return "skipped"
            existing = self._load_embedding(session, record_id)
            if existing is None:
                session.add(self._new_embedding(record_id, requested_model, requested_text, vector))
            else:
                existing.model = requested_model
                existing.source_text = requested_text
                existing.vector = vector
        return "refreshed"

    def refresh_all(self, stop_requested: Callable[[], bool] = lambda: False) -> RefreshReport:
        report = RefreshReport()
        self._before_sweep()
        if not self.embeddings.available:
            logger.warning("%s embedding refresh disabled: OPENAI_API_KEY is missing", self.label)
            return report
        with self.sessions() as session:
            ids = self._refresh_ids(session)
        for record_id in ids:
            if stop_requested():
                break
            outcome = self.refresh_one(record_id)
            if outcome == "refreshed":
                report.refreshed += 1
            elif outcome == "failed":
                report.failed += 1
            else:
                report.skipped += 1
        return report

    def _before_sweep(self) -> None:
        pass

    @abstractmethod
    def _load_source_text(self, session: Session, record_id: RefreshId, *, for_update: bool) -> str | None:
        """Return eligible source text, locking the source row when requested."""
        ...

    @abstractmethod
    def _load_embedding(self, session: Session, record_id: RefreshId) -> EmbeddingRecord | None:
        ...

    @abstractmethod
    def _new_embedding(self, record_id: RefreshId, model: str, text: str, vector: list[float]) -> EmbeddingRecord:
        ...

    @abstractmethod
    def _refresh_ids(self, session: Session) -> list[RefreshId]:
        ...
