from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field
from sqlalchemy.orm import Session

from app.foodstuffs.schemas.foodstuff import (
    FoodstuffCreate,
    FoodstuffOut,
    FoodstuffSummaryOut,
    FoodstuffUpdate,
)
from app.foodstuffs.services import foodstuffs
from app.infrastructure.database.session import SessionLocal
from app.infrastructure.embeddings.embeddings import (
    QueryEmbeddingError,
    SemanticSearchUnavailable,
)
from app.infrastructure.mcp.errors import tool_errors
from app.infrastructure.mcp.services import MCPServices


@contextmanager
def foodstuff_write_transaction(operation: str) -> Iterator[Session]:
    with tool_errors("Foodstuff", operation):
        with SessionLocal.begin() as session:
            yield session


def register_foodstuff_tools(server: MCPServer, services: MCPServices) -> None:
    @server.tool()
    def search_foodstuffs(
        query: Annotated[
            str,
            Field(min_length=1, description="Foodstuff name or alias to search for"),
        ],
        limit: Annotated[int, Field(strict=True, ge=1, le=20)] = 5,
    ) -> list[FoodstuffSummaryOut]:
        """Find a bounded, ranked shortlist of existing foodstuffs by name or alias.

        Returns foodstuff summaries with IDs, names, brands, units and nutrition.
        Only foodstuffs with current embeddings can be returned.
        """
        try:
            candidates = services.get_foodstuff_search().search(query, limit)
        except (ValueError, SemanticSearchUnavailable, QueryEmbeddingError) as error:
            raise ToolError(str(error)) from None
        return [candidate.foodstuff for candidate in candidates]

    @server.tool(
        annotations=ToolAnnotations(
            read_only_hint=False,
            destructive_hint=False,
            idempotent_hint=False,
            open_world_hint=False,
        )
    )
    def create_foodstuff(foodstuff: FoodstuffCreate) -> FoodstuffOut:
        """Persist a new foodstuff in the shared catalogue.

        Name and unit are required. Nutrition values apply per 100 g for G,
        per 100 ml for ML, or per piece for PIECE. Returns the complete saved
        foodstuff with its assigned ID and recipe version references.
        """
        with foodstuff_write_transaction("creation") as session:
            created = foodstuffs.create_foodstuff(session, foodstuff)
            result = foodstuffs.foodstuff_out(created)
        return result

    @server.tool(
        annotations=ToolAnnotations(
            read_only_hint=False,
            destructive_hint=True,
            idempotent_hint=True,
            open_world_hint=False,
        )
    )
    def update_foodstuff(
        foodstuff_id: Annotated[
            int,
            Field(
                strict=True, ge=1, description="ID of the catalogue foodstuff to update"
            ),
        ],
        changes: FoodstuffUpdate,
    ) -> FoodstuffOut:
        """Update a shared catalogue entry, affecting all recipes using it.

        Omitted fields stay unchanged; null clears optional fields. Name and unit
        cannot be cleared. Unit changes do not convert retained nutrition values.
        Returns the complete saved foodstuff with its recipe version references.
        """
        with foodstuff_write_transaction("update") as session:
            updated = foodstuffs.update_foodstuff(session, foodstuff_id, changes)
            result = foodstuffs.foodstuff_out(updated)
        return result
