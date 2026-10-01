from collections.abc import Callable
from datetime import datetime, timezone
from decimal import Decimal
from threading import Event

import pytest
from kochwiki_contract import Unit
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import SessionLocal
from app.models.foodstuff import Foodstuff
from app.models.foodstuff_embedding import FoodstuffEmbedding
from app.schemas.foodstuff import FoodstuffCreate, FoodstuffUpdate
from app.services.foodstuff_refresh import RefreshWorker, next_nightly
from app.services.foodstuff_search import (
    FoodstuffSemanticSearch, QueryEmbeddingError, SemanticSearchUnavailable,
)
from app.services.embeddings import DIMENSIONS, MODEL, EmbeddingClient, OpenAIEmbeddingProvider, source_text
from app.services.foodstuff_embeddings import FoodstuffEmbeddingService
from app.services.foodstuffs import create_foodstuff, delete_foodstuff, update_foodstuff


def vector(axis: int = 0) -> list[float]:
    result = [0.0] * DIMENSIONS
    result[axis] = 1.0
    return result


class FakeProvider:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.failures: set[str] = set()
        self.before_return: Callable[[], None] | None = None
        self.result = vector()
        self.closed = False

    def embed(self, text: str, model: str) -> list[float]:
        self.calls.append((text, model))
        if text in self.failures:
            raise RuntimeError("provider failure")
        if self.before_return:
            self.before_return()
        return self.result

    def close(self) -> None:
        self.closed = True


def create(name: str = "Karotte", brand: str | None = None) -> int:
    with SessionLocal.begin() as session:
        return create_foodstuff(session, FoodstuffCreate(name=name, brand=brand, unit=Unit.G)).id


def service(provider: FakeProvider) -> FoodstuffEmbeddingService:
    return FoodstuffEmbeddingService(SessionLocal, EmbeddingClient(provider))


def search_service(provider: FakeProvider) -> FoodstuffSemanticSearch:
    return FoodstuffSemanticSearch(SessionLocal, EmbeddingClient(provider))


def test_refresh_metadata_freshness_and_nutrition() -> None:
    provider = FakeProvider()
    search = service(provider)
    foodstuff_id = create(brand="Farm")
    assert search.refresh_one(foodstuff_id) == "refreshed"
    with SessionLocal() as session:
        stored = session.get(FoodstuffEmbedding, foodstuff_id)
        assert stored is not None
        assert stored.model == MODEL
        assert stored.source_text == "Karotte\nBrand: Farm"
        assert len(stored.vector) == DIMENSIONS
    assert search.refresh_one(foodstuff_id) == "skipped"
    with SessionLocal.begin() as session:
        update_foodstuff(session, foodstuff_id, FoodstuffUpdate(kcal=Decimal(20)))
    assert search.refresh_one(foodstuff_id) == "skipped"
    with SessionLocal.begin() as session:
        update_foodstuff(session, foodstuff_id, FoodstuffUpdate(name="Moehre", brand="New"))
    assert search.refresh_one(foodstuff_id) == "refreshed"
    with SessionLocal.begin() as session:
        stored = session.get(FoodstuffEmbedding, foodstuff_id)
        assert stored is not None
        stored.model = "old-model"
    assert search.refresh_one(foodstuff_id) == "refreshed"
    assert provider.calls == [("Karotte\nBrand: Farm", MODEL), ("Moehre\nBrand: New", MODEL), ("Moehre\nBrand: New", MODEL)]


def test_sweep_failure_skips_and_next_sweep_can_retry(caplog: pytest.LogCaptureFixture) -> None:
    failed_id = create("bad")
    good_id = create("good")
    provider = FakeProvider()
    provider.failures.add("bad")
    search = service(provider)
    report = search.refresh_all()
    assert (report.refreshed, report.failed) == (1, 1)
    assert len(provider.calls) == 2
    assert "skipped" in caplog.text
    with SessionLocal() as session:
        assert session.get(Foodstuff, failed_id)
        assert session.get(FoodstuffEmbedding, failed_id) is None
        assert session.get(FoodstuffEmbedding, good_id)
    provider.failures.clear()
    report = search.refresh_all()
    assert (report.refreshed, report.skipped) == (1, 1)
    assert len(provider.calls) == 3


@pytest.mark.parametrize("change", ["name", "brand", "delete", "model"])
def test_obsolete_generation_is_discarded(change: str) -> None:
    foodstuff_id = create()
    provider = FakeProvider()
    search = service(provider)
    def mutate() -> None:
        if change == "model":
            search.model = "changed-model"
            return
        with SessionLocal.begin() as session:
            if change == "delete":
                delete_foodstuff(session, foodstuff_id)
            elif change == "name":
                update_foodstuff(session, foodstuff_id, FoodstuffUpdate(name="new"))
            else:
                update_foodstuff(session, foodstuff_id, FoodstuffUpdate(brand="new"))
    provider.before_return = mutate
    assert search.refresh_one(foodstuff_id) == "skipped"
    with SessionLocal() as session:
        assert session.get(FoodstuffEmbedding, foodstuff_id) is None


