from typing import Annotated

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import Field
from starlette.applications import Starlette

from app.core.config import get_settings
from app.mcp_instructions import KOCHWIKI_INSTRUCTIONS
from app.services import greeting
from app.schemas.foodstuff import FoodstuffSummaryOut
from app.schemas.recipe import RecipeVersionOut
from app.services.foodstuff_search import FoodstuffSemanticSearch
from app.services.recipe_search import RecipeSemanticSearch
from app.services.embeddings import QueryEmbeddingError, SemanticSearchUnavailable


def hello_world() -> dict[str, str]:
    """Return the Kochwiki hello-world greeting."""
    return greeting.hello_world()


class MCPServices:
    def __init__(self) -> None:
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

        Search is a prefilter, not an identity decision. Use the returned summaries
        and conversation to choose a suitable foodstuff; clarify ambiguous matches
        with the user. Only foodstuffs with current embeddings can be returned.
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

        Results include complete active versions and drafts; historical versions
        are excluded. Search is a prefilter, not an identity decision. Use the
        returned recipes and conversation to assess matches and clarify ambiguity.
        Multiple versions of one recipe may appear. Only versions with current
        embeddings can be returned. Retrieval does not create or save a proposal.
        """
        try:
            candidates = services.get_recipe_search().search(query, limit)
        except (ValueError, SemanticSearchUnavailable, QueryEmbeddingError) as error:
            raise ToolError(str(error)) from None
        return [candidate.recipe for candidate in candidates]

    mcp_app = server.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            allowed_hosts=settings.mcp_allowed_host_list,
        ),
    )
    return server, mcp_app
