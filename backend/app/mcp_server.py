import logging
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated
from uuid import UUID

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.applications import Starlette

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.mcp_instructions import KOCHWIKI_INSTRUCTIONS
from app.services import foodstuffs, greeting
from app.schemas.foodstuff import FoodstuffCreate, FoodstuffOut, FoodstuffSummaryOut, FoodstuffUpdate
from app.schemas.recipe import RecipeVersionOut
from app.schemas.recipe_proposal import RecipeProposalCreate, RecipeProposalDetailsOut, RecipeProposalOut
from app.services.recipe_proposal_presentations import resolve_recipe_proposal_presentation
from app.services.recipe_proposal_saves import save_recipe_proposal as save_proposal
from app.services.recipe_proposals import RecipeProposalStore
from app.services.foodstuff_search import FoodstuffSemanticSearch
from app.services.recipe_search import RecipeSemanticSearch
from app.services.embeddings import QueryEmbeddingError, SemanticSearchUnavailable
from app.services.exceptions import DomainError

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


@contextmanager
def foodstuff_write_transaction(operation: str) -> Iterator[Session]:
    with tool_errors("Foodstuff", operation):
        with SessionLocal.begin() as session:
            yield session


def hello_world() -> dict[str, str]:
    """Return the Kochwiki hello-world greeting."""
    return greeting.hello_world()


class MCPServices:
    def __init__(self, recipe_proposals: RecipeProposalStore) -> None:
        self.recipe_proposals = recipe_proposals
        self._foodstuff_search: FoodstuffSemanticSearch | None = None
        self._recipe_search: RecipeSemanticSearch | None = None

    def bind_foodstuff_search(self, search: FoodstuffSemanticSearch | None) -> None:
        self._foodstuff_search = search

    def get_foodstuff_search(self) -> FoodstuffSemanticSearch:
        if self._foodstuff_search is None:
            raise SemanticSearchUnavailable("Semantic search unavailable: backend is not running")
        return self._foodstuff_search

    def bind_recipe_search(self, search: RecipeSemanticSearch | None) -> None:
        self._recipe_search = search

    def get_recipe_search(self) -> RecipeSemanticSearch:
        if self._recipe_search is None:
            raise SemanticSearchUnavailable("Semantic search unavailable: backend is not running")
        return self._recipe_search


def create_mcp_server(
    services: MCPServices,
) -> tuple[MCPServer, Starlette]:
    settings = get_settings()
    server = MCPServer(
        "Kochwiki", version=settings.app_version, instructions=KOCHWIKI_INSTRUCTIONS,
    )
    server.tool()(hello_world)

    @server.tool()
    def search_foodstuffs(
        query: Annotated[str, Field(min_length=1, description="Foodstuff name or alias to search for")],
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

    @server.tool()
    def search_recipes(
        query: Annotated[str, Field(min_length=1, description="Recipe name to search for")],
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

    @server.tool(annotations=ToolAnnotations(
        read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False,
    ))
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

    @server.tool(annotations=ToolAnnotations(
        read_only_hint=False, destructive_hint=True, idempotent_hint=True, open_world_hint=False,
    ))
    def update_foodstuff(
        foodstuff_id: Annotated[int, Field(strict=True, ge=1, description="ID of the catalogue foodstuff to update")],
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

    @server.tool(annotations=ToolAnnotations(
        read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False,
    ))
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

    @server.tool(annotations=ToolAnnotations(
        read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False,
    ))
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
                presentation=resolve_recipe_proposal_presentation(session, services.recipe_proposals, proposal_id),
            )

    @server.tool(annotations=ToolAnnotations(
        read_only_hint=False, destructive_hint=False, idempotent_hint=True, open_world_hint=False,
    ))
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

    mcp_app = server.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            allowed_hosts=settings.mcp_allowed_host_list,
        ),
    )
    return server, mcp_app
