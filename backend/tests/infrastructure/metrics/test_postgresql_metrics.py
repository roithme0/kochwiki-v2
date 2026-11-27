from collections.abc import Callable, Iterator

import pytest
from opentelemetry.metrics import Meter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import (
    Histogram,
    HistogramDataPoint,
    InMemoryMetricReader,
)
from psycopg import Connection as PsycopgConnection
from psycopg.errors import QueryCanceled
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import DBAPIError, IntegrityError, TimeoutError
from sqlalchemy.orm import Session

from app.foodstuffs.models.foodstuff import Foodstuff
from app.foodstuffs.models.unit import Unit
from app.foodstuffs.services.foodstuffs import list_foodstuffs
from app.identity.models.user import User
from app.identity.schemas.user import UserOut
from app.infrastructure.database.metrics import (
    ACQUISITION_DURATION,
    QUERY_DURATION,
    ObservedQueuePool,
    observe_postgresql,
)
from app.infrastructure.database.session import SessionLocal, engine


@pytest.fixture
def metrics() -> Iterator[tuple[Meter, InMemoryMetricReader]]:
    reader = InMemoryMetricReader()
    provider = MeterProvider(metric_readers=[reader])
    try:
        yield provider.get_meter("test"), reader
    finally:
        provider.shutdown()


@pytest.fixture
def pool_engine() -> Iterator[Engine]:
    pool_engine = create_engine(
        engine.url,
        poolclass=ObservedQueuePool,
        pool_pre_ping=True,
        pool_size=1,
        max_overflow=0,
        pool_timeout=0.01,
    )
    try:
        yield pool_engine
    finally:
        pool_engine.dispose()


def _points(reader: InMemoryMetricReader, name: str) -> list[HistogramDataPoint]:
    data = reader.get_metrics_data()
    points: list[HistogramDataPoint] = []
    if data is not None:
        for resource in data.resource_metrics:
            for scope in resource.scope_metrics:
                for metric in scope.metrics:
                    if metric.name == name:
                        assert isinstance(metric.data, Histogram)
                        points.extend(metric.data.data_points)
    return points


def _assert_series(
    reader: InMemoryMetricReader,
    name: str,
    *expected: tuple[dict[str, str], int],
) -> None:
    points = _points(reader, name)
    assert len(points) == len(expected)
    assert all(point.sum > 0 for point in points)
    for attributes, count in expected:
        assert [point.count for point in points if point.attributes == attributes] == [
            count
        ]


def test_unnamed_sql_and_generated_relationship_load_use_bounded_fallback(
    metrics: tuple[Meter, InMemoryMetricReader],
    pool_engine: Engine,
    provider_user: Callable[[str], UserOut],
) -> None:
    meter, reader = metrics
    owner = provider_user("Owner")
    with Session(pool_engine) as session, session.begin():
        session.add(Foodstuff(owner_id=owner.id, name="Private flour", unit=Unit.G))

    with (
        observe_postgresql(pool_engine, meter),
        SessionLocal(bind=pool_engine) as session,
    ):
        session.execute(
            text("SELECT 'private literal', CAST(:value AS text)"),
            {"value": "private bind parameter"},
        )
        list_foodstuffs(session, owner_id=owner.id)

    _assert_series(
        reader,
        QUERY_DURATION,
        ({"query.name": "List foodstuffs", "outcome": "success"}, 1),
        ({"query.name": "Unclassified", "outcome": "success"}, 2),
    )


def test_orm_flush_names_each_managed_dml_statement(
    metrics: tuple[Meter, InMemoryMetricReader],
    pool_engine: Engine,
    provider_user: Callable[[str], UserOut],
) -> None:
    meter, reader = metrics
    owner = provider_user("Owner")
    foodstuff = Foodstuff(
        owner_id=owner.id, name="Private flour", unit=Unit.G, ingredients=[]
    )
    with (
        observe_postgresql(pool_engine, meter),
        Session(pool_engine) as session,
    ):
        session.add_all(
            [
                foodstuff,
                User(
                    display_name="Private user",
                    email="private@example.invalid",
                    issuer="test",
                    subject="new",
                ),
            ]
        )
        session.flush()
        foodstuff.name = "Renamed flour"
        session.flush()
        session.delete(foodstuff)
        session.flush()

    _assert_series(
        reader,
        QUERY_DURATION,
        ({"query.name": "INSERT foodstuff", "outcome": "success"}, 1),
        ({"query.name": "INSERT user", "outcome": "success"}, 1),
        ({"query.name": "UPDATE foodstuff", "outcome": "success"}, 1),
        ({"query.name": "DELETE foodstuff", "outcome": "success"}, 1),
    )


def test_constraint_violation_records_statement_error(
    metrics: tuple[Meter, InMemoryMetricReader],
    pool_engine: Engine,
    provider_user: Callable[[str], UserOut],
) -> None:
    meter, reader = metrics
    existing_user = provider_user("Existing user")
    with (
        observe_postgresql(pool_engine, meter),
        Session(pool_engine) as session,
    ):
        session.add(
            User(
                display_name="Duplicate identity",
                email="duplicate@example.invalid",
                issuer=existing_user.issuer,
                subject=existing_user.subject,
            )
        )
        with pytest.raises(IntegrityError):
            session.flush()

    _assert_series(
        reader,
        QUERY_DURATION,
        ({"query.name": "INSERT user", "outcome": "statement_error"}, 1),
    )


