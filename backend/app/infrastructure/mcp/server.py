from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette

from app.core import greeting
from app.core.config import get_settings
from app.infrastructure.mcp.foodstuffs import register_foodstuff_tools
from app.infrastructure.mcp.instructions import KOCHWIKI_INSTRUCTIONS
from app.infrastructure.mcp.recipes import register_recipe_tools
from app.infrastructure.mcp.services import MCPServices


def hello_world() -> dict[str, str]:
    """Return the Kochwiki hello-world greeting."""
    return greeting.hello_world()


def create_mcp_server(
    services: MCPServices,
) -> tuple[MCPServer, Starlette]:
    settings = get_settings()
    server = MCPServer(
        "Kochwiki",
        version=settings.app_version,
        instructions=KOCHWIKI_INSTRUCTIONS,
    )
    server.tool()(hello_world)

    register_foodstuff_tools(server, services)
    register_recipe_tools(server, services)

    mcp_app = server.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            allowed_hosts=settings.mcp_allowed_host_list,
        ),
    )
    return server, mcp_app
