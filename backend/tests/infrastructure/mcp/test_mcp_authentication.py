import asyncio
import secrets
from collections.abc import Callable
from datetime import timedelta
from typing import Literal

import httpx2
import pytest
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.server import MCPServer
from mcp.shared.exceptions import MCPError
from sqlalchemy import func, select, update
from sqlalchemy.exc import SQLAlchemyError
from starlette.applications import Starlette
from starlette.requests import Request

from app import main
from app.foodstuffs.models.foodstuff import Foodstuff
from app.identity.config import SESSION_COOKIE, SESSION_LIFETIME
from app.identity.models.application_session import ApplicationSession
from app.identity.models.delegation_token import DelegationToken
from app.identity.models.user import User
from app.identity.schemas.user import UserOut
from app.identity.services.delegation import MCP_AUDIENCE, issue_delegation_token
from app.identity.services.sessions import establish_session, invalidate_session
from app.infrastructure.database.session import SessionLocal
from app.infrastructure.mcp import authentication
from app.infrastructure.mcp.authentication import MCPCaller, current_caller
from app.infrastructure.mcp.server import (
    create_mcp_server as create_unprotected_mcp_server,
)
from app.infrastructure.mcp.services import MCPServices


def create_mcp_server(services: MCPServices) -> tuple[MCPServer, Starlette]:
    server, app = create_unprotected_mcp_server(services)
    server.middleware.append(authentication.authenticate_message)
    app.add_middleware(authentication.MCPAuthenticationMiddleware)
    return server, app


@pytest.fixture(autouse=True)
def isolated_authentication_boundary(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "create_mcp_server", create_mcp_server)


@pytest.fixture
def mcp_headers(mcp_user: UserOut) -> dict[str, str]:
    with SessionLocal.begin() as session:
        secret, _ = establish_session(session, mcp_user.id, None)
        session.flush()
        token = issue_delegation_token(session, secret, lifetime=timedelta(minutes=5))
        assert token is not None
    return {"Authorization": f"Bearer {token.secret}"}


RPC_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2026-07-28",
}
CREATE = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
        "name": "create_foodstuff",
        "arguments": {"foodstuff": {"name": "Forbidden", "unit": "G"}},
    },
}


@pytest.mark.parametrize(
    ("method", "rpc"),
    [
        ("GET", "tools/list"),
        ("DELETE", "tools/list"),
        ("OPTIONS", "tools/list"),
        ("POST", "initialize"),
        ("POST", "tools/list"),
        ("POST", "tools/call"),
    ],
)
def test_entire_mcp_surface_requires_credentials(method: str, rpc: str) -> None:
    async def exercise() -> None:
        app = main.create_app()
        async with (
            app.router.lifespan_context(app),
            httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app),
                base_url="http://localhost",
            ) as http,
        ):
            response = await http.request(
                method, "/mcp/", headers=RPC_HEADERS, json={**CREATE, "method": rpc}
            )
            assert response.status_code == 401
            assert response.json() == {"detail": "Authentication required."}
            assert response.headers["www-authenticate"] == 'Bearer realm="kochwiki:mcp"'
            assert response.headers["cache-control"] == "no-store"

    asyncio.run(exercise())
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(Foodstuff)) == 0


