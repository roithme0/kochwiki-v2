import asyncio
from decimal import Decimal
from typing import Literal

import httpx2
import pytest
from kochwiki_contract import Unit
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.types import TextContent

from app.db.session import SessionLocal
from app.main import create_app
from app.mcp_instructions import KOCHWIKI_INSTRUCTIONS
from app.models.foodstuff_embedding import FoodstuffEmbedding
from app.models.recipe_embedding import RecipeEmbedding
from app.schemas.foodstuff import FoodstuffCreate
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
                    assert [tool.name for tool in tools.tools] == ["hello_world", "search_foodstuffs", "search_recipes"]
                    result = await client.call_tool("hello_world", {})
                    assert not result.is_error
                    assert result.structured_content == {"message": "Hello World"}

    asyncio.run(exercise())
    asyncio.run(exercise())


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
