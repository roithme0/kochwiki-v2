from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from threading import Lock
from time import perf_counter
from typing import Literal
from weakref import WeakKeyDictionary

from opentelemetry.metrics import Histogram, Meter
from psycopg import OperationalError
from sqlalchemy import Delete, Insert, Table, Update, event
from sqlalchemy.engine import Connection, Engine, ExceptionContext, ExecutionContext
from sqlalchemy.pool import PoolProxiedConnection, QueuePool

from .base import Base

ACQUISITION_DURATION = "kochwiki.postgresql.connection.acquisition.duration"
QUERY_DURATION = "kochwiki.postgresql.query.execution.duration"
DURATION_BUCKETS = (0.005, 0.02, 0.1, 0.5)
type QueryOutcome = Literal["success", "operational_failure", "statement_error"]


class ObservedQueuePool(QueuePool):
    acquisition_duration: Histogram | None = None

    def connect(self) -> PoolProxiedConnection:
        histogram = self.acquisition_duration
        if histogram is None:
            return super().connect()

        start = perf_counter()
        try:
            connection = super().connect()
        except Exception:
            histogram.record(perf_counter() - start, {"outcome": "operational_failure"})
            raise
        histogram.record(perf_counter() - start, {"outcome": "success"})
        return connection

    def recreate(self) -> "ObservedQueuePool":
        pool = super().recreate()
        assert isinstance(pool, ObservedQueuePool)
        pool.acquisition_duration = self.acquisition_duration
        return pool


def _query_name(context: ExecutionContext) -> str:
    name = context.execution_options.get("kochwiki_query_name")
    if isinstance(name, str) and name:
        return name

    if context.compiled is not None:
        statement = context.compiled.statement
        if isinstance(statement, (Insert, Update, Delete)):
            table = statement.table
            if isinstance(table, Table) and table.metadata is Base.metadata:
                return f"{statement.__visit_name__.upper()} {table.name}"

    return "Unclassified"


@contextmanager
def observe_postgresql(engine: Engine, meter: Meter) -> Iterator[None]:
    pool = engine.pool
    assert isinstance(pool, ObservedQueuePool)
    acquisition = meter.create_histogram(ACQUISITION_DURATION, unit="s")
    execution = meter.create_histogram(QUERY_DURATION, unit="s")
    starts: WeakKeyDictionary[ExecutionContext, float] = WeakKeyDictionary()
    lock = Lock()

    def before_execute(
        connection: Connection,
        cursor: object,
        sql: str,
        parameters: object,
        context: ExecutionContext | None,
        executemany: bool,
    ) -> None:
        if context is not None:
            with lock:
                starts[context] = perf_counter()

    def finish(context: ExecutionContext | None, outcome: QueryOutcome) -> None:
        if context is None:
            return
        end = perf_counter()
        with lock:
            start = starts.pop(context, None)
        if start is not None:
            execution.record(
                end - start, {"query.name": _query_name(context), "outcome": outcome}
            )

    def after_execute(
        connection: Connection,
        cursor: object,
        sql: str,
        parameters: object,
        context: ExecutionContext | None,
        executemany: bool,
    ) -> None:
        finish(context, "success")

    def handle_error(error: ExceptionContext) -> None:
        operational = error.is_disconnect or isinstance(
            error.original_exception, OperationalError
        )
        finish(
            error.execution_context,
            "operational_failure" if operational else "statement_error",
        )

    def clear_acquisition_duration() -> None:
        pool.acquisition_duration = None
        current_pool = engine.pool
        if isinstance(current_pool, ObservedQueuePool):
            current_pool.acquisition_duration = None

    with ExitStack() as stack:
        event.listen(engine, "before_cursor_execute", before_execute)
        stack.callback(event.remove, engine, "before_cursor_execute", before_execute)
        event.listen(engine, "after_cursor_execute", after_execute)
        stack.callback(event.remove, engine, "after_cursor_execute", after_execute)
        event.listen(engine, "handle_error", handle_error)
        stack.callback(event.remove, engine, "handle_error", handle_error)
        stack.callback(clear_acquisition_duration)
        pool.acquisition_duration = acquisition
        yield