@pytest.mark.parametrize(
    "credential",
    [
        "missing",
        "cookie",
        "browser-bearer",
        "unknown",
        "malformed",
        "basic",
        "duplicate",
        "no-value",
        "extra-fields",
        "wrong-audience",
        "expired-token",
        "expired-session",
        "logout",
    ],
)
def test_invalid_credentials_cannot_invoke_tools(
    provider_user: Callable[[str], UserOut],
    credential: str,
) -> None:
    user = provider_user("MCP user")
    with SessionLocal.begin() as session:
        browser_secret, _ = establish_session(session, user.id, None)
        session.flush()
        token = issue_delegation_token(
            session, browser_secret, lifetime=timedelta(minutes=5)
        )
        assert token is not None
        if credential == "wrong-audience":
            session.execute(update(DelegationToken).values(audience="another-resource"))
        elif credential == "expired-token":
            session.execute(
                update(DelegationToken).values(
                    created_at=func.statement_timestamp() - timedelta(minutes=5),
                    expires_at=func.statement_timestamp(),
                )
            )
        elif credential == "expired-session":
            session.execute(
                update(ApplicationSession).values(
                    last_activity_at=func.statement_timestamp() - SESSION_LIFETIME
                )
            )
        elif credential == "logout":
            assert invalidate_session(session, browser_secret)
    authorization = {
        "missing": None,
        "cookie": None,
        "browser-bearer": f"Bearer {browser_secret}",
        "unknown": f"Bearer {secrets.token_urlsafe(32)}",
        "malformed": "Bearer malformed",
        "basic": f"Basic {token.secret}",
        "no-value": "Bearer",
        "extra-fields": f"Bearer {token.secret} extra",
    }.get(credential, f"Bearer {token.secret}")
    headers = [(key, value) for key, value in RPC_HEADERS.items()]
    headers.append(("X-Application-User", f"kochwiki:{user.id}"))
    if authorization:
        headers.append(("Authorization", authorization))
    if credential == "duplicate":
        headers.append(("Authorization", f"Bearer {token.secret}"))
    if credential == "cookie":
        headers.append(("Cookie", f"{SESSION_COOKIE}={browser_secret}"))

    async def exercise() -> None:
        app = main.create_app()
        async with (
            app.router.lifespan_context(app),
            httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app),
                base_url="http://localhost",
            ) as http,
        ):
            response = await http.post("/mcp/", headers=headers, json=CREATE)
            assert response.status_code == 401
            assert (
                token.secret not in response.text
                and browser_secret not in response.text
            )

    asyncio.run(exercise())
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(Foodstuff)) == 0


def test_logout_after_discovery_blocks_later_tool_calls(
    mcp_headers: dict[str, str],
) -> None:
    async def exercise() -> None:
        app = main.create_app()
        async with (
            app.router.lifespan_context(app),
            httpx2.AsyncClient(
                headers=mcp_headers,
                transport=httpx2.ASGITransport(app=app),
                base_url="http://localhost",
            ) as http,
            Client(
                streamable_http_client("http://localhost/mcp/", http_client=http)
            ) as client,
        ):
            assert len((await client.list_tools()).tools) == 8
            with SessionLocal.begin() as session:
                parent = session.scalars(select(ApplicationSession)).one()
                session.delete(parent)
            response = await http.post("/mcp/", headers=RPC_HEADERS, json=CREATE)
            assert response.status_code == 401

    asyncio.run(exercise())
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(Foodstuff)) == 0


@pytest.mark.parametrize("invalidate", ["logout", "expiry", "session-expiry"])
@pytest.mark.parametrize("mode", ["auto", "legacy"])
def test_tool_invocation_revalidates_after_http_admission(
    mcp_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    invalidate: str,
    mode: Literal["auto", "legacy"],
) -> None:
    original = authentication._authenticate
    checks = 0
    armed = False

    def authenticate_then_invalidate(request: Request) -> MCPCaller | None:
        nonlocal checks
        caller = original(request)
        if not armed:
            return caller
        checks += 1
        if checks == 1:
            with SessionLocal.begin() as session:
                if invalidate == "logout":
                    parent = session.scalars(select(ApplicationSession)).one()
                    session.delete(parent)
                elif invalidate == "expiry":
                    session.execute(
                        update(DelegationToken).values(
                            created_at=func.statement_timestamp()
                            - timedelta(minutes=5),
                            expires_at=func.statement_timestamp(),
                        )
                    )
                else:
                    session.execute(
                        update(ApplicationSession).values(
                            last_activity_at=func.statement_timestamp()
                            - SESSION_LIFETIME
                        )
                    )
        return caller

    monkeypatch.setattr(authentication, "_authenticate", authenticate_then_invalidate)

    async def exercise() -> None:
        nonlocal armed
        app = main.create_app()
        async with (
            app.router.lifespan_context(app),
            httpx2.AsyncClient(
                headers=mcp_headers,
                transport=httpx2.ASGITransport(app=app),
                base_url="http://localhost",
            ) as http,
            Client(
                streamable_http_client("http://localhost/mcp/", http_client=http),
                mode=mode,
            ) as client,
        ):
            assert len((await client.list_tools()).tools) == 8
            armed = True
            with pytest.raises(MCPError, match="Authentication required") as failure:
                await client.call_tool(
                    "create_foodstuff",
                    {"foodstuff": {"name": "Forbidden", "unit": "G"}},
                )
            assert failure.value.code == -32001

    asyncio.run(exercise())
    assert checks >= 2
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(Foodstuff)) == 0


