from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
import logging
from threading import Condition, Lock, Thread
from typing import Generic, TypeVar, cast
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import event
from sqlalchemy.orm import Session, SessionTransaction

logger = logging.getLogger(__name__)
RefreshId = TypeVar("RefreshId", int, UUID)


@dataclass
class RefreshReport:
    refreshed: int = 0
    skipped: int = 0
    failed: int = 0


class RefreshCoordinator(Generic[RefreshId]):
    def __init__(self, transaction_key: str, label: str) -> None:
        self.transaction_key = transaction_key
        self.label = label
        self._subscriber_lock = Lock()
        self._subscribers: set[Callable[[RefreshId], None]] = set()
        event.listen(Session, "after_commit", self._after_commit)
        event.listen(Session, "after_soft_rollback", self._after_rollback)

    def mark(self, session: Session, record_id: RefreshId) -> None:
        transaction = session.get_nested_transaction() or session.get_transaction()
        if transaction is None:
            raise RuntimeError(f"{self.label} refresh requires an active write transaction")
        pending = cast(dict[SessionTransaction, set[RefreshId]], session.info.setdefault(self.transaction_key, {}))
        pending.setdefault(transaction, set()).add(record_id)

    def subscribe(self, subscriber: Callable[[RefreshId], None]) -> None:
        with self._subscriber_lock:
            self._subscribers.add(subscriber)

    def unsubscribe(self, subscriber: Callable[[RefreshId], None]) -> None:
        with self._subscriber_lock:
            self._subscribers.discard(subscriber)

    def _after_commit(self, session: Session) -> None:
        pending = cast(dict[SessionTransaction, set[RefreshId]], session.info.get(self.transaction_key, {}))
        transaction = session.get_nested_transaction() or session.get_transaction()
        ids = pending.pop(transaction, set()) if transaction else set()
        if transaction and transaction.nested and transaction.parent:
            pending.setdefault(transaction.parent, set()).update(ids)
            return
        with self._subscriber_lock:
            subscribers = tuple(self._subscribers)
        for record_id in ids:
            for subscriber in subscribers:
                try:
                    subscriber(record_id)
                except Exception as error:
                    logger.error("Committed %s refresh scheduling failed (%s)", self.label, type(error).__name__)

    def _after_rollback(self, session: Session, previous_transaction: SessionTransaction) -> None:
        pending = cast(dict[SessionTransaction, set[RefreshId]], session.info.get(self.transaction_key, {}))
        pending.pop(previous_transaction, None)


def next_nightly(now: datetime) -> datetime:
    local = now.astimezone(ZoneInfo("Europe/Berlin"))
    target = datetime.combine(local.date(), time(3), tzinfo=local.tzinfo)
    if target <= local:
        target = datetime.combine(local.date() + timedelta(days=1), time(3), tzinfo=local.tzinfo)
    return target.astimezone(timezone.utc)


class EmbeddingRefreshWorker(Generic[RefreshId]):
    def __init__(self, refresh_one: Callable[[RefreshId], str], sweep: Callable[[], object],
                 clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
                 *, coordinator: RefreshCoordinator[RefreshId] | None = None) -> None:
        self.refresh_one = refresh_one
        self.sweep = sweep
        self.clock = clock
        self.coordinator = coordinator
        self.condition = Condition()
        self.pending: set[RefreshId] = set()
        self.stopping = False
        self.thread: Thread | None = None
        self.next_run = next_nightly(self.clock())

    def start(self) -> None:
        if self.coordinator:
            self.coordinator.subscribe(self.enqueue)
        try:
            self.thread = Thread(target=self._run, name="embedding-refresh", daemon=True)
            self.thread.start()
        except Exception:
            if self.coordinator:
                self.coordinator.unsubscribe(self.enqueue)
            self.thread = None
            raise

    def enqueue(self, record_id: RefreshId) -> None:
        with self.condition:
            if not self.stopping:
                self.pending.add(record_id)
                self.condition.notify()

    def wake(self) -> None:
        with self.condition:
            self.condition.notify()

    def is_stopping(self) -> bool:
        with self.condition:
            return self.stopping

    def stop(self) -> None:
        if self.coordinator:
            self.coordinator.unsubscribe(self.enqueue)
        with self.condition:
            self.stopping = True
            self.condition.notify()
        if self.thread:
            self.thread.join()

    def _run(self) -> None:
        while True:
            with self.condition:
                if self.stopping:
                    return
                now = self.clock()
                nightly = now >= self.next_run
                record_id = min(self.pending) if self.pending and not nightly else None
                if record_id is not None:
                    self.pending.remove(record_id)
                elif nightly:
                    self.next_run = next_nightly(now)
                else:
                    self.condition.wait(timeout=min(60.0, max(0.0, (self.next_run - now).total_seconds())))
                    continue
            try:
                if nightly:
                    self.sweep()
                elif record_id is not None:
                    self.refresh_one(record_id)
            except Exception as error:
                logger.error("Embedding background work failed (%s); skipped", type(error).__name__)