def test_statement_timeout_records_operational_failure_without_disconnect(
    metrics: tuple[Meter, InMemoryMetricReader],
    pool_engine: Engine,
) -> None:
    meter, reader = metrics
    with (
        observe_postgresql(pool_engine, meter),
        pool_engine.connect() as connection,
    ):
        connection.exec_driver_sql(
            "SET LOCAL statement_timeout = '10ms'",
            execution_options={"kochwiki_query_name": "Set local statement timeout"},
        )
        with pytest.raises(DBAPIError) as error:
            connection.execute(
                text("SELECT pg_sleep(0.2)"),
                execution_options={"kochwiki_query_name": "Slow query"},
            )
        assert isinstance(error.value.orig, QueryCanceled)
        assert not error.value.connection_invalidated

    _assert_series(
        reader,
        QUERY_DURATION,
        ({"query.name": "Set local statement timeout", "outcome": "success"}, 1),
        ({"query.name": "Slow query", "outcome": "operational_failure"}, 1),
    )
    _assert_series(reader, ACQUISITION_DURATION, ({"outcome": "success"}, 1))


def test_disconnected_query_records_operational_failure(
    metrics: tuple[Meter, InMemoryMetricReader],
    pool_engine: Engine,
) -> None:
    meter, reader = metrics
    with (
        observe_postgresql(pool_engine, meter),
        pool_engine.connect() as connection,
    ):
        driver = connection.connection.driver_connection
        assert isinstance(driver, PsycopgConnection)
        with engine.connect() as control:
            assert control.execute(
                text("SELECT pg_terminate_backend(:pid, 5000)"),
                {"pid": driver.info.backend_pid},
            ).scalar_one()
        with pytest.raises(DBAPIError) as error:
            connection.execute(
                text("SELECT 1"),
                execution_options={"kochwiki_query_name": "Disconnected query"},
            )
        assert error.value.connection_invalidated

    _assert_series(
        reader,
        QUERY_DURATION,
        ({"query.name": "Disconnected query", "outcome": "operational_failure"}, 1),
    )


def test_pool_timeout_records_failed_acquisition_and_allows_reuse(
    metrics: tuple[Meter, InMemoryMetricReader],
    pool_engine: Engine,
) -> None:
    meter, reader = metrics
    with observe_postgresql(pool_engine, meter):
        with pool_engine.connect() as held:
            driver = held.connection.driver_connection
            with pytest.raises(TimeoutError), pool_engine.connect():
                pytest.fail("The occupied pool allowed another acquisition")
        with pool_engine.connect() as reused:
            assert reused.connection.driver_connection is driver

    _assert_series(
        reader,
        ACQUISITION_DURATION,
        ({"outcome": "success"}, 2),
        ({"outcome": "operational_failure"}, 1),
    )
    assert not _points(reader, QUERY_DURATION)


def test_pool_replacement_preserves_observation_until_context_exit(
    metrics: tuple[Meter, InMemoryMetricReader],
    pool_engine: Engine,
) -> None:
    meter, reader = metrics
    with observe_postgresql(pool_engine, meter):
        pool_engine.dispose()
        with pool_engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")

    _assert_series(
        reader,
        QUERY_DURATION,
        ({"query.name": "Unclassified", "outcome": "success"}, 1),
    )
    _assert_series(reader, ACQUISITION_DURATION, ({"outcome": "success"}, 1))

    with pool_engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")

    _assert_series(
        reader,
        QUERY_DURATION,
        ({"query.name": "Unclassified", "outcome": "success"}, 1),
    )
    _assert_series(reader, ACQUISITION_DURATION, ({"outcome": "success"}, 1))


def test_partial_registration_failure_leaves_no_observer_and_allows_retry(
    metrics: tuple[Meter, InMemoryMetricReader],
    pool_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    meter, reader = metrics
    listen = event.listen
    registered: dict[str, Callable[..., object]] = {}

    def fail_error_registration(
        target: Engine, identifier: str, callback: Callable[..., object]
    ) -> None:
        if target is pool_engine and identifier == "handle_error":
            raise RuntimeError("Cannot register error listener")
        listen(target, identifier, callback)
        if target is pool_engine:
            registered[identifier] = callback

    with monkeypatch.context() as patch:
        patch.setattr(event, "listen", fail_error_registration)
        with (
            pytest.raises(RuntimeError, match="Cannot register error listener"),
            observe_postgresql(pool_engine, meter),
        ):
            pytest.fail("The observer started with incomplete listener registration")

    assert all(
        not event.contains(pool_engine, identifier, callback)
        for identifier, callback in registered.items()
    )
    with pool_engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")

    assert not _points(reader, QUERY_DURATION)
    assert not _points(reader, ACQUISITION_DURATION)

    with observe_postgresql(pool_engine, meter), pool_engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")

    _assert_series(
        reader,
        QUERY_DURATION,
        ({"query.name": "Unclassified", "outcome": "success"}, 1),
    )
    _assert_series(reader, ACQUISITION_DURATION, ({"outcome": "success"}, 1))
