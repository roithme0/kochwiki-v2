import asyncio
from collections.abc import Callable
from urllib.parse import quote
from uuid import uuid4

import httpx2
import pytest
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.server import MCPServer
from mcp.shared.exceptions import MCPError
from sqlalchemy import update
from sqlalchemy.exc import SQLAlchemyError
from starlette.applications import Starlette

from app import main
from app.foodstuffs.services.foodstuffs import list_foodstuffs
from app.identity.schemas.user import UserOut
from app.identity.models.user import User
from app.infrastructure.database.session import SessionLocal
from app.infrastructure.mcp import asserted_identity
from app.infrastructure.mcp.asserted_identity import current_caller
from app.infrastructure.mcp.server import create_mcp_server
from app.infrastructure.mcp.services import MCPServices
from app.recipes.models.recipe import RecipeVersion
from app.recipes.schemas.proposal import RecipeProposalOut
from tests.infrastructure.mcp.test_mcp_recipe_proposals import proposal_payload


def test_assertion_resolves_the_existing_issuer_subject_pair(
    mcp_user: UserOut, provider_user: Callable[[str], UserOut],
) -> None:
    other = provider_user("Same subject, other issuer")
    subject = "cook:ä !'()*%"
    encoded_subject = quote(subject, safe="~!*'()")
    issuer = "https://idp.example/realms/cooks"
    with SessionLocal.begin() as session:
        session.execute(update(User).where(User.id == mcp_user.id).values(issuer=issuer, subject=subject))
        session.execute(update(User).where(User.id == other.id).values(issuer=f"{issuer}-other", subject=subject))
    payload = proposal_payload(mcp_user.id)

    async def exercise() -> None:
        app = main.create_app()
        async with app.router.lifespan_context(app), httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app), base_url="http://localhost",
        ) as http, Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
            for asserted_issuer, allowed in [(issuer, True), (f"{issuer}-other", False)]:
                http.headers["X-Application-User"] = f"{quote(asserted_issuer, safe='')}:{encoded_subject}"
                result = await client.call_tool("create_recipe_proposal", {"proposal": payload.model_dump(mode="json")})
                assert bool(result.is_error) is not allowed
            with SessionLocal() as session:
                assert session.query(User).count() == 2

    asyncio.run(exercise())


@pytest.mark.parametrize("assertions", [
    [], [""], ["kochwiki:1"], ["1"], ["a:b:c"], ["%ZZ:b"], ["%FF:b"],
    [":b"], ["a:"], ["unknown:unknown"], ["a:b", "a:b"], ["a:b, a:b"],
])
def test_invalid_assertions_cannot_access_or_write_proposals(
    assertions: list[str], mcp_user: UserOut, mcp_headers: dict[str, str],
) -> None:
    payload = proposal_payload(mcp_user.id)

    async def exercise() -> None:
        app = main.create_app()
        async with app.router.lifespan_context(app), httpx2.AsyncClient(
            headers=mcp_headers, transport=httpx2.ASGITransport(app=app), base_url="http://localhost",
        ) as owner_http, Client(streamable_http_client("http://localhost/mcp/", http_client=owner_http)) as owner:
            created = await owner.call_tool("create_recipe_proposal", {"proposal": payload.model_dump(mode="json")})
            proposal = RecipeProposalOut.model_validate(created.structured_content)
            async with httpx2.AsyncClient(
                headers=[("X-Application-User", value) for value in assertions],
                transport=httpx2.ASGITransport(app=app), base_url="http://localhost",
            ) as http, Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
                assert len((await client.list_tools()).tools) == 8
                calls = [
                    ("create_recipe_proposal", {"proposal": payload.model_dump(mode="json")}),
                    ("get_recipe_proposal", {"proposal_id": str(proposal.proposalId)}),
                    ("save_recipe_proposal", {"proposal_id": str(proposal.proposalId)}),
                ]
                for name, arguments in calls:
                    with pytest.raises(MCPError, match="Caller identity required"):
                        await client.call_tool(name, arguments)
        with SessionLocal() as session:
            assert session.query(RecipeVersion).count() == 1
            assert len(list_foodstuffs(session)) == 1

    asyncio.run(exercise())


def test_concurrent_assertions_are_isolated_and_reset_after_failures(
    mcp_user: UserOut, mcp_headers: dict[str, str], provider_user: Callable[[str], UserOut],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    other = provider_user("Other caller")

    async def exercise() -> None:
        entered = 0
        ready = asyncio.Event()

        def server_with_probes(services: MCPServices) -> tuple[MCPServer, Starlette]:
            server, app = create_mcp_server(services)

            @server.tool()
            async def caller_probe() -> dict[str, int]:
                nonlocal entered
                before = current_caller().user_id
                entered += 1
                if entered == 2:
                    ready.set()
                await asyncio.wait_for(ready.wait(), timeout=5)
                return {"before": before, "after": current_caller().user_id}

            @server.tool()
            def failing_caller() -> int:
                current_caller()
                raise ValueError("Probe failure")

            @server.tool()
            def sync_caller() -> int:
                return current_caller().user_id

            return server, app

        monkeypatch.setattr(main, "create_mcp_server", server_with_probes)
        app = main.create_app()

        async def run(headers: dict[str, str], user_id: int) -> None:
            async with httpx2.AsyncClient(headers=headers, transport=httpx2.ASGITransport(app=app)) as http, Client(
                streamable_http_client("http://localhost/mcp/", http_client=http),
            ) as client:
                result = await client.call_tool("caller_probe", {})
                assert result.structured_content == {"before": user_id, "after": user_id}
                assert (await client.call_tool("failing_caller", {})).is_error
                assert (await client.call_tool("sync_caller", {})).structured_content == {"result": user_id}
                http.headers.pop("X-Application-User")
                with pytest.raises(MCPError, match="Caller identity required"):
                    await client.call_tool("sync_caller", {})
            with pytest.raises(MCPError, match="Caller identity required"):
                current_caller()

        async with app.router.lifespan_context(app):
            await asyncio.gather(run(mcp_headers, mcp_user.id), run(
                {"X-Application-User": f"{quote(other.issuer, safe='')}:{quote(other.subject, safe='')}"}, other.id,
            ))

    asyncio.run(exercise())


def test_identity_lookup_database_failure_is_closed_and_sanitized(
    monkeypatch: pytest.MonkeyPatch, mcp_headers: dict[str, str],
) -> None:
    def unavailable() -> None:
        raise SQLAlchemyError("private database details")

    monkeypatch.setattr(asserted_identity, "SessionLocal", unavailable)

    async def exercise() -> None:
        app = main.create_app()
        async with app.router.lifespan_context(app), httpx2.AsyncClient(
            headers=mcp_headers, transport=httpx2.ASGITransport(app=app),
        ) as http, Client(streamable_http_client("http://localhost/mcp/", http_client=http)) as client:
            assert len((await client.list_tools()).tools) == 8
            with pytest.raises(MCPError, match="Caller identity service unavailable") as error:
                await client.call_tool("get_recipe_proposal", {"proposal_id": str(uuid4())})
            assert "private database details" not in str(error.value)

    asyncio.run(exercise())
