from collections.abc import Callable
from datetime import datetime, timezone
from decimal import Decimal
from threading import Event
from uuid import UUID

import pytest
from kochwiki_contract import Unit
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.enums import RecipeVersionState
from app.models.recipe import RecipeVersion
from app.models.recipe_embedding import RecipeEmbedding
from app.schemas.foodstuff import FoodstuffCreate, FoodstuffUpdate
from app.schemas.recipe import RecipeVersionWrite
from app.services.embeddings import DIMENSIONS, MODEL, EmbeddingClient
from app.services.embeddings import QueryEmbeddingError, SemanticSearchUnavailable
from app.services.foodstuffs import create_foodstuff, update_foodstuff
from app.services.recipe_embeddings import RecipeEmbeddingService
from app.services.embedding_refresh import EmbeddingRefreshWorker
from app.services.recipe_refresh import recipe_refresh
from app.services.recipe_search import RecipeSemanticSearch
from app.services.recipes import (
    create_recipe, create_recipe_draft, delete_recipe_lineage, discard_recipe_draft,
    publish_active_recipe_edit, publish_recipe_draft, update_recipe_draft,
)


def vector(axis: int = 0) -> list[float]:
    result = [0.0] * DIMENSIONS
    result[axis] = 1.0
    return result


class Provider:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.failures: set[str] = set()
        self.before_return: Callable[[], None] | None = None
        self.closed = False

    def embed(self, text: str, model: str) -> list[float]:
        assert model == MODEL
        self.calls.append(text)
        if text in self.failures:
            raise RuntimeError("private diagnostic")
        if self.before_return:
            self.before_return()
        return vector()

    def close(self) -> None:
        self.closed = True


def create(name: str = "Pasta") -> tuple[UUID, UUID]:
    with SessionLocal.begin() as session:
        version = create_recipe(session, RecipeVersionWrite(name=name, servings=2))
        return version.lineage_id, version.version_id


def test_name_freshness_model_and_non_name_edits() -> None:
    lineage, active = create()
    with SessionLocal.begin() as session:
        draft = create_recipe_draft(session, lineage, RecipeVersionWrite(name="Noodles", servings=2)).version_id
    provider = Provider()
    refresh = RecipeEmbeddingService(SessionLocal, EmbeddingClient(provider))
    assert refresh.refresh_one(active) == "refreshed"
    assert refresh.refresh_one(draft) == "refreshed"
    with SessionLocal.begin() as session:
        update_recipe_draft(session, lineage, draft, RecipeVersionWrite(name="Noodles", servings=3))
    assert refresh.refresh_one(draft) == "skipped"
    with SessionLocal.begin() as session:
        update_recipe_draft(session, lineage, draft, RecipeVersionWrite(name="Spaghetti", servings=3))
    assert refresh.refresh_one(draft) == "refreshed"
    with SessionLocal.begin() as session:
        stored = session.get(RecipeEmbedding, draft)
        assert stored and stored.source_text == "Spaghetti" and stored.model == MODEL
        stored.model = "old"
    assert refresh.refresh_one(draft) == "refreshed"
    assert provider.calls == ["Pasta", "Noodles", "Spaghetti", "Spaghetti"]


@pytest.mark.parametrize("publish_draft", [False, True])
def test_historical_cleanup_is_atomic(publish_draft: bool) -> None:
    lineage, active = create()
    with SessionLocal.begin() as session:
        draft = create_recipe_draft(session, lineage, RecipeVersionWrite(name="New", servings=2)).version_id
    refresh = RecipeEmbeddingService(SessionLocal, EmbeddingClient(Provider()))
    refresh.refresh_all()
    def publish(session: Session) -> None:
        if publish_draft:
            publish_recipe_draft(session, lineage, draft)
        else:
            publish_active_recipe_edit(session, lineage, RecipeVersionWrite(name="New", servings=2))
    with SessionLocal() as session:
        publish(session)
        assert session.get(RecipeEmbedding, active) is None
        session.rollback()
    with SessionLocal() as session:
        assert session.get(RecipeEmbedding, active) is not None
        version = session.get(RecipeVersion, active)
        assert version and version.state == RecipeVersionState.ACTIVE
    with SessionLocal.begin() as session:
        publish(session)
    with SessionLocal() as session:
        assert session.get(RecipeEmbedding, active) is None
    assert refresh.refresh_one(active) == "skipped"


@pytest.mark.parametrize("change", ["rename", "historical", "delete", "model"])
def test_inflight_obsolete_embeddings_are_discarded(change: str) -> None:
    lineage, active = create()
    provider = Provider()
    refresh = RecipeEmbeddingService(SessionLocal, EmbeddingClient(provider))
    with SessionLocal.begin() as session:
        draft = create_recipe_draft(session, lineage, RecipeVersionWrite(name="Draft", servings=2)).version_id
    target = draft if change == "rename" else active
    def mutate() -> None:
        if change == "model":
            refresh.model = "obsolete"
            return
        with SessionLocal.begin() as session:
            if change == "rename":
                update_recipe_draft(session, lineage, draft, RecipeVersionWrite(name="Renamed", servings=2))
            elif change == "historical":
                publish_recipe_draft(session, lineage, draft)
            else:
                delete_recipe_lineage(session, lineage)
    provider.before_return = mutate
    assert refresh.refresh_one(target) == "skipped"
    with SessionLocal() as session:
        assert session.get(RecipeEmbedding, target) is None


