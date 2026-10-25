import asyncio
from collections.abc import Callable
from urllib.parse import quote
from uuid import UUID, uuid4

import httpx2
import pytest
from app.foodstuffs.models.unit import Unit
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.infrastructure.database.session import SessionLocal
from app.main import create_app
from app.identity.config import SESSION_COOKIE
from app.identity.schemas.user import UserOut
from app.identity.services.sessions import establish_session
from app.recipes.models.version_state import RecipeVersionState
from app.recipes.models.recipe import RecipeVersion
from app.foodstuffs.schemas.foodstuff import FoodstuffCreate
from app.recipes.schemas.recipe import RecipeVersionOut, RecipeVersionWrite
from app.recipes.schemas.proposal import RecipeProposalCreate, RecipeProposalDetailsOut, RecipeProposalOut
from app.recipes.services import proposal_saves
from app.foodstuffs.services.foodstuffs import create_foodstuff, delete_foodstuff, list_foodstuffs
from app.recipes.services.recipes import discard_recipe_draft
from app.recipes.services.recipes import create_recipe


def proposal_payload(owner_id: int) -> RecipeProposalCreate:
    with SessionLocal.begin() as session:
        source = create_recipe(session, RecipeVersionWrite(name="Original", servings=1), owner_id=owner_id)
        foodstuff = create_foodstuff(session, FoodstuffCreate(name="Oats", unit=Unit.G))
        return RecipeProposalCreate.model_validate({
            "sourceRecipeVersionId": source.version_id,
            "recipe": {
                "name": "Improved", "servings": 2,
                "ingredients": [
                    {"index": 1, "amount": 50, "foodstuff": {"kind": "existing", "foodstuffId": foodstuff.id}},
                    {"index": 2, "amount": 100, "foodstuff": {"kind": "temporary", "definition": {
                        "name": "Beans", "unit": "G", "protein": 10,
                    }}},
                ],
                "steps": [{"index": 1, "description": "Cook"}],
            },
        })


