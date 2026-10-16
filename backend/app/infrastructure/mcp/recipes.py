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

        Results include complete active versions and drafts with per-serving
        nutrition; historical versions are excluded.
        Multiple versions of one recipe may appear. Only versions with current
        embeddings can be returned. This operation is read-only.
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

        Returns the lineage ID and all related active, draft and historical
        versions as complete objects, including the supplied
        version, ordered by last modification time descending and version ID
        descending for ties. Results are not filtered or truncated and include
        ingredients, steps and per-serving nutrition. Unsaved proposals are
        excluded. An unknown or deleted version produces an error.
        This operation is read-only and requires no embedding credentials.
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
        """Register a complete candidate recipe in memory.

        Ingredients reference catalogue IDs or contain inline temporary definitions.
        baseProposalId references a stored proposal; sourceRecipeVersionId must
        match that proposal's source version and recipe supplies the complete
        candidate. Returns the stored input with a new proposal ID and creation
        time. Proposals are lost on backend
        restart. No database records are written.
        """
        with tool_errors("Recipe proposal", "creation"), SessionLocal() as session:
            return services.recipe_proposals.create(session, proposal)

    @server.tool(
        annotations=ToolAnnotations(
            read_only_hint=True,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=False,
        )
    )
    def get_recipe_proposal(proposal_id: UUID) -> RecipeProposalDetailsOut:
        """Retrieve a stored proposal and its resolved presentation by proposal ID.

        The proposal contains the original input and stored identifiers.
        The presentation enriches existing foodstuffs from the current catalogue,
        includes inline temporary foodstuffs and calculates per-serving nutrition.
        Missing referenced foodstuffs cause an error. This operation is read-only.
        """
        with tool_errors("Recipe proposal", "retrieval"), SessionLocal() as session:
            return RecipeProposalDetailsOut(
                proposal=services.recipe_proposals.get(proposal_id),
                presentation=resolve_recipe_proposal_presentation(
                    session, services.recipe_proposals, proposal_id
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
        """Save a stored proposal as a draft and create its temporary foodstuffs.

        All creations commit atomically or roll back together. The draft preserves
        the source recipe's lineage. Repeated saves return the same created
        version in its current state; a deleted saved version is an error and is
        never recreated. Returns the complete saved recipe version with
        per-serving nutrition.
        """
        with tool_errors("Recipe proposal", "saving"):
            return save_proposal(SessionLocal, services.recipe_proposals, proposal_id)
