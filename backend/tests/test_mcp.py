import asyncio

import httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from app.main import create_app


def test_mcp_http_discovery_invocation_and_lifecycle() -> None:
    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app), base_url="http://localhost"
            ) as http:
                assert (await http.get("/")).json() == {"message": "Hello World"}
                assert (await http.get("/api/openapi.json")).status_code == 200
                async with Client(
                    streamable_http_client("http://localhost/mcp/", http_client=http)
                ) as client:
                    tools = await client.list_tools()
                    assert [tool.name for tool in tools.tools] == ["hello_world"]
                    result = await client.call_tool("hello_world", {})
                    assert not result.is_error
                    assert result.structured_content == {"message": "Hello World"}

    asyncio.run(exercise())
    asyncio.run(exercise())


def test_mcp_rejects_unconfigured_host() -> None:
    async def exercise() -> None:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app)) as http:
                response = await http.post(
                    "http://unconfigured.example/mcp/",
                    headers={"Accept": "application/json, text/event-stream"},
                    json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                )
                assert response.status_code == 421

    asyncio.run(exercise())