def test_proposal_mcp_workflow_refinement_repeat_save_and_lifecycle(recipe_session: UserOut, mcp_headers: dict[str, str], mcp_user: UserOut) -> None:
    payload = proposal_payload(mcp_user.id)
    with SessionLocal.begin() as session:
        source = session.get(RecipeVersion, payload.sourceRecipeVersionId)
        assert source is not None
        secret, _ = establish_session(session, source.lineage.owner_id, None)

    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                headers=mcp_headers, transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    tools = {tool.name: tool for tool in (await client.list_tools()).tools}
                    for name, required, read_only, idempotent in [
                        ("create_recipe_proposal", ["proposal"], False, False),
                        ("get_recipe_proposal", ["proposal_id"], True, True),
                        ("save_recipe_proposal", ["proposal_id"], False, True),
                    ]:
                        tool = tools[name]
                        assert tool.input_schema["required"] == required
                        assert tool.annotations is not None
                        assert tool.annotations.read_only_hint is read_only
                        assert tool.annotations.idempotent_hint is idempotent
                    created = await client.call_tool("create_recipe_proposal", {"proposal": payload.model_dump(mode="json")})
                    assert not created.is_error
                    proposal = RecipeProposalOut.model_validate(created.structured_content)
                    args = {"proposal_id": str(proposal.proposalId)}
                    retrieved = await client.call_tool("get_recipe_proposal", args)
                    assert not retrieved.is_error
                    details = RecipeProposalDetailsOut.model_validate(retrieved.structured_content)
                    assert details.proposal == proposal
                    assert details.presentation.ingredients[1].foodstuff.kind == "temporary"
                    assert details.presentation.ingredients[1].foodstuff.name == "Beans"
                    with SessionLocal() as session:
                        assert len(list_foodstuffs(session)) == 1
                        assert session.query(RecipeVersion).count() == 1

                    refinement = payload.model_dump(mode="json")
                    refinement["baseProposalId"] = str(proposal.proposalId)
                    refined = await client.call_tool("create_recipe_proposal", {"proposal": refinement})
                    assert not refined.is_error
                    second = RecipeProposalOut.model_validate(refined.structured_content)
                    assert second.proposalId != proposal.proposalId
                    assert second.baseProposalId == proposal.proposalId
                    saved = await client.call_tool("save_recipe_proposal", args)
                    assert not saved.is_error
                    draft = RecipeVersionOut.model_validate(saved.structured_content)
                    assert draft.name == "Improved" and draft.state == RecipeVersionState.DRAFT
                    assert draft.ingredients[1].foodstuff.name == "Beans"
                    repeated = await client.call_tool("save_recipe_proposal", args)
                    assert not repeated.is_error and repeated.structured_content == saved.structured_content
                    http.cookies.set(SESSION_COOKIE, secret)
                    http_saved = await http.post(f"/recipe-proposals/{proposal.proposalId}/save", headers={"Origin": "http://localhost:8000", "X-Application-User": "unknown:unknown"})
                    assert http_saved.status_code == 200
                    assert http_saved.json() == draft.model_dump(mode="json")
                    with SessionLocal.begin() as session:
                        assert len(list_foodstuffs(session)) == 2
                        assert session.query(RecipeVersion).count() == 2
                        discard_recipe_draft(session, draft.recipeLineageId, draft.recipeVersionId)
                    missing = await client.call_tool("save_recipe_proposal", args)
                    assert missing.is_error and "not found" in str(missing)
        # A fresh application cannot retrieve the previous application's proposals.
        fresh = create_app()
        async with fresh.router.lifespan_context(fresh):
            async with httpx2.AsyncClient(
                headers=mcp_headers, transport=httpx2.ASGITransport(app=fresh), base_url="http://localhost"
            ) as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    assert (await client.call_tool("get_recipe_proposal", args)).is_error

    asyncio.run(exercise())


def test_proposal_mcp_validation_and_missing_dependencies(mcp_headers: dict[str, str], mcp_user: UserOut) -> None:
    payload = proposal_payload(mcp_user.id)

    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                headers=mcp_headers, transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    for tool in ["get_recipe_proposal", "save_recipe_proposal"]:
                        for identifier in ["invalid", str(uuid4())]:
                            assert (await client.call_tool(tool, {"proposal_id": identifier})).is_error
                    invalid = payload.model_dump(mode="json")
                    invalid["unexpected"] = True
                    assert (await client.call_tool("create_recipe_proposal", {"proposal": invalid})).is_error
                    invalid = payload.model_dump(mode="json")
                    invalid["sourceRecipeVersionId"] = str(uuid4())
                    assert (await client.call_tool("create_recipe_proposal", {"proposal": invalid})).is_error
                    result = await client.call_tool("create_recipe_proposal", {"proposal": payload.model_dump(mode="json")})
                    assert not result.is_error
                    proposal = RecipeProposalOut.model_validate(result.structured_content)
                    args = {"proposal_id": str(proposal.proposalId)}
                    invalid = payload.model_dump(mode="json")
                    invalid["baseProposalId"] = str(uuid4())
                    assert (await client.call_tool("create_recipe_proposal", {"proposal": invalid})).is_error
                    with SessionLocal.begin() as session:
                        delete_foodstuff(session, list_foodstuffs(session)[0].id)
                    for tool in ["get_recipe_proposal", "save_recipe_proposal"]:
                        result = await client.call_tool(tool, args)
                        assert result.is_error and "Foodstuff" in str(result) and "not found" in str(result)
                    with SessionLocal() as session:
                        assert list_foodstuffs(session) == []
                        assert session.query(RecipeVersion).count() == 1

    asyncio.run(exercise())


