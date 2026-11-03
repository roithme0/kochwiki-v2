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
from app.foodstuffs.models.foodstuff import Foodstuff
from app.foodstuffs.models.unit import Unit
from app.foodstuffs.schemas.foodstuff import FoodstuffCreate
from app.foodstuffs.services.foodstuffs import create_foodstuff
from app.infrastructure.embeddings.embeddings import EmbeddingClient
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
from tests.foodstuffs.test_foodstuff_semantic import FakeProvider, service


def test_assertion_resolves_the_existing_issuer_subject_pair(
    mcp_user: UserOut,
    provider_user: Callable[[str], UserOut],
) -> None:
    other = provider_user("Same subject, other issuer")
    subject = "cook:ä !'()*%"
    encoded_subject = quote(subject, safe="~!*'()")
    issuer = "https://idp.example/realms/cooks"
    with SessionLocal.begin() as session:
        session.execute(
            update(User)
            .where(User.id == mcp_user.id)
            .values(issuer=issuer, subject=subject)
        )
        session.execute(
            update(User)
            .where(User.id == other.id)
            .values(issuer=f"{issuer}-other", subject=subject)
        )
    payload = proposal_payload(mcp_user.id)

    async def exercise() -> None:
        app = main.create_app()
        async with (
            app.router.lifespan_context(app),
            httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app),
                base_url="http://localhost",
            ) as http,
            Client(
                streamable_http_client("http://localhost/mcp/", http_client=http)
            ) as client,
        ):
            for asserted_issuer, allowed in [
                (issuer, True),
                (f"{issuer}-other", False),
            ]:
                http.headers["X-Application-User"] = (
                    f"{quote(asserted_issuer, safe='')}:{encoded_subject}"
                )
                result = await client.call_tool(
                    "create_recipe_proposal",
                    {"proposal": payload.model_dump(mode="json")},
                )
                assert bool(result.is_error) is not allowed
            with SessionLocal() as session:
                assert session.query(User).count() == 2

    asyncio.run(exercise())


@pytest.mark.parametrize(
    "assertions",
    [
        [],
        [""],
        ["kochwiki:1"],
        ["1"],
        ["a:b:c"],
        ["%ZZ:b"],
        ["%FF:b"],
        [":b"],
        ["a:"],
        ["unknown:unknown"],
        ["a:b", "a:b"],
        ["a:b, a:b"],
    ],
)
def test_invalid_assertions_cannot_access_or_write_proposals(
    assertions: list[str],
    mcp_user: UserOut,
    mcp_headers: dict[str, str],
) -> None:
    payload = proposal_payload(mcp_user.id)

    async def exercise() -> None:
        app = main.create_app()
        async with (
            app.router.lifespan_context(app),
            httpx2.AsyncClient(
                headers=mcp_headers,
                transport=httpx2.ASGITransport(app=app),
                base_url="http://localhost",
            ) as owner_http,
            Client(
                streamable_http_client("http://localhost/mcp/", http_client=owner_http)
            ) as owner,
        ):
            created = await owner.call_tool(
                "create_recipe_proposal", {"proposal": payload.model_dump(mode="json")}
            )
            proposal = RecipeProposalOut.model_validate(created.structured_content)
            async with (
                httpx2.AsyncClient(
                    headers=[("X-Application-User", value) for value in assertions],
                    transport=httpx2.ASGITransport(app=app),
                    base_url="http://localhost",
                ) as http,
                Client(
                    streamable_http_client("http://localhost/mcp/", http_client=http)
                ) as client,
            ):
                assert len((await client.list_tools()).tools) == 8
                calls = [
                    (
                        "create_recipe_proposal",
                        {"proposal": payload.model_dump(mode="json")},
                    ),
                    ("get_recipe_proposal", {"proposal_id": str(proposal.proposalId)}),
                    ("save_recipe_proposal", {"proposal_id": str(proposal.proposalId)}),
                ]
                for name, arguments in calls:
                    with pytest.raises(MCPError, match="Caller identity required"):
                        await client.call_tool(name, arguments)
        with SessionLocal() as session:
            assert session.query(RecipeVersion).count() == 1
            assert len(list_foodstuffs(session, owner_id=mcp_user.id)) == 1

    asyncio.run(exercise())