def test_delete_cascades_embedding() -> None:
    foodstuff_id = create()
    search = service(FakeProvider())
    assert search.refresh_one(foodstuff_id) == "refreshed"
    with SessionLocal.begin() as session:
        delete_foodstuff(session, foodstuff_id)
    with SessionLocal() as session:
        assert session.get(FoodstuffEmbedding, foodstuff_id) is None


def test_exact_search_filters_before_limit_and_returns_authoritative_summaries() -> None:
    provider = FakeProvider()
    search = search_service(provider)
    ids = [create(name) for name in ["stale", "wrong-model", "current", "tied", "far", "missing"]]
    with SessionLocal.begin() as session:
        for foodstuff_id in ids[:-1]:
            foodstuff = session.get(Foodstuff, foodstuff_id)
            assert foodstuff
            session.add(FoodstuffEmbedding(foodstuff_id=foodstuff_id, model=MODEL,
                source_text=source_text(foodstuff.name, foodstuff.brand), vector=vector(1 if foodstuff.name == "far" else 0)))
    with SessionLocal.begin() as session:
        update_foodstuff(session, ids[0], FoodstuffUpdate(name="changed"))
        stored = session.get(FoodstuffEmbedding, ids[1])
        assert stored
        stored.model = "old"
        update_foodstuff(session, ids[2], FoodstuffUpdate(kcal=Decimal(17)))
    results = search.search("Moehre", 2)
    assert [item.foodstuff.id for item in results] == ids[2:4]
    assert results[0].foodstuff.kcal == Decimal(17)
    assert results[0].cosine_distance == pytest.approx(0.0)
    assert search.search("query", 20)[-1].cosine_distance == pytest.approx(1.0)


@pytest.mark.parametrize("query,limit", [("", 5), (" ", 5), ("query", 0), ("query", 21), ("query", True)])
def test_invalid_queries_do_not_call_provider(query: str, limit: int) -> None:
    provider = FakeProvider()
    with pytest.raises(ValueError):
        search_service(provider).search(query, limit)
    assert not provider.calls


def test_empty_catalogue_and_provider_failures_are_distinct() -> None:
    provider = FakeProvider()
    search = search_service(provider)
    assert search.search("query") == []
    provider.failures.add("query")
    with pytest.raises(QueryEmbeddingError):
        search.search("query")
    provider.failures.clear()
    provider.result = [1.0]
    with pytest.raises(QueryEmbeddingError):
        search.search("query")


def test_no_credentials_disables_capability(caplog: pytest.LogCaptureFixture) -> None:
    settings = Settings(openai_api_key=SecretStr(""))
    embeddings = EmbeddingClient.from_settings(settings)
    assert not embeddings.available
    refresh = FoodstuffEmbeddingService(SessionLocal, embeddings)
    search = FoodstuffSemanticSearch(SessionLocal, embeddings)
    assert refresh.refresh_one(1) == "disabled"
    assert refresh.refresh_all().refreshed == 0
    with pytest.raises(SemanticSearchUnavailable):
        search.search("query")
    assert "OPENAI_API_KEY" in caplog.text


def test_sdk_retries_disabled() -> None:
    provider = OpenAIEmbeddingProvider("fake-test-key")
    assert provider.client.max_retries == 0
    provider.close()


def test_post_commit_creation_input_changes_rollback_and_nutrition() -> None:
    captured: list[int] = []
    # Keep enqueue synchronous to assert the transaction boundary directly.
    from app.services.foodstuff_refresh import _subscribers, _subscriber_lock
    with _subscriber_lock:
        _subscribers.add(captured.append)
    try:
        with SessionLocal() as session:
            foodstuff = create_foodstuff(session, FoodstuffCreate(name="created", unit=Unit.G))
            foodstuff_id = foodstuff.id
            assert captured == []
            session.commit()
            assert captured == [foodstuff_id]
        with SessionLocal.begin() as session:
            update_foodstuff(session, foodstuff_id, FoodstuffUpdate(kcal=Decimal(20)))
        assert captured == [foodstuff_id]
        with SessionLocal.begin() as session:
            update_foodstuff(session, foodstuff_id, FoodstuffUpdate(name="renamed"))
        with SessionLocal.begin() as session:
            update_foodstuff(session, foodstuff_id, FoodstuffUpdate(brand="brand"))
        assert captured == [foodstuff_id] * 3
        with SessionLocal() as session:
            create_foodstuff(session, FoodstuffCreate(name="rollback", unit=Unit.G))
            session.rollback()
        assert captured == [foodstuff_id] * 3
        with SessionLocal() as session:
            update_foodstuff(session, foodstuff_id, FoodstuffUpdate(name="rollback"))
            session.rollback()
        assert captured == [foodstuff_id] * 3
    finally:
        with _subscriber_lock:
            _subscribers.discard(captured.append)