def test_proposal_mcp_save_failure_is_sanitized_and_can_be_retried(monkeypatch: pytest.MonkeyPatch, mcp_headers: dict[str, str], mcp_user: UserOut) -> None:
    payload = proposal_payload(mcp_user.id)
    original = proposal_saves.create_recipe_draft

    def fail(session: Session, lineage_id: UUID, recipe: RecipeVersionWrite) -> RecipeVersion:
        original(session, lineage_id, recipe)
        raise SQLAlchemyError("private database details")

    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                headers=mcp_headers, transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                    result = await client.call_tool("create_recipe_proposal", {"proposal": payload.model_dump(mode="json")})
                    assert not result.is_error
                    proposal = RecipeProposalOut.model_validate(result.structured_content)
                    args = {"proposal_id": str(proposal.proposalId)}
                    monkeypatch.setattr(proposal_saves, "create_recipe_draft", fail)
                    failed = await client.call_tool("save_recipe_proposal", args)
                    assert failed.is_error and "Recipe proposal saving failed" in str(failed)
                    assert "private database details" not in str(failed)
                    with SessionLocal() as session:
                        assert len(list_foodstuffs(session)) == 1
                        assert session.query(RecipeVersion).count() == 1
                    monkeypatch.setattr(proposal_saves, "create_recipe_draft", original)
                    assert not (await client.call_tool("save_recipe_proposal", args)).is_error

    asyncio.run(exercise())


@pytest.mark.parametrize("saved", [False, True])
def test_mcp_proposal_authorization_and_shared_recipe_reads(
    mcp_user: UserOut, mcp_headers: dict[str, str],
    provider_user: Callable[[str], UserOut], saved: bool,
) -> None:
    payload = proposal_payload(mcp_user.id)
    other = provider_user("Other caller")
    other_headers = {"X-Application-User": f"{quote(other.issuer, safe='')}:{quote(other.subject, safe='')}"}

    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                headers=mcp_headers, transport=httpx2.ASGITransport(app=app), base_url="http://localhost",
            ) as owner_http, httpx2.AsyncClient(
                headers=other_headers, transport=httpx2.ASGITransport(app=app), base_url="http://localhost",
            ) as other_http:
                async with Client(streamable_http_client("http://localhost/mcp/", http_client=owner_http)) as owner_client, Client(
                    streamable_http_client("http://localhost/mcp/", http_client=other_http)
                ) as other_client:
                    created = await owner_client.call_tool("create_recipe_proposal", {"proposal": payload.model_dump(mode="json")})
                    assert not created.is_error
                    proposal = RecipeProposalOut.model_validate(created.structured_content)
                    args = {"proposal_id": str(proposal.proposalId)}
                    if saved:
                        assert not (await owner_client.call_tool("save_recipe_proposal", args)).is_error
                    with SessionLocal() as session:
                        before = (session.query(RecipeVersion).count(), len(list_foodstuffs(session)))
                    read = await other_client.call_tool("get_recipe_lineage", {"recipe_version_id": str(payload.sourceRecipeVersionId)})
                    assert not read.is_error
                    denied = await other_client.call_tool("create_recipe_proposal", {"proposal": payload.model_dump(mode="json")})
                    assert denied.is_error and "Only the recipe owner" in str(denied)
                    refinement = payload.model_copy(update={"baseProposalId": proposal.proposalId})
                    denied = await other_client.call_tool("create_recipe_proposal", {"proposal": refinement.model_dump(mode="json")})
                    assert denied.is_error and "not found" in str(denied)
                    for tool in ("get_recipe_proposal", "save_recipe_proposal"):
                        denied = await other_client.call_tool(tool, args)
                        assert denied.is_error and "not found" in str(denied)
                    with SessionLocal() as session:
                        assert (session.query(RecipeVersion).count(), len(list_foodstuffs(session))) == before
                    assert not (await owner_client.call_tool("get_recipe_proposal", args)).is_error
                    assert not (await owner_client.call_tool("save_recipe_proposal", args)).is_error

    asyncio.run(exercise())
