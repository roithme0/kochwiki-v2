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
from app.foodstuffs.schemas.nutrition_enrichment import (
    FoodstuffIdentity,
    NutritionFill,
    NutritionFillResult,
)
from app.infrastructure.database.session import SessionLocal
from app.infrastructure.embeddings.embeddings import (
    QueryEmbeddingError,
    SemanticSearchUnavailable,
)
from app.infrastructure.mcp.errors import tool_errors
from app.infrastructure.mcp.services import MCPServices
from app.infrastructure.mcp.asserted_identity import current_caller


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
        """Find a ranked shortlist in the caller's catalogue by name or alias.

        Returns foodstuff summaries with IDs, names, brands, units and nutrition.
        Only foodstuffs with current embeddings can be returned.
        """
        try:
            candidates = services.get_foodstuff_search(
                owner_id=current_caller().user_id
            ).search(query, limit)
        except (ValueError, SemanticSearchUnavailable, QueryEmbeddingError) as error:
            raise ToolError(str(error)) from None
        return [candidate.foodstuff for candidate in candidates]

    @server.tool(
        annotations=ToolAnnotations(
            read_only_hint=True,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=False,
        )
    )
    def get_foodstuff(
        foodstuff_id: Annotated[int, Field(strict=True, ge=1)],
    ) -> FoodstuffOut:
        """Retrieve a current foodstuff by ID, without requiring embeddings.

        Returns the complete foodstuff, including recipe version references.
        This operation is read-only and permits reading other users' entries.
        """
        with tool_errors("Foodstuff", "retrieval"):
            with SessionLocal() as session:
                return foodstuffs.foodstuff_out(
                    foodstuffs.get_foodstuff(session, foodstuff_id)
                )

    @server.tool(
        annotations=ToolAnnotations(
            read_only_hint=False,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=False,
        )
    )
    def fill_foodstuff_nutrition(
        foodstuff_id: Annotated[int, Field(strict=True, ge=1)],
        expected: FoodstuffIdentity,
        nutrition: NutritionFill,
    ) -> NutritionFillResult:
        """Fill only unknown nutrition in an owned catalogue foodstuff.

        Rejects mismatched expected name, brand or unit. Values apply per 100 g
        for G, per 100 ml for ML, or per piece for PIECE. Known values, including
        zero, are retained. Returns current data and applied/retained field names.
        Changes affect all referencing recipe versions.
        """
        with foodstuff_write_transaction("nutrition enrichment") as session:
            result = foodstuffs.fill_foodstuff_nutrition(
                session,
                foodstuff_id,
                expected,
                nutrition,
                owner_id=current_caller().user_id,
            )
        return result

    @server.tool(
        annotations=ToolAnnotations(
            read_only_hint=False,
            destructive_hint=False,
            idempotent_hint=False,
            open_world_hint=False,
        )
    )
    def create_foodstuff(foodstuff: FoodstuffCreate) -> FoodstuffOut:
        """Persist a new foodstuff in the caller's catalogue.

        Name and unit are required. Nutrition values apply per 100 g for G,
        per 100 ml for ML, or per piece for PIECE. Returns the complete saved
        foodstuff with its assigned ID and recipe version references.
        """
        with foodstuff_write_transaction("creation") as session:
            created = foodstuffs.create_foodstuff(
                session, foodstuff, owner_id=current_caller().user_id
            )
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
        """Update an owned catalogue entry, affecting all recipes using it.

        Supplied values may overwrite recorded data.
        Omitted fields stay unchanged; null clears optional fields. Name and unit
        cannot be cleared. Unit changes do not convert retained nutrition values.
        Returns the complete saved foodstuff with its recipe version references.
        """
        with foodstuff_write_transaction("update") as session:
            updated = foodstuffs.update_foodstuff(
                session, foodstuff_id, changes, owner_id=current_caller().user_id
            )
            result = foodstuffs.foodstuff_out(updated)
        return result
