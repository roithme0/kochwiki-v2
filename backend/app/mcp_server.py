from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette

from app.core.config import get_settings
from app.services import greeting


def hello_world() -> dict[str, str]:
    """Return the Kochwiki hello-world greeting."""
    return greeting.hello_world()


def create_mcp_server() -> tuple[MCPServer, Starlette]:
    settings = get_settings()
    server = MCPServer("Kochwiki", version=settings.app_version)
    server.tool()(hello_world)
    mcp_app = server.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            allowed_hosts=settings.mcp_allowed_host_list,
        ),
    )
    return server, mcp_app