def test_search_filters_before_limit_and_returns_complete_current_recipe() -> None:
    ids = [create(name)[1] for name in ["Historical", "Stale", "Wrong model", "Current", "Missing"]]
    with SessionLocal.begin() as session:
        for version_id in ids[:-1]:
            version = session.get(RecipeVersion, version_id)
            assert version
            session.add(RecipeEmbedding(recipe_version_id=version_id, model=MODEL, source_text=version.name,
                vector=vector(1 if version_id == ids[3] else 0)))
        session.flush()
        historical = session.get(RecipeVersion, ids[0])
        stale = session.get(RecipeVersion, ids[1])
        wrong_model = session.get(RecipeEmbedding, ids[2])
        assert historical and stale and wrong_model
        historical.state = RecipeVersionState.HISTORICAL
        stale.name = "Renamed"
        wrong_model.model = "old"
        foodstuff = create_foodstuff(session, FoodstuffCreate(name="Tomato", unit=Unit.G, kcal=Decimal(20)))
        current = session.get(RecipeVersion, ids[3])
        assert current
        draft = create_recipe_draft(session, current.lineage_id, RecipeVersionWrite.model_validate({
            "name": "Draft", "servings": 2,
            "ingredients": [{"index": 1, "foodstuffId": foodstuff.id, "amount": 100}],
            "steps": [{"index": 1, "description": "Cook"}],
        })).version_id
        foodstuff_id = foodstuff.id
    provider = Provider()
    refresh = RecipeEmbeddingService(SessionLocal, EmbeddingClient(provider))
    refresh.refresh_one(draft)
    with SessionLocal.begin() as session:
        update_foodstuff(session, foodstuff_id, FoodstuffUpdate(kcal=Decimal(40)))
    search = RecipeSemanticSearch(SessionLocal, EmbeddingClient(provider))
    results = search.search("Noodles", 1)
    assert len(results) == 1 and results[0].recipe.recipeVersionId == draft
    recipe = results[0].recipe
    assert recipe.state == RecipeVersionState.DRAFT
    assert recipe.kcal == Decimal(20)
    assert recipe.ingredients[0].foodstuff.kcal == Decimal(40)
    assert recipe.steps[0].description == "Cook"
    assert [item.recipe.recipeVersionId for item in search.search("Noodles", 20)] == [draft, ids[3]]


def test_sweep_cleans_historical_skips_failures_and_cascades_deletions() -> None:
    lineage, historical = create("Old")
    _, good = create("Good")
    create("Bad")
    provider = Provider()
    refresh = RecipeEmbeddingService(SessionLocal, EmbeddingClient(provider))
    refresh.refresh_one(historical)
    with SessionLocal.begin() as session:
        version = session.get(RecipeVersion, historical)
        assert version
        version.state = RecipeVersionState.HISTORICAL
    provider.failures.add("Bad")
    report = refresh.refresh_all()
    assert (report.refreshed, report.failed) == (1, 1)
    assert provider.calls.count("Old") == 1
    with SessionLocal() as session:
        assert session.get(RecipeEmbedding, historical) is None
        assert session.get(RecipeEmbedding, good) is not None
    with SessionLocal.begin() as session:
        draft = create_recipe_draft(session, lineage, RecipeVersionWrite(name="Draft", servings=2)).version_id
    refresh.refresh_one(draft)
    with SessionLocal.begin() as session:
        discard_recipe_draft(session, lineage, draft)
    with SessionLocal() as session:
        assert session.get(RecipeEmbedding, draft) is None
    with SessionLocal.begin() as session:
        version = session.get(RecipeVersion, good)
        assert version
        delete_recipe_lineage(session, version.lineage_id)
    with SessionLocal() as session:
        assert session.get(RecipeEmbedding, good) is None


def test_post_commit_and_savepoint_scheduling() -> None:
    captured: list[UUID] = []
    recipe_refresh.subscribe(captured.append)
    try:
        lineage, active = create()
        assert captured == [active]
        with SessionLocal() as session:
            with session.begin_nested():
                draft = create_recipe_draft(session, lineage, RecipeVersionWrite(name="Draft", servings=2)).version_id
            assert captured == [active]
            savepoint = session.begin_nested()
            create_recipe_draft(session, lineage, RecipeVersionWrite(name="Rollback", servings=2))
            savepoint.rollback()
            session.commit()
        assert captured == [active, draft]
        with SessionLocal.begin() as session:
            update_recipe_draft(session, lineage, draft, RecipeVersionWrite(name="Draft", servings=3))
        assert captured == [active, draft]
        with SessionLocal() as session:
            update_recipe_draft(session, lineage, draft, RecipeVersionWrite(name="Rollback", servings=2))
            session.rollback()
        assert captured == [active, draft]
        with SessionLocal.begin() as session:
            update_recipe_draft(session, lineage, draft, RecipeVersionWrite(name="Renamed", servings=2))
        assert captured == [active, draft, draft]
    finally:
        recipe_refresh.unsubscribe(captured.append)


