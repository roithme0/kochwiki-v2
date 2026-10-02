import asyncio
from decimal import Decimal
from typing import Literal

import httpx2
import pytest
from kochwiki_contract import Unit
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.types import TextContent
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.main import create_app
from app.mcp_instructions import KOCHWIKI_INSTRUCTIONS
from app.models.foodstuff_embedding import FoodstuffEmbedding
from app.models.recipe_embedding import RecipeEmbedding
from app.schemas.foodstuff import FoodstuffCreate, FoodstuffUpdate
from app.models.foodstuff import Foodstuff
from app.services import foodstuffs
from app.services.foodstuff_refresh import foodstuff_refresh
from app.schemas.recipe import RecipeVersionWrite
from app.services.embeddings import DIMENSIONS, MODEL, EmbeddingClient
from app.services.foodstuffs import create_foodstuff, foodstuff_summary_out
from app.services.recipes import create_recipe, create_recipe_draft, recipe_version_out


@pytest.mark.parametrize("mode", ["auto", "legacy"])
def test_mcp_http_discovery_invocation_and_lifecycle(mode: Literal["auto", "legacy"]) -> None:
    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                assert (await http.get("/")).json() == {"message": "Hello World"}
                assert (await http.get("/api/openapi.json")).status_code == 200
                async with Client(
                    streamable_http_client("http://localhost/mcp/", http_client=http),
                    mode=mode,
                ) as client:
                    assert client.instructions == KOCHWIKI_INSTRUCTIONS
                    if mode == "legacy":
                        initialization = client.session.initialize_result
                        assert initialization is not None
                        assert initialization.instructions == KOCHWIKI_INSTRUCTIONS
                    tools = await client.list_tools()
                    assert [tool.name for tool in tools.tools] == [
                        "hello_world", "search_foodstuffs", "search_recipes", "create_foodstuff",
                        "update_foodstuff",
                        "create_recipe_proposal", "get_recipe_proposal", "save_recipe_proposal",
                    ]
                    result = await client.call_tool("hello_world", {})
                    assert not result.is_error
                    assert result.structured_content == {"message": "Hello World"}

    asyncio.run(exercise())
    asyncio.run(exercise())


def test_foodstuff_creation_over_mcp_commits_and_triggers_refresh() -> None:
    refreshed: list[int] = []
    subscriber = refreshed.append

    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    tool = next(tool for tool in (await client.list_tools()).tools if tool.name == "create_foodstuff")
                    assert tool.input_schema["required"] == ["foodstuff"]
                    fields = tool.input_schema["$defs"]["FoodstuffCreate"]
                    assert fields["required"] == ["name", "unit"]
                    assert tool.annotations is not None
                    assert tool.annotations.read_only_hint is False
                    assert tool.annotations.idempotent_hint is False
                    for payload in [
                        {"name": "Carrot", "unit": "G"},
                        {"name": "Oat drink", "brand": "Test", "unit": "ML",
                         "kcal": 40, "carbs": 6, "protein": 1, "fat": 0},
                    ]:
                        result = await client.call_tool("create_foodstuff", {"foodstuff": payload})
                        assert not result.is_error
                        saved = result.structured_content
                        assert saved is not None
                        record_id = saved["id"]
                        assert isinstance(record_id, int)
                        with SessionLocal() as session:
                            persisted = foodstuffs.get_foodstuff(session, record_id)
                            assert saved == foodstuffs.foodstuff_out(persisted).model_dump(mode="json")
                            expected = FoodstuffCreate.model_validate(payload)
                            for field, value in expected.model_dump().items():
                                assert getattr(persisted, field) == value
                        assert saved["recipeVersionIds"] == []
                        assert record_id in refreshed
                    duplicate = await client.call_tool("create_foodstuff", {
                        "foodstuff": {"name": "Oat drink", "brand": "Test", "unit": "ML"},
                    })
                    assert duplicate.is_error
                    assert "same name and brand already exists" in str(duplicate)
                    for payload in [
                        {"unit": "G"}, {"name": "Missing unit"},
                        *({"name": "Missing unit", field: 0} for field in ["kcal", "carbs", "protein", "fat"]),
                        {"name": "Null unit", "unit": None, "protein": 1},
                        {"name": "Invalid unit", "unit": "KG"},
                        {"name": "Negative", "unit": "G", "kcal": -1},
                        {"name": "Unknown field", "unit": "G", "unexpected": True},
                    ]:
                        assert (await client.call_tool("create_foodstuff", {"foodstuff": payload})).is_error
                    with SessionLocal() as session:
                        assert len(foodstuffs.list_foodstuffs(session)) == 2
                    assert len(refreshed) == 2

    foodstuff_refresh.subscribe(subscriber)
    try:
        asyncio.run(exercise())
    finally:
        foodstuff_refresh.unsubscribe(subscriber)