def test_nested_commit_waits_for_outer_commit_and_nested_rollback_keeps_outer() -> None:
    captured: list[int] = []
    from app.services.foodstuff_refresh import _subscribers, _subscriber_lock
    with _subscriber_lock:
        _subscribers.add(captured.append)
    try:
        with SessionLocal() as session:
            outer = create_foodstuff(session, FoodstuffCreate(name="outer", unit=Unit.G))
            with session.begin_nested():
                nested = create_foodstuff(session, FoodstuffCreate(name="nested", unit=Unit.G))
            assert captured == []
            savepoint = session.begin_nested()
            create_foodstuff(session, FoodstuffCreate(name="rolled back", unit=Unit.G))
            savepoint.rollback()
            session.commit()
            assert set(captured) == {outer.id, nested.id}
        captured.clear()
        with SessionLocal() as session:
            with session.begin_nested():
                create_foodstuff(session, FoodstuffCreate(name="outer rolled back", unit=Unit.G))
            session.rollback()
        assert captured == []
    finally:
        with _subscriber_lock:
            _subscribers.discard(captured.append)


@pytest.mark.parametrize("now,expected", [
    ("2026-03-28T03:00:00+01:00", "2026-03-29T01:00:00+00:00"),
    ("2026-10-24T03:00:00+02:00", "2026-10-25T02:00:00+00:00"),
    ("2026-10-01T00:00:00+00:00", "2026-10-01T01:00:00+00:00"),
])
def test_berlin_nightly_dst(now: str, expected: str) -> None:
    assert next_nightly(datetime.fromisoformat(now)) == datetime.fromisoformat(expected)


def test_worker_controlled_clock_no_startup_sweep_and_shutdown() -> None:
    now = [datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc)]
    swept = Event()
    refreshed = Event()
    calls: list[str] = []
    def refresh(foodstuff_id: int) -> str:
        calls.append(str(foodstuff_id))
        refreshed.set()
        return "refreshed"
    def sweep() -> None:
        calls.append("sweep")
        swept.set()
    worker = RefreshWorker(refresh, sweep, lambda: now[0])
    worker.start()
    assert not swept.is_set()
    worker.enqueue(42)
    assert refreshed.wait(2)
    now[0] = datetime(2026, 10, 1, 1, 0, tzinfo=timezone.utc)
    worker.wake()
    assert swept.wait(2)
    worker.stop()
    assert calls == ["42", "sweep"]
    assert worker.thread and not worker.thread.is_alive()


def test_stop_during_sweep_finishes_current_call_and_skips_remaining() -> None:
    for name in ["one", "two", "three"]:
        create(name)
    entered = Event()
    release = Event()
    stopped = Event()
    provider = FakeProvider()
    def block() -> None:
        entered.set()
        assert release.wait(2)
    provider.before_return = block
    search = service(provider)
    now = [datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc)]
    worker = RefreshWorker(search.refresh_one, lambda: search.refresh_all(worker.is_stopping), lambda: now[0])
    worker.start()
    now[0] = datetime(2026, 10, 1, 1, 0, tzinfo=timezone.utc)
    worker.wake()
    assert entered.wait(2)
    from threading import Thread
    def stop() -> None:
        worker.stop()
        stopped.set()
    stopper = Thread(target=stop)
    stopper.start()
    with worker.condition:
        assert worker.condition.wait_for(lambda: worker.stopping, timeout=2)
    assert not stopped.is_set()
    release.set()
    assert stopped.wait(2)
    stopper.join()
    assert len(provider.calls) == 1


def test_lifespan_refresh_failure_keeps_api_write_and_closes_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi.testclient import TestClient
    from app.main import create_app
    provider = FakeProvider()
    provider.failures.add("bad")
    search = service(provider)
    attempted = Event()
    original_refresh = search.refresh_one
    def refresh(foodstuff_id: int) -> str:
        outcome = original_refresh(foodstuff_id)
        attempted.set()
        return outcome
    monkeypatch.setattr(search, "refresh_one", refresh)
    monkeypatch.setattr(EmbeddingClient, "from_settings", lambda settings: search.embeddings)
    monkeypatch.setattr("app.main.FoodstuffEmbeddingService", lambda sessions, embeddings: search)
    with TestClient(create_app()) as client:
        response = client.post("/foodstuffs", json={"name": "bad", "unit": "G"})
        assert response.status_code == 201
        assert attempted.wait(2)
        assert client.get("/foodstuffs").status_code == 200
    assert provider.closed
    with SessionLocal() as session:
        assert session.scalar(select(Foodstuff).where(Foodstuff.name == "bad")) is not None
        assert session.scalar(select(FoodstuffEmbedding)) is None
