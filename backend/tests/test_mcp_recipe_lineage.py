import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import httpx2
import pytest
from kochwiki_contract import Unit
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.main import create_app
from app.models.recipe import RecipeVersion
from app.schemas.foodstuff import FoodstuffCreate
from app.schemas.recipe import RecipeLineageOut, RecipeVersionWrite
from app.services import recipes
from app.services.foodstuffs import create_foodstuff


def test_lineage_mcp_returns_all_states_and_complete_versions_without_embeddings() -> None:
    with SessionLocal.begin() as session:
        foodstuff = create_foodstuff(session, FoodstuffCreate(name="Tomato", unit=Unit.G, kcal=Decimal(20)))
        write = RecipeVersionWrite.model_validate({
            "name": "Soup", "servings": 2, "preptime": 10,
            "ingredients": [{"index": 1, "foodstuffId": foodstuff.id, "amount": 100}],
            "steps": [{"index": 1, "description": "Cook"}],
        })
        historical = recipes.create_recipe(session, write)
        active = recipes.publish_active_recipe_edit(session, historical.lineage_id, write)
        drafts = [recipes.create_recipe_draft(session, active.lineage_id, write) for _ in range(22)]
        unrelated = recipes.create_recipe(session, write)
        deleted = recipes.create_recipe_draft(session, active.lineage_id, write)
        deleted_id = deleted.version_id
        recipes.discard_recipe_draft(session, active.lineage_id, deleted_id)
        versions = [historical, active, *drafts]
        for version in versions:
            version.last_modified = datetime(2026, 10, 8, tzinfo=timezone.utc)
        session.flush()
        expected = RecipeLineageOut(
            recipeLineageId=active.lineage_id,
            versions=[recipes.recipe_version_out(version) for version in
                sorted(versions, key=lambda version: version.version_id, reverse=True)],
        )
        anchors = [historical.version_id, active.version_id, drafts[0].version_id]
        unrelated_id = unrelated.version_id

    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    tool = next(tool for tool in (await client.list_tools()).tools if tool.name == "get_recipe_lineage")
                    assert tool.input_schema["required"] == ["recipe_version_id"]
                    assert tool.input_schema["properties"]["recipe_version_id"]["format"] == "uuid"
                    assert tool.annotations is not None
                    assert tool.annotations.read_only_hint is True
                    assert tool.annotations.destructive_hint is False
                    assert tool.annotations.idempotent_hint is True
                    assert tool.annotations.open_world_hint is False
                    for anchor in anchors:
                        result = await client.call_tool("get_recipe_lineage", {"recipe_version_id": str(anchor)})
                        assert not result.is_error
                        assert RecipeLineageOut.model_validate(result.structured_content) == expected
                    result = await client.call_tool("get_recipe_lineage", {"recipe_version_id": str(unrelated_id)})
                    assert not result.is_error
                    lineage = RecipeLineageOut.model_validate(result.structured_content)
                    assert [version.recipeVersionId for version in lineage.versions] == [unrelated_id]
                    for identifier in [uuid4(), deleted_id]:
                        result = await client.call_tool("get_recipe_lineage", {"recipe_version_id": str(identifier)})
                        assert result.is_error and "not found" in str(result)
                    for arguments in [{}, {"recipe_version_id": "invalid"}]:
                        assert (await client.call_tool("get_recipe_lineage", arguments)).is_error
                    with SessionLocal() as session:
                        assert session.scalar(select(func.count()).select_from(RecipeVersion)) == 25

    asyncio.run(exercise())


def test_lineage_mcp_database_failure_is_sanitized(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(session: Session, version_id: UUID) -> RecipeLineageOut:
        raise SQLAlchemyError("private database details")

    monkeypatch.setattr(recipes, "get_recipe_lineage", fail)

    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    result = await client.call_tool("get_recipe_lineage", {"recipe_version_id": str(uuid4())})
                    assert result.is_error
                    assert "Recipe lineage retrieval failed" in str(result)
                    assert "private database details" not in str(result)

    asyncio.run(exercise())