def test_foodstuff_creation_failure_rolls_back_and_sanitizes_error(monkeypatch: pytest.MonkeyPatch) -> None:
    original_create = foodstuffs.create_foodstuff
    refreshed: list[int] = []
    subscriber = refreshed.append

    def fail_after_flush(session: Session, payload: FoodstuffCreate) -> Foodstuff:
        original_create(session, payload)
        raise SQLAlchemyError("secret database diagnostic")

    monkeypatch.setattr(foodstuffs, "create_foodstuff", fail_after_flush)

    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    result = await client.call_tool("create_foodstuff", {
                        "foodstuff": {"name": "Rollback", "unit": "PIECE"},
                    })
                    assert result.is_error
                    assert "Foodstuff creation failed" in str(result)
                    assert "secret database diagnostic" not in str(result)
        with SessionLocal() as session:
            assert not foodstuffs.list_foodstuffs(session)
        assert refreshed == []

    foodstuff_refresh.subscribe(subscriber)
    try:
        asyncio.run(exercise())
    finally:
        foodstuff_refresh.unsubscribe(subscriber)


def test_foodstuff_update_over_mcp_preserves_partial_updates_and_rolls_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with SessionLocal.begin() as session:
        target = create_foodstuff(session, FoodstuffCreate(
            name="Milk", brand="Test", unit=Unit.ML, kcal=Decimal(40), protein=Decimal(3),
        ))
        target_id = target.id
        create_foodstuff(session, FoodstuffCreate(name="Other", brand="Test", unit=Unit.G))
        recipe = create_recipe(session, RecipeVersionWrite.model_validate({
            "name": "Milk recipe", "servings": 1,
            "ingredients": [{"index": 1, "foodstuffId": target_id, "amount": 100}],
            "steps": [],
        }))
        recipe_id = str(recipe.version_id)
    refreshed: list[int] = []
    subscriber = refreshed.append
    original_update = foodstuffs.update_foodstuff

    def fail_after_flush(session: Session, foodstuff_id: int, payload: FoodstuffUpdate) -> Foodstuff:
        original_update(session, foodstuff_id, payload)
        raise SQLAlchemyError("secret database diagnostic")

    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    tool = next(tool for tool in (await client.list_tools()).tools if tool.name == "update_foodstuff")
                    assert tool.input_schema["required"] == ["foodstuff_id", "changes"]
                    assert tool.annotations is not None
                    assert tool.annotations.read_only_hint is False
                    assert tool.annotations.destructive_hint is True
                    for changes, expected_refresh in [
                        ({"protein": 0}, []),
                        ({"unit": "PIECE"}, []),
                        ({"name": "Whole milk"}, [target_id]),
                        ({"brand": None, "kcal": None}, [target_id, target_id]),
                    ]:
                        result = await client.call_tool("update_foodstuff", {
                            "foodstuff_id": target_id, "changes": changes,
                        })
                        assert not result.is_error
                        saved = result.structured_content
                        assert saved is not None
                        assert saved["recipeVersionIds"] == [recipe_id]
                        with SessionLocal() as session:
                            persisted = foodstuffs.get_foodstuff(session, target_id)
                            assert saved == foodstuffs.foodstuff_out(persisted).model_dump(mode="json")
                            assert persisted.protein == Decimal(0)
                            if "unit" in changes:
                                assert persisted.unit == Unit.PIECE
                                assert persisted.kcal == Decimal(40)
                            for field, value in FoodstuffUpdate.model_validate(changes).model_dump(exclude_unset=True).items():
                                assert getattr(persisted, field) == value
                        assert refreshed == expected_refresh
                    with SessionLocal() as session:
                        before = foodstuffs.foodstuff_out(foodstuffs.get_foodstuff(session, target_id)).model_dump(mode="json")
                    for arguments, message in [
                        ({"foodstuff_id": 999999, "changes": {"name": "Missing"}}, "not found"),
                        ({"foodstuff_id": target_id, "changes": {"name": "Other", "brand": "Test"}}, "same name and brand"),
                        ({"foodstuff_id": target_id, "changes": {"name": None}}, "name cannot be null"),
                        ({"foodstuff_id": target_id, "changes": {"unit": None}}, "unit cannot be null"),
                        ({"foodstuff_id": target_id, "changes": {"fat": -1}}, "greater than or equal"),
                        ({"foodstuff_id": target_id, "changes": {"unit": "KG"}}, "Input should be"),
                        ({"foodstuff_id": True, "changes": {"name": "Invalid"}}, "valid integer"),
                        ({"foodstuff_id": 0, "changes": {"name": "Invalid"}}, "greater than or equal"),
                    ]:
                        failed = await client.call_tool("update_foodstuff", arguments)
                        assert failed.is_error
                        assert message in str(failed)
                    monkeypatch.setattr(foodstuffs, "update_foodstuff", fail_after_flush)
                    failed = await client.call_tool("update_foodstuff", {
                        "foodstuff_id": target_id, "changes": {"name": "Rollback"},
                    })
                    assert failed.is_error
                    assert "Foodstuff update failed" in str(failed)
                    assert "secret database diagnostic" not in str(failed)
                    with SessionLocal() as session:
                        assert foodstuffs.foodstuff_out(foodstuffs.get_foodstuff(session, target_id)).model_dump(mode="json") == before
                    assert refreshed == [target_id, target_id]

    foodstuff_refresh.subscribe(subscriber)
    try:
        asyncio.run(exercise())
    finally:
        foodstuff_refresh.unsubscribe(subscriber)