@pytest.mark.parametrize("query,limit", [("", 5), (" ", 5), ("query", 0), ("query", 21), ("query", True)])
def test_invalid_search_no_provider_call(query: str, limit: int) -> None:
    provider = Provider()
    with pytest.raises(ValueError):
        RecipeSemanticSearch(SessionLocal, EmbeddingClient(provider)).search(query, limit)
    assert provider.calls == []


def test_unavailable_empty_and_failed_search() -> None:
    embeddings = EmbeddingClient(None)
    assert RecipeEmbeddingService(SessionLocal, embeddings).refresh_one(UUID(int=0)) == "disabled"
    with pytest.raises(SemanticSearchUnavailable):
        RecipeSemanticSearch(SessionLocal, embeddings).search("Pasta")
    provider = Provider()
    search = RecipeSemanticSearch(SessionLocal, EmbeddingClient(provider))
    assert search.search("Pasta") == []
    provider.failures.add("Pasta")
    with pytest.raises(QueryEmbeddingError, match="Query embedding failed") as error:
        search.search("Pasta")
    assert "private diagnostic" not in str(error.value)


def test_historical_sweep_cleanup_without_embedding_credentials() -> None:
    _, historical_id = create("Historical")
    _, active_id = create("Active")
    refresh = RecipeEmbeddingService(SessionLocal, EmbeddingClient(Provider()))
    refresh.refresh_all()
    with SessionLocal.begin() as session:
        version = session.get(RecipeVersion, historical_id)
        assert version
        version.state = RecipeVersionState.HISTORICAL
    disabled_refresh = RecipeEmbeddingService(SessionLocal, EmbeddingClient(None))
    report = disabled_refresh.refresh_all()
    assert (report.refreshed, report.skipped, report.failed) == (0, 0, 0)
    with SessionLocal() as session:
        assert session.get(RecipeEmbedding, historical_id) is None
        assert session.get(RecipeEmbedding, active_id) is not None


def test_lifespan_refresh_failure_does_not_fail_write(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi.testclient import TestClient
    from app.main import create_app
    provider = Provider()
    provider.failures.add("Bad")
    embeddings = EmbeddingClient(provider)
    refresh = RecipeEmbeddingService(SessionLocal, embeddings)
    attempted = Event()
    original = refresh.refresh_one
    def refresh_one(version_id: UUID) -> str:
        outcome = original(version_id)
        attempted.set()
        return outcome
    monkeypatch.setattr(refresh, "refresh_one", refresh_one)
    monkeypatch.setattr(EmbeddingClient, "from_settings", lambda settings: embeddings)
    monkeypatch.setattr("app.main.RecipeEmbeddingService", lambda sessions, client: refresh)
    with TestClient(create_app()) as client:
        assert client.post("/recipes", json={"name": "Bad", "servings": 2}).status_code == 201
        assert attempted.wait(2)
        assert client.get("/recipes").status_code == 200
    assert provider.closed
    with SessionLocal() as session:
        assert session.scalar(select(RecipeVersion)) is not None
        assert session.scalar(select(RecipeEmbedding)) is None


def test_recipe_worker_uuid_queue_nightly_and_shutdown() -> None:
    now = [datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc)]
    refreshed = Event()
    swept = Event()
    calls: list[UUID] = []
    def refresh(version_id: UUID) -> str:
        calls.append(version_id)
        refreshed.set()
        return "refreshed"
    worker = EmbeddingRefreshWorker(refresh, swept.set, lambda: now[0], coordinator=recipe_refresh)
    worker.start()
    try:
        assert not swept.is_set()
        _, version_id = create()
        assert refreshed.wait(2)
        assert calls == [version_id]
        now[0] = datetime(2026, 10, 1, 1, 0, tzinfo=timezone.utc)
        worker.wake()
        assert swept.wait(2)
    finally:
        worker.stop()
    assert worker.thread and not worker.thread.is_alive()


def test_commands_full_recipe_no_scores_and_refresh_failure_exit(capsys: pytest.CaptureFixture[str]) -> None:
    import json
    from app.recipe_semantic import format_candidate
    from app.semantic_commands import run_refresh, run_search
    _, version_id = create()
    provider = Provider()
    embeddings = EmbeddingClient(provider)
    refresh = RecipeEmbeddingService(SessionLocal, embeddings)
    assert run_refresh(refresh) == 0
    capsys.readouterr()
    assert run_search(RecipeSemanticSearch(SessionLocal, embeddings), "Noodles", 5, format_candidate, "No current recipe embeddings") == 0
    result = json.loads(capsys.readouterr().out)
    assert result["recipeVersionId"] == str(version_id)
    assert "cosine_distance" not in result
    create("Bad")
    provider.failures.add("Bad")
    assert run_refresh(refresh) == 1
