import re
from contextvars import ContextVar
from urllib.parse import unquote

from mcp.server.context import CallNext, HandlerResult, ServerRequestContext
from mcp.shared.exceptions import MCPError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from starlette.requests import Request

from app.identity.models.user import User
from app.infrastructure.database.session import SessionLocal
from app.infrastructure.mcp.authentication import MCPCaller


_assertions: ContextVar[tuple[str, ...]] = ContextVar("mcp_identity_assertions", default=())
_encoded_component = re.compile(r"(?:[A-Za-z0-9_.!~*'()-]|%[0-9A-Fa-f]{2})+")


def current_caller() -> MCPCaller:
    assertions = _assertions.get()
    if len(assertions) != 1:
        raise MCPError(-32001, "Caller identity required.")
    parts = assertions[0].split(":")
    if len(parts) != 2 or not all(_encoded_component.fullmatch(part) for part in parts):
        raise MCPError(-32001, "Caller identity required.")
    try:
        issuer, subject = (unquote(part, errors="strict") for part in parts)
    except UnicodeDecodeError:
        raise MCPError(-32001, "Caller identity required.") from None
    try:
        with SessionLocal() as session:
            user_id = session.scalar(select(User.id).where(User.issuer == issuer, User.subject == subject))
    except SQLAlchemyError:
        raise MCPError(-32603, "Caller identity service unavailable.") from None
    if user_id is None:
        raise MCPError(-32001, "Caller identity required.")
    return MCPCaller(user_id=user_id)


async def capture_identity(
    ctx: ServerRequestContext[object, object], call_next: CallNext,
) -> HandlerResult:
    assertions = tuple(ctx.request.headers.getlist("x-application-user")) if isinstance(ctx.request, Request) else ()
    token = _assertions.set(assertions)
    try:
        return await call_next(ctx)
    finally:
        _assertions.reset(token)
