from contextvars import ContextVar
from dataclasses import dataclass

from mcp.server.context import CallNext, HandlerResult, ServerRequestContext
from mcp.shared.exceptions import MCPError
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.identity.services.delegation import MCP_AUDIENCE, delegated_user
from app.infrastructure.database.session import SessionLocal


@dataclass(frozen=True)
class MCPCaller:
    user_id: int


_caller: ContextVar[MCPCaller | None] = ContextVar("mcp_caller", default=None)


def current_caller() -> MCPCaller:
    caller = _caller.get()
    if caller is None:
        raise MCPError(-32001, "Authentication required.")
    return caller


def _authenticate(request: Request) -> MCPCaller | None:
    credentials = request.headers.getlist("authorization")
    if len(credentials) != 1:
        return None
    parts = credentials[0].split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    with SessionLocal() as session:
        user = delegated_user(session, parts[1], audience=MCP_AUDIENCE)
        return MCPCaller(user_id=user.id) if user is not None else None


class MCPAuthenticationMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        try:
            caller = await run_in_threadpool(_authenticate, Request(scope))
        except SQLAlchemyError:
            response = JSONResponse(
                {"detail": "Authentication service unavailable."},
                status_code=503,
                headers={"Cache-Control": "no-store"},
            )
            await response(scope, receive, send)
            return
        if caller is None:
            response = JSONResponse(
                {"detail": "Authentication required."},
                status_code=401,
                headers={
                    "Cache-Control": "no-store",
                    "WWW-Authenticate": f'Bearer realm="{MCP_AUDIENCE}"',
                },
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


async def authenticate_message(
    ctx: ServerRequestContext[object, object],
    call_next: CallNext,
) -> HandlerResult:
    if not isinstance(ctx.request, Request):
        raise MCPError(-32001, "Authentication required.")
    try:
        caller = await run_in_threadpool(_authenticate, ctx.request)
    except SQLAlchemyError:
        raise MCPError(-32603, "Authentication service unavailable.") from None
    if caller is None:
        raise MCPError(-32001, "Authentication required.")
    token = _caller.set(caller)
    try:
        return await call_next(ctx)
    finally:
        _caller.reset(token)
