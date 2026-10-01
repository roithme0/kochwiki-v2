from datetime import datetime
from threading import Thread

import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import create_app
from app.mcp_server import MCPServices
from app.services import embedding_refresh
from app.services.embeddings import EmbeddingClient
from app.services.foodstuff_refresh import foodstuff_refresh, mark_foodstuff_refresh
from app.services.foodstuff_search import FoodstuffSemanticSearch


class Provider:
    def __init__(self) -> None:
        self.closed = False

    def embed(self, text: str, model: str) -> list[float]:
        raise AssertionError("Startup must not generate embeddings")

    def close(self) -> None:
        self.closed = True


def test_failed_worker_start_unsubscribes_and_can_be_stopped(monkeypatch: pytest.MonkeyPatch) -> None:
    worker = embedding_refresh.EmbeddingRefreshWorker[int](lambda record_id: "skipped", lambda: None,
        coordinator=foodstuff_refresh)
    def fail_start(thread: Thread) -> None:
        raise RuntimeError("thread start failed")
    monkeypatch.setattr(Thread, "start", fail_start)
    with pytest.raises(RuntimeError, match="thread start failed"):
        worker.start()
    assert worker.thread is None
    with SessionLocal.begin() as session:
        mark_foodstuff_refresh(session, 42)
    assert not worker.pending
    worker.stop()


@pytest.mark.parametrize("failure", ["construction", "start", "stop"])
def test_lifespan_cleans_all_resources_on_partial_worker_failure(failure: str,
        monkeypatch: pytest.MonkeyPatch) -> None:
    provider = Provider()
    bindings: list[FoodstuffSemanticSearch | None] = []
    threads: list[Thread] = []
    original_start = Thread.start
    original_nightly = embedding_refresh.next_nightly
    original_bind = MCPServices.bind_foodstuff_search
    nightly_calls = 0

    def bind(services: MCPServices, search: FoodstuffSemanticSearch | None) -> None:
        bindings.append(search)
        original_bind(services, search)

    def start(thread: Thread) -> None:
        if thread.name == "embedding-refresh":
            threads.append(thread)
            if failure == "start" and len(threads) == 2:
                raise RuntimeError("worker start failed")
        original_start(thread)

    def nightly(now: datetime) -> datetime:
        nonlocal nightly_calls
        nightly_calls += 1
        if failure == "construction" and nightly_calls == 2:
            raise RuntimeError("worker construction failed")
        return original_nightly(now)

    if failure == "stop":
        from uuid import UUID
        from app.services.embedding_refresh import EmbeddingRefreshWorker
        original_stop = EmbeddingRefreshWorker.stop
        stopped = 0
        def stop(worker: EmbeddingRefreshWorker[int] | EmbeddingRefreshWorker[UUID]) -> None:
            nonlocal stopped
            original_stop(worker)
            stopped += 1
            if stopped == 1:
                raise RuntimeError("worker stop failed")
        monkeypatch.setattr(EmbeddingRefreshWorker, "stop", stop)

    monkeypatch.setattr(EmbeddingClient, "from_settings", lambda settings: EmbeddingClient(provider))
    monkeypatch.setattr(MCPServices, "bind_foodstuff_search", bind)
    monkeypatch.setattr(Thread, "start", start)
    monkeypatch.setattr(embedding_refresh, "next_nightly", nightly)
    with pytest.raises(RuntimeError, match=f"worker {failure} failed"):
        with TestClient(create_app()):
            pass
    assert provider.closed
    assert bindings[0] is not None and bindings[-1] is None
    assert threads and all(not thread.is_alive() for thread in threads)
