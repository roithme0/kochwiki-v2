import pytest
from fastapi.testclient import TestClient

from app.images.dependencies import ImageStoragePool
from app.main import create_app
from app.recipes.services.proposal_store import RecipeProposalStore


def test_lifespan_clears_proposals_when_image_storage_close_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleanup_calls: list[str] = []

    def fail_close(pool: ImageStoragePool) -> None:
        cleanup_calls.append("close image storage")
        raise RuntimeError("image storage close failed")

    def record_clear(store: RecipeProposalStore) -> None:
        cleanup_calls.append("clear proposals")

    monkeypatch.setattr(ImageStoragePool, "close", fail_close)
    monkeypatch.setattr(RecipeProposalStore, "clear", record_clear)

    with pytest.raises(RuntimeError, match="image storage close failed"):
        with TestClient(create_app()):
            assert not cleanup_calls

    assert cleanup_calls == ["close image storage", "clear proposals"]