class QueryProvider:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.fail = False
        self.closed = False

    def embed(self, text: str, model: str) -> list[float]:
        self.calls.append(text)
        if self.fail:
            raise RuntimeError("secret provider diagnostic")
        return [1.0] + [0.0] * (DIMENSIONS - 1)

    def close(self) -> None:
        self.closed = True


def test_foodstuff_search_over_mcp_returns_summaries_without_scores(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = QueryProvider()
    monkeypatch.setattr(EmbeddingClient, "from_settings", lambda settings: EmbeddingClient(provider))
    summaries: list[dict[str, object]] = []
    with SessionLocal.begin() as session:
        for name in ["Karotte", "Tomate", "Missing"]:
            foodstuff = create_foodstuff(session, FoodstuffCreate(name=name, unit=Unit.G))
            if name == "Missing":
                continue
            vector = ([1.0, 0.0] if name == "Karotte" else [0.0, 1.0]) + [0.0] * (DIMENSIONS - 2)
            session.add(FoodstuffEmbedding(foodstuff_id=foodstuff.id, model=MODEL, source_text=name, vector=vector))
            summaries.append(foodstuff_summary_out(foodstuff).model_dump(mode="json"))

    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    discovery = await client.list_tools()
                    tool = next(tool for tool in discovery.tools if tool.name == "search_foodstuffs")
                    assert tool.input_schema["required"] == ["query"]
                    assert tool.input_schema["properties"]["limit"]["default"] == 5
                    assert "cosine_distance" not in str(tool.output_schema)
                    result = await client.call_tool("search_foodstuffs", {"query": "Moehre"})
                    assert not result.is_error
                    assert result.structured_content == {"result": summaries}
                    result = await client.call_tool("search_foodstuffs", {"query": "Moehre", "limit": 1})
                    assert not result.is_error
                    assert result.structured_content == {"result": summaries[:1]}
                    for arguments in [
                        {"query": " "}, {"query": ""}, {"query": "q", "limit": 0},
                        {"query": "q", "limit": 21}, {"query": "q", "limit": True},
                    ]:
                        invalid = await client.call_tool("search_foodstuffs", arguments)
                        assert invalid.is_error
                    assert provider.calls == ["Moehre", "Moehre"]
                    provider.fail = True
                    failed = await client.call_tool("search_foodstuffs", {"query": "query"})
                    assert failed.is_error
                    assert any(isinstance(item, TextContent) and "Query embedding failed" in item.text for item in failed.content)
                    assert "secret provider diagnostic" not in str(failed)
                    provider.fail = False
                    with SessionLocal.begin() as session:
                        for embedding in session.query(FoodstuffEmbedding).all():
                            session.delete(embedding)
                    empty = await client.call_tool("search_foodstuffs", {"query": "query"})
                    assert not empty.is_error
                    assert empty.structured_content == {"result": []}

    asyncio.run(exercise())
    assert provider.closed


def test_recipe_search_over_mcp_returns_complete_versions_without_scores(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = QueryProvider()
    monkeypatch.setattr(EmbeddingClient, "from_settings", lambda settings: EmbeddingClient(provider))
    recipes: list[dict[str, object]] = []
    with SessionLocal.begin() as session:
        foodstuff = create_foodstuff(session, FoodstuffCreate(name="Tomato", unit=Unit.G, kcal=Decimal(20)))
        write = RecipeVersionWrite.model_validate({
            "name": "Tomato soup", "servings": 2,
            "ingredients": [{"index": 1, "foodstuffId": foodstuff.id, "amount": 100}],
            "steps": [{"index": 1, "description": "Cook the tomatoes"}],
        })
        active = create_recipe(session, write)
        draft = create_recipe_draft(session, active.lineage_id, write.model_copy(update={"name": "Soup draft"}))
        create_recipe(session, write.model_copy(update={"name": "Missing embedding"}))
        for version, axis in [(active, 0), (draft, 1)]:
            vector = ([1.0, 0.0] if axis == 0 else [0.0, 1.0]) + [0.0] * (DIMENSIONS - 2)
            session.add(RecipeEmbedding(recipe_version_id=version.version_id, model=MODEL,
                source_text=version.name, vector=vector))
            recipes.append(recipe_version_out(version).model_dump(mode="json"))

    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    discovery = await client.list_tools()
                    tool = next(tool for tool in discovery.tools if tool.name == "search_recipes")
                    assert tool.input_schema["required"] == ["query"]
                    assert tool.input_schema["properties"]["limit"]["default"] == 5
                    assert "cosine_distance" not in str(tool.output_schema)
                    result = await client.call_tool("search_recipes", {"query": "Soup"})
                    assert not result.is_error
                    assert result.structured_content == {"result": recipes}
                    limited = await client.call_tool("search_recipes", {"query": "Soup", "limit": 1})
                    assert not limited.is_error
                    assert limited.structured_content == {"result": recipes[:1]}
                    for arguments in [
                        {"query": " "}, {"query": ""}, {"query": "q", "limit": 0},
                        {"query": "q", "limit": 21}, {"query": "q", "limit": True},
                    ]:
                        assert (await client.call_tool("search_recipes", arguments)).is_error
                    assert provider.calls == ["Soup", "Soup"]
                    provider.fail = True
                    failed = await client.call_tool("search_recipes", {"query": "Soup"})
                    assert failed.is_error
                    assert any(isinstance(item, TextContent) and "Query embedding failed" in item.text for item in failed.content)
                    assert "secret provider diagnostic" not in str(failed)
                    provider.fail = False
                    with SessionLocal.begin() as session:
                        for embedding in session.query(RecipeEmbedding).all():
                            session.delete(embedding)
                    empty = await client.call_tool("search_recipes", {"query": "Soup"})
                    assert not empty.is_error
                    assert empty.structured_content == {"result": []}

    asyncio.run(exercise())
    assert provider.closed


@pytest.mark.parametrize("tool_name", ["search_foodstuffs", "search_recipes"])
def test_search_without_credentials_reports_tool_error(tool_name: str) -> None:
    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    result = await client.call_tool(tool_name, {"query": "Moehre"})
                    assert result.is_error
                    assert any(isinstance(item, TextContent) and "Semantic search unavailable" in item.text for item in result.content)
                    assert not (await client.call_tool("hello_world", {})).is_error

    asyncio.run(exercise())


def test_mcp_rejects_unconfigured_host() -> None:
    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app)) as http:
                response = await http.post(
                    "http://unconfigured.example/mcp/",
                    headers={"Accept": "application/json, text/event-stream"},
                    json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                )
                assert response.status_code == 421

    asyncio.run(exercise())
