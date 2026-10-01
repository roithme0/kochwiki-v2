from collections.abc import Callable
from datetime import datetime, time, timedelta, timezone
import logging
from threading import Condition, Lock, Thread
from typing import cast
from zoneinfo import ZoneInfo

from sqlalchemy import event
from sqlalchemy.orm import Session, SessionTransaction

logger = logging.getLogger(__name__)
_pending_key = "foodstuff_embedding_refresh"
_subscriber_lock = Lock()
_subscribers: set[Callable[[int], None]] = set()


def mark_foodstuff_refresh(session: Session, foodstuff_id: int) -> None:
    transaction = session.get_nested_transaction() or session.get_transaction()
    if transaction is None:
        raise RuntimeError("Foodstuff refresh requires an active write transaction")
    pending = cast(dict[SessionTransaction, set[int]], session.info.setdefault(_pending_key, {}))
    pending.setdefault(transaction, set()).add(foodstuff_id)


@event.listens_for(Session, "after_commit")
def _after_commit(session: Session) -> None:
    pending = cast(dict[SessionTransaction, set[int]], session.info.get(_pending_key, {}))
    transaction = session.get_nested_transaction() or session.get_transaction()
    ids = pending.pop(transaction, set()) if transaction else set()
    if transaction and transaction.nested and transaction.parent:
        pending.setdefault(transaction.parent, set()).update(ids)
        return
    with _subscriber_lock:
        subscribers = tuple(_subscribers)
    for foodstuff_id in ids:
        for subscriber in subscribers:
            try:
                subscriber(foodstuff_id)
            except Exception as error:
                logger.error("Committed foodstuff refresh scheduling failed (%s)", type(error).__name__)


@event.listens_for(Session, "after_soft_rollback")
def _after_rollback(session: Session, previous_transaction: SessionTransaction) -> None:
    pending = cast(dict[SessionTransaction, set[int]], session.info.get(_pending_key, {}))
    pending.pop(previous_transaction, None)


def next_nightly(now: datetime) -> datetime:
    local = now.astimezone(ZoneInfo("Europe/Berlin"))
    target = datetime.combine(local.date(), time(3), tzinfo=local.tzinfo)
    if target <= local:
        target = datetime.combine(local.date() + timedelta(days=1), time(3), tzinfo=local.tzinfo)
    return target.astimezone(timezone.utc)


class RefreshWorker:
    def __init__(self, refresh_one: Callable[[int], str], sweep: Callable[[], object],
                 clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc)) -> None:
        self.refresh_one = refresh_one
        self.sweep = sweep
        self.clock = clock
        self.condition = Condition()
        self.pending: set[int] = set()
        self.stopping = False
        self.thread: Thread | None = None
        self.next_run = next_nightly(self.clock())

    def start(self) -> None:
        with _subscriber_lock:
            _subscribers.add(self.enqueue)
        self.thread = Thread(target=self._run, name="foodstuff-embedding-refresh", daemon=True)
        self.thread.start()

    def enqueue(self, foodstuff_id: int) -> None:
        with self.condition:
            if not self.stopping:
                self.pending.add(foodstuff_id)
                self.condition.notify()

    def wake(self) -> None:
        with self.condition:
            self.condition.notify()

    def is_stopping(self) -> bool:
        with self.condition:
            return self.stopping

    def stop(self) -> None:
        with _subscriber_lock:
            _subscribers.discard(self.enqueue)
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
                foodstuff_id = min(self.pending) if self.pending and not nightly else None
                if foodstuff_id is not None:
                    self.pending.remove(foodstuff_id)
                elif nightly:
                    self.next_run = next_nightly(now)
                else:
                    self.condition.wait(timeout=min(60.0, max(0.0, (self.next_run - now).total_seconds())))
                    continue
            try:
                if nightly:
                    self.sweep()
                elif foodstuff_id is not None:
                    self.refresh_one(foodstuff_id)
            except Exception as error:
                logger.error("Foodstuff embedding background work failed (%s); skipped", type(error).__name__)
