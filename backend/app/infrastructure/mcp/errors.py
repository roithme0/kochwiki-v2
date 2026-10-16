import logging
from collections.abc import Iterator
from contextlib import contextmanager

from mcp.server.mcpserver.exceptions import ToolError
from sqlalchemy.exc import SQLAlchemyError

from app.core.exceptions import DomainError

logger = logging.getLogger(__name__)


@contextmanager
def tool_errors(subject: str, operation: str) -> Iterator[None]:
    try:
        yield
    except DomainError as error:
        raise ToolError(error.message) from None
    except SQLAlchemyError as error:
        logger.error("MCP %s %s failed (%s)", subject, operation, type(error).__name__)
        raise ToolError(f"{subject} {operation} failed") from None
