import json
from collections.abc import Callable

import pytest
from kochwiki_contract import Unit

from app import foodstuff_semantic, recipe_semantic
from app.core.embedding import DIMENSIONS
from app.db.session import SessionLocal
from app.schemas.foodstuff import FoodstuffCreate
from app.schemas.recipe import RecipeVersionWrite
from app.services.embeddings import EmbeddingClient
from app.services.foodstuffs import create_foodstuff
from app.services.recipes import create_recipe


class Provider:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.closed = False
        self.calls: list[str] = []

    def embed(self, text: str, model: str) -> list[float]:
        self.calls.append(text)
        if self.fail:
            raise RuntimeError("private diagnostic")
        return [1.0] + [0.0] * (DIMENSIONS - 1)

    def close(self) -> None:
        self.closed = True


@pytest.mark.parametrize("main,kind", [(foodstuff_semantic.main, "foodstuff"), (recipe_semantic.main, "recipe")])
def test_refresh_then_search_preserves_domain_output(main: Callable[[], int], kind: str,
        monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    with SessionLocal.begin() as session:
        create_foodstuff(session, FoodstuffCreate(name="Tomato", unit=Unit.G))
        create_recipe(session, RecipeVersionWrite(name="Pasta", servings=2))
    provider = Provider()
    monkeypatch.setattr(EmbeddingClient, "from_settings", lambda settings: EmbeddingClient(provider))
    monkeypatch.setattr("sys.argv", ["semantic", "refresh"])
    assert main() == 0
    assert "Refreshed: 1" in capsys.readouterr().out
    assert provider.closed
    provider.closed = False
    monkeypatch.setattr("sys.argv", ["semantic", "search", "query", "--limit", "1"])
    assert main() == 0
    output = capsys.readouterr().out
    if kind == "foodstuff":
        assert "1. [" in output and "Tomato (no brand): cosine distance 0.000000" in output
    else:
        result = json.loads(output)
        assert result["name"] == "Pasta" and "cosine_distance" not in result
    assert provider.closed


@pytest.mark.parametrize("main", [foodstuff_semantic.main, recipe_semantic.main])
@pytest.mark.parametrize("arguments,expected", [
    (["search", "query"], "No current"),
    (["search", "query", "--limit", "0"], "Result limit must be between"),
    (["search", " "], "Query must not be blank"),
])
def test_search_empty_validation_and_client_cleanup(main: Callable[[], int], arguments: list[str], expected: str,
        monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    provider = Provider()
    monkeypatch.setattr(EmbeddingClient, "from_settings", lambda settings: EmbeddingClient(provider))
    monkeypatch.setattr("sys.argv", ["semantic", *arguments])
    assert main() == (0 if expected == "No current" else 1)
    assert expected in capsys.readouterr().out
    assert provider.closed
    assert len(provider.calls) == (1 if expected == "No current" else 0)


@pytest.mark.parametrize("main", [foodstuff_semantic.main, recipe_semantic.main])
def test_provider_failure_and_missing_credentials_exit_nonzero(main: Callable[[], int],
        monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    provider = Provider(fail=True)
    monkeypatch.setattr(EmbeddingClient, "from_settings", lambda settings: EmbeddingClient(provider))
    monkeypatch.setattr("sys.argv", ["semantic", "search", "query"])
    assert main() == 1
    output = capsys.readouterr().out
    assert "Query embedding failed" in output and "private diagnostic" not in output
    assert provider.closed
    monkeypatch.setattr(EmbeddingClient, "from_settings", lambda settings: EmbeddingClient(None))
    monkeypatch.setattr("sys.argv", ["semantic", "refresh"])
    assert main() == 1
    assert "OPENAI_API_KEY is missing" in capsys.readouterr().out