def test_concurrent_assertions_are_isolated_and_reset_after_failures(
    mcp_user: UserOut,
    mcp_headers: dict[str, str],
    provider_user: Callable[[str], UserOut],
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
            async with (
                httpx2.AsyncClient(
                    headers=headers, transport=httpx2.ASGITransport(app=app)
                ) as http,
                Client(
                    streamable_http_client("http://localhost/mcp/", http_client=http),
                ) as client,
            ):
                result = await client.call_tool("caller_probe", {})
                assert result.structured_content == {
                    "before": user_id,
                    "after": user_id,
                }
                assert (await client.call_tool("failing_caller", {})).is_error
                assert (
                    await client.call_tool("sync_caller", {})
                ).structured_content == {"result": user_id}
                http.headers.pop("X-Application-User")
                with pytest.raises(MCPError, match="Caller identity required"):
                    await client.call_tool("sync_caller", {})
            with pytest.raises(MCPError, match="Caller identity required"):
                current_caller()

        async with app.router.lifespan_context(app):
            await asyncio.gather(
                run(mcp_headers, mcp_user.id),
                run(
                    {
                        "X-Application-User": f"{quote(other.issuer, safe='')}:{quote(other.subject, safe='')}"
                    },
                    other.id,
                ),
            )

    asyncio.run(exercise())


def test_foodstuff_tools_use_each_callers_catalogue_and_reject_foreign_updates(
    mcp_user: UserOut,
    provider_user: Callable[[str], UserOut],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    other = provider_user("Other caller")
    with SessionLocal.begin() as session:
        first_id, second_id = [
            create_foodstuff(
                session,
                FoodstuffCreate(name="Oats", brand="Mill", unit=Unit.G),
                owner_id=owner.id,
            ).id
            for owner in (mcp_user, other)
        ]
    provider = FakeProvider()
    assert service(provider).refresh_all().refreshed == 2
    monkeypatch.setattr(
        EmbeddingClient, "from_settings", lambda settings: EmbeddingClient(provider)
    )

    async def exercise() -> None:
        app = main.create_app()

        async def call_as(user: UserOut, own_id: int, foreign_id: int) -> int:
            headers = {
                "X-Application-User": f"{quote(user.issuer, safe='')}:{quote(user.subject, safe='')}"
            }
            async with (
                httpx2.AsyncClient(
                    headers=headers, transport=httpx2.ASGITransport(app=app)
                ) as http,
                Client(
                    streamable_http_client("http://localhost/mcp/", http_client=http)
                ) as client,
            ):
                result = await client.call_tool(
                    "search_foodstuffs", {"query": "Oats", "limit": 1}
                )
                assert not result.is_error
                assert result.structured_content is not None
                assert [food["id"] for food in result.structured_content["result"]] == [
                    own_id
                ]
                denied = await client.call_tool(
                    "update_foodstuff",
                    {"foodstuff_id": foreign_id, "changes": {"name": "Forbidden"}},
                )
                assert denied.is_error
                assert "Only the foodstuff owner" in str(denied)
                created = await client.call_tool(
                    "create_foodstuff",
                    {"foodstuff": {"name": "New", "brand": "Mill", "unit": "G"}},
                )
                assert not created.is_error and created.structured_content is not None
                created_id = created.structured_content["id"]
                assert isinstance(created_id, int)
                http.headers.pop("X-Application-User")
                with pytest.raises(MCPError, match="Caller identity required"):
                    await client.call_tool("search_foodstuffs", {"query": "Oats"})
                return created_id

        async with app.router.lifespan_context(app):
            created = await asyncio.gather(
                call_as(mcp_user, first_id, second_id),
                call_as(other, second_id, first_id),
            )
        with SessionLocal() as session:
            for owner, food_id, created_id in zip(
                (mcp_user, other), (first_id, second_id), created, strict=True
            ):
                food = session.get(Foodstuff, food_id)
                new_food = session.get(Foodstuff, created_id)
                assert food is not None and food.name == "Oats"
                assert new_food is not None and new_food.owner_id == owner.id

    asyncio.run(exercise())


def test_identity_lookup_database_failure_is_closed_and_sanitized(
    monkeypatch: pytest.MonkeyPatch,
    mcp_headers: dict[str, str],
) -> None:
    def unavailable() -> None:
        raise SQLAlchemyError("private database details")

    monkeypatch.setattr(asserted_identity, "SessionLocal", unavailable)

    async def exercise() -> None:
        app = main.create_app()
        async with (
            app.router.lifespan_context(app),
            httpx2.AsyncClient(
                headers=mcp_headers,
                transport=httpx2.ASGITransport(app=app),
            ) as http,
            Client(
                streamable_http_client("http://localhost/mcp/", http_client=http)
            ) as client,
        ):
            assert len((await client.list_tools()).tools) == 8
            with pytest.raises(
                MCPError, match="Caller identity service unavailable"
            ) as error:
                await client.call_tool(
                    "get_recipe_proposal", {"proposal_id": str(uuid4())}
                )
            assert "private database details" not in str(error.value)

    asyncio.run(exercise())
