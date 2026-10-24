import argparse
import asyncio
import os

import httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client


async def verify(url: str) -> None:
    secret = os.environ.get("MCP_VERIFY_TOKEN")
    if not secret:
        raise RuntimeError("Set MCP_VERIFY_TOKEN to a valid delegation token")
    async with httpx2.AsyncClient(headers={"Authorization": f"Bearer {secret}"}) as http, Client(
        streamable_http_client(url, http_client=http)
    ) as client:
        if not client.instructions or not client.instructions.strip():
            raise RuntimeError("Expected Kochwiki domain instructions")
        tools = await client.list_tools()
        expected = {
            "search_foodstuffs", "search_recipes", "get_recipe_lineage", "create_foodstuff",
            "update_foodstuff", "create_recipe_proposal", "get_recipe_proposal", "save_recipe_proposal",
        }
        if {tool.name for tool in tools.tools} != expected:
            raise RuntimeError("Unexpected Kochwiki tool discovery")
        print("Authenticated MCP connection, domain instructions, and discovery succeeded.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify Kochwiki's MCP integration")
    parser.add_argument("url", help="Streamable HTTP endpoint, including /mcp/")
    args = parser.parse_args()
    asyncio.run(verify(args.url))


if __name__ == "__main__":
    main()