def test_authentication_database_failure_is_closed_and_sanitized(
    mcp_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unavailable(request: Request) -> MCPCaller | None:
        raise SQLAlchemyError("private credentials and database details")

    monkeypatch.setattr(authentication, "_authenticate", unavailable)

    async def exercise() -> None:
        app = main.create_app()
        async with (
            app.router.lifespan_context(app),
            httpx2.AsyncClient(
                headers=mcp_headers,
                transport=httpx2.ASGITransport(app=app),
                base_url="http://localhost",
            ) as http,
        ):
            response = await http.post("/mcp/", headers=RPC_HEADERS, json=CREATE)
            assert response.status_code == 503
            assert response.json() == {"detail": "Authentication service unavailable."}

    asyncio.run(exercise())


def test_concurrent_callers_are_isolated_and_authentication_never_renews_sessions(
    mcp_headers: dict[str, str],
    provider_user: Callable[[str], UserOut],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    second_user = provider_user("Second MCP user")
    mcp_headers["X-Application-User"] = f"kochwiki:{second_user.id}"
    with SessionLocal.begin() as session:
        secret, _ = establish_session(session, second_user.id, None)
        session.flush()
        issued = issue_delegation_token(session, secret, lifetime=timedelta(minutes=5))
        assert issued is not None
        session.execute(
            update(ApplicationSession).values(
                last_activity_at=func.statement_timestamp() - timedelta(days=29)
            )
        )
    with SessionLocal() as session:
        before = dict(
            session.execute(
                select(ApplicationSession.id, ApplicationSession.last_activity_at)
            ).all()
        )
        first_user = session.scalar(select(User.id).where(User.id != second_user.id))

    async def exercise() -> None:
        entered = 0
        ready = asyncio.Event()

        def server_with_probes(services: MCPServices) -> tuple[MCPServer, Starlette]:
            server, app = create_mcp_server(services)

            @server.tool()
            async def caller_probe() -> dict[str, int]:
                nonlocal entered
                before_id = current_caller().user_id
                entered += 1
                if entered == 2:
                    ready.set()
                await asyncio.wait_for(ready.wait(), timeout=5)
                return {"before": before_id, "after": current_caller().user_id}

            @server.tool()
            def sync_caller() -> dict[str, int]:
                return {"user_id": current_caller().user_id}

            @server.tool()
            def failing_caller() -> int:
                current_caller()
                raise ValueError("Probe failure")

            return server, app

        monkeypatch.setattr(main, "create_mcp_server", server_with_probes)
        app = main.create_app()

        async def run(headers: dict[str, str], user_id: int) -> None:
            async with (
                httpx2.AsyncClient(
                    headers=headers, transport=httpx2.ASGITransport(app=app)
                ) as http,
                Client(
                    streamable_http_client("http://localhost/mcp/", http_client=http)
                ) as client,
            ):
                result = await client.call_tool("caller_probe", {})
                assert result.structured_content == {
                    "before": user_id,
                    "after": user_id,
                }
                assert (await client.call_tool("failing_caller", {})).is_error
                result = await client.call_tool("sync_caller", {})
                assert not result.is_error
                assert result.structured_content == {"user_id": user_id}
            with pytest.raises(MCPError, match="Authentication required"):
                current_caller()

        assert isinstance(first_user, int)
        async with app.router.lifespan_context(app):
            await asyncio.gather(
                run(mcp_headers, first_user),
                run({"Authorization": f"Bearer {issued.secret}"}, second_user.id),
            )

    asyncio.run(exercise())
    with SessionLocal() as session:
        after = dict(
            session.execute(
                select(ApplicationSession.id, ApplicationSession.last_activity_at)
            ).all()
        )
        assert before == after
    with pytest.raises(MCPError, match="Authentication required"):
        current_caller()
