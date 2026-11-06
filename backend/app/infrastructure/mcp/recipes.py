from typing import Annotated
from uuid import UUID

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field

from app.infrastructure.database.session import SessionLocal
from app.infrastructure.embeddings.embeddings import (
    QueryEmbeddingError,
    SemanticSearchUnavailable,
)
from app.infrastructure.mcp.asserted_identity import current_caller
from app.infrastructure.mcp.errors import tool_errors
from app.infrastructure.mcp.services import MCPServices
from app.recipes.schemas.recipe import RecipeLineageOut, RecipeVersionOut
from app.recipes.schemas.proposal import (
    RecipeProposalCreate,
    RecipeProposalDetailsOut,
    RecipeProposalOut,
)
from app.recipes.services import recipes
from app.recipes.services.proposal_presentations import (
    resolve_recipe_proposal_presentation,
)
from app.recipes.services.proposal_saves import save_recipe_proposal as save_proposal


def register_recipe_tools(server: MCPServer, services: MCPServices) -> None:
    @server.tool()
    def search_recipes(
        query: Annotated[
            str, Field(min_length=1, description="Recipe name to search for")
        ],
        limit: Annotated[int, Field(strict=True, ge=1, le=20)] = 5,
    ) -> list[RecipeVersionOut]:
        """Find a bounded, ranked shortlist of existing recipes by name.

        Returns complete active versions and drafts with per-serving nutrition;
        excludes historical versions and versions without current embeddings.
        Multiple versions of one recipe may appear.
        """
        try:
            candidates = services.get_recipe_search().search(query, limit)
        except (ValueError, SemanticSearchUnavailable, QueryEmbeddingError) as error:
            raise ToolError(str(error)) from None
        return [candidate.recipe for candidate in candidates]

    @server.tool(
        annotations=ToolAnnotations(
            read_only_hint=True,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=False,
        )
    )
    def get_recipe_lineage(
        recipe_version_id: Annotated[
            UUID, Field(description="ID of a persisted recipe version in the lineage")
        ],
    ) -> RecipeLineageOut:
        """Retrieve the complete lineage containing the supplied recipe version.

        Returns all active, draft and historical versions with ingredients, steps
        and per-serving nutrition, ordered by modification time then version ID,
        both descending. Excludes unsaved proposals; unknown/deleted IDs error.
        Requires no embeddings.
        """
        with tool_errors("Recipe lineage", "retrieval"), SessionLocal() as session:
            return recipes.get_recipe_lineage(session, recipe_version_id)

    @server.tool(
        annotations=ToolAnnotations(
            read_only_hint=False,
            destructive_hint=False,
            idempotent_hint=False,
            open_world_hint=False,
        )
    )
    def create_recipe_proposal(proposal: RecipeProposalCreate) -> RecipeProposalOut:
        """Register a private candidate for a recipe owned by the caller.

        Accepts a complete candidate with catalogue or temporary ingredients.
        Refinements require baseProposalId and its matching sourceRecipeVersionId.
        Returns stored input with a new proposal ID and creation time, without
        resolved nutrition. Stored in memory until restart; no database writes.
        """
        with tool_errors("Recipe proposal", "creation"), SessionLocal() as session:
            return services.recipe_proposals.create(
                session, proposal, user_id=current_caller().user_id
            )

    @server.tool(
        annotations=ToolAnnotations(
            read_only_hint=True,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=False,
        )
    )
    def get_recipe_proposal(proposal_id: UUID) -> RecipeProposalDetailsOut:
        """Retrieve the caller's stored proposal and its resolved presentation.

        Returns original input plus ingredients resolved from the live catalogue
        or temporary definitions and backend-calculated per-serving nutrition.
        Missing catalogue references error.
        """
        with tool_errors("Recipe proposal", "retrieval"), SessionLocal() as session:
            return RecipeProposalDetailsOut(
                proposal=services.recipe_proposals.get(
                    proposal_id, user_id=current_caller().user_id
                ),
                presentation=resolve_recipe_proposal_presentation(
                    session,
                    services.recipe_proposals,
                    proposal_id,
                    user_id=current_caller().user_id,
                ),
            )

    @server.tool(
        annotations=ToolAnnotations(
            read_only_hint=False,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=False,
        )
    )
    def save_recipe_proposal(proposal_id: UUID) -> RecipeVersionOut:
        """Save the caller's proposal as a draft in their owned recipe lineage.

        Atomically creates the draft and any temporary catalogue foodstuffs.
        Repeated saves return the same draft in its current state; a deleted saved
        version errors. Returns the complete saved version with per-serving nutrition.
        """
        with tool_errors("Recipe proposal", "saving"):
            return save_proposal(
                SessionLocal,
                services.recipe_proposals,
                proposal_id,
                user_id=current_caller().user_id,
            )
