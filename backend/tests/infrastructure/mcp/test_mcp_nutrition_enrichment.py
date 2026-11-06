import asyncio
import json
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from decimal import Decimal

import httpx2
import pytest
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.foodstuffs.models.unit import Unit
from app.foodstuffs.schemas.foodstuff import FoodstuffCreate, FoodstuffOut
from app.foodstuffs.schemas.nutrition_enrichment import (
    FoodstuffIdentity,
    NutritionFill,
    NutritionFillResult,
)
from app.foodstuffs.services import foodstuffs
from app.identity.schemas.user import UserOut
from app.infrastructure.database.session import SessionLocal
from app.main import create_app
from app.recipes.schemas.recipe import RecipeLineageOut, RecipeVersionWrite
from app.recipes.schemas.proposal import RecipeProposalDetailsOut, RecipeProposalOut
from app.recipes.services import recipes


@asynccontextmanager
async def mcp_client(headers: dict[str, str]) -> AsyncIterator[Client]:
    app = create_app()
    async with app.router.lifespan_context(app):
        async with httpx2.AsyncClient(
            headers=headers,
            transport=httpx2.ASGITransport(app=app),
            base_url="http://localhost",
        ) as http:
            async with Client(
                streamable_http_client("http://localhost/mcp/", http_client=http)
            ) as client:
                yield client


def test_enrichment_mcp_refreshes_historical_source_and_shared_proposal(
    mcp_user: UserOut,
    mcp_headers: dict[str, str],
) -> None:
    with SessionLocal.begin() as session:
        oats = foodstuffs.create_foodstuff(
            session,
            FoodstuffCreate(name="Oats", unit=Unit.G, fat=Decimal(0)),
            owner_id=mcp_user.id,
        )
        foodstuff_id = oats.id
        write = RecipeVersionWrite.model_validate(
            {
                "name": "Porridge",
                "servings": 2,
                "ingredients": [{"index": 1, "amount": 100, "foodstuffId": oats.id}],
            }
        )
        source = recipes.create_recipe(session, write, owner_id=mcp_user.id)
        source_id = str(source.version_id)
        recipes.publish_active_recipe_edit(session, source.lineage_id, write)

    async def exercise() -> None:
        async with mcp_client(mcp_headers) as client:
            tools = {tool.name: tool for tool in (await client.list_tools()).tools}
            read = tools["get_foodstuff"]
            fill = tools["fill_foodstuff_nutrition"]
            assert read.annotations is not None and read.annotations.read_only_hint
            assert fill.annotations is not None
            assert fill.annotations.read_only_hint is False
            assert fill.annotations.destructive_hint is False
            assert fill.annotations.idempotent_hint is True
            assert fill.input_schema["required"] == [
                "foodstuff_id",
                "expected",
                "nutrition",
            ]
            nutrient_schema = fill.input_schema["$defs"]["NutritionFill"]
            assert nutrient_schema["minProperties"] == 1
            assert nutrient_schema["additionalProperties"] is False
            for field in nutrient_schema["properties"].values():
                assert "default" not in field
                assert field.get("type") != "null"
                assert all(
                    branch.get("type") != "null" for branch in field.get("anyOf", [])
                )
            current = await client.call_tool(
                "get_foodstuff", {"foodstuff_id": foodstuff_id}
            )
            assert not current.is_error
            assert (
                FoodstuffOut.model_validate_json(
                    json.dumps(current.structured_content)
                ).fiber
                is None
            )
            proposal = await client.call_tool(
                "create_recipe_proposal",
                {
                    "proposal": {
                        "sourceRecipeVersionId": source_id,
                        "recipe": {
                            "name": "More porridge",
                            "servings": 2,
                            "steps": [],
                            "ingredients": [
                                {
                                    "index": 1,
                                    "amount": 200,
                                    "foodstuff": {
                                        "kind": "existing",
                                        "foodstuffId": foodstuff_id,
                                    },
                                },
                            ],
                        },
                    }
                },
            )
            assert not proposal.is_error
            proposal_id = str(
                RecipeProposalOut.model_validate(proposal.structured_content).proposalId
            )
            arguments = {
                "foodstuff_id": foodstuff_id,
                "expected": {
                    "details": None,
                    "name": "Oats",
                    "brand": None,
                    "unit": "G",
                },
                "nutrition": {
                    "kcal": 370,
                    "protein": 12,
                    "carbs": 60,
                    "fat": 7,
                    "fiber": 10,
                },
            }
            filled = await client.call_tool("fill_foodstuff_nutrition", arguments)
            assert not filled.is_error
            result = NutritionFillResult.model_validate_json(
                json.dumps(filled.structured_content)
            )
            assert result.applied == ["kcal", "carbs", "protein", "fiber"]
            assert result.retained == ["fat"]
            assert result.foodstuff.fat == 0
            repeated = await client.call_tool("fill_foodstuff_nutrition", arguments)
            assert not repeated.is_error
            assert (
                NutritionFillResult.model_validate_json(
                    json.dumps(repeated.structured_content)
                ).applied
                == []
            )
            lineage = await client.call_tool(
                "get_recipe_lineage", {"recipe_version_id": source_id}
            )
            assert not lineage.is_error
            versions = RecipeLineageOut.model_validate(
                lineage.structured_content
            ).versions
            historical = next(
                version
                for version in versions
                if str(version.recipeVersionId) == source_id
            )
            assert historical.state == "historical"
            assert historical.fiber.status == "exact" and historical.fiber.value == 5
            assert (
                historical.protein.status == "exact" and historical.protein.value == 6
            )
            assert historical.fat.value == 0
            resolved = await client.call_tool(
                "get_recipe_proposal", {"proposal_id": proposal_id}
            )
            assert not resolved.is_error
            presentation = RecipeProposalDetailsOut.model_validate(
                resolved.structured_content
            ).presentation
            assert (
                presentation.fiber.status == "exact" and presentation.fiber.value == 10
            )
            assert presentation.protein.value == 12
            assert presentation.ingredients[0].foodstuff.fiber == 10

    asyncio.run(exercise())


def test_enrichment_mcp_errors_are_atomic_and_sanitized(
    mcp_user: UserOut,
    mcp_headers: dict[str, str],
    provider_user: Callable[[str], UserOut],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    other = provider_user("Other")
    with SessionLocal.begin() as session:
        target_id = foodstuffs.create_foodstuff(
            session, FoodstuffCreate(name="Oats", unit=Unit.G), owner_id=mcp_user.id
        ).id
        foreign_id = foodstuffs.create_foodstuff(
            session, FoodstuffCreate(name="Other", unit=Unit.G), owner_id=other.id
        ).id
    original_fill = foodstuffs.fill_foodstuff_nutrition

    def fail_after_flush(
        session: Session,
        foodstuff_id: int,
        expected: FoodstuffIdentity,
        nutrition: NutritionFill,
        *,
        owner_id: int,
    ) -> NutritionFillResult:
        original_fill(session, foodstuff_id, expected, nutrition, owner_id=owner_id)
        raise SQLAlchemyError("secret database diagnostic")

    async def exercise() -> None:
        async with mcp_client(mcp_headers) as client:
            arguments: dict[str, object] = {
                "foodstuff_id": target_id,
                "expected": {
                    "details": None,
                    "name": "Oats",
                    "brand": None,
                    "unit": "G",
                },
                "nutrition": {"fiber": 10},
            }
            for changes, message in [
                ({"foodstuff_id": 999999}, "not found"),
                ({"foodstuff_id": foreign_id}, "owner"),
                (
                    {
                        "expected": {
                            "details": None,
                            "name": "Oats",
                            "brand": None,
                            "unit": "ML",
                        }
                    },
                    "identity or unit changed",
                ),
                ({"nutrition": {}}, "at least one"),
                ({"nutrition": {"fiber": None}}, "cannot be null"),
                ({"nutrition": {"fiber": -1}}, "greater than or equal"),
                ({"nutrition": {"fiber": True}}, "valid"),
                ({"nutrition": {"fiber": "NaN"}}, "finite"),
                ({"nutrition": {"fiber": 10, "unit": "G"}}, "Extra inputs"),
                ({"foodstuff_id": True}, "valid integer"),
            ]:
                failed = await client.call_tool(
                    "fill_foodstuff_nutrition", arguments | changes
                )
                assert failed.is_error
                assert message in str(failed)
            monkeypatch.setattr(
                foodstuffs, "fill_foodstuff_nutrition", fail_after_flush
            )
            failed = await client.call_tool("fill_foodstuff_nutrition", arguments)
            assert failed.is_error
            assert "Foodstuff nutrition enrichment failed" in str(failed)
            assert "secret database diagnostic" not in str(failed)
            read = await client.call_tool("get_foodstuff", {"foodstuff_id": target_id})
            assert FoodstuffOut.model_validate(read.structured_content).fiber is None
            foreign = await client.call_tool(
                "get_foodstuff", {"foodstuff_id": foreign_id}
            )
            assert not foreign.is_error
            missing = await client.call_tool("get_foodstuff", {"foodstuff_id": 999999})
            assert missing.is_error and "not found" in str(missing)
            invalid = await client.call_tool("get_foodstuff", {"foodstuff_id": True})
            assert invalid.is_error

    asyncio.run(exercise())
