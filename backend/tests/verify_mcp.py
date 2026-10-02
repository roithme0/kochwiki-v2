import argparse
import asyncio

from mcp import Client


async def verify(url: str) -> None:
    async with Client(url) as client:
        if not client.instructions or not client.instructions.strip():
            raise RuntimeError("Expected Kochwiki domain instructions")
        tools = await client.list_tools()
        expected = {
            "hello_world", "search_foodstuffs", "search_recipes", "create_foodstuff",
            "update_foodstuff", "create_recipe_proposal", "get_recipe_proposal", "save_recipe_proposal",
        }
        if {tool.name for tool in tools.tools} != expected:
            raise RuntimeError("Unexpected Kochwiki tool discovery")
        result = await client.call_tool("hello_world", {})
        if result.is_error or result.structured_content != {"message": "Hello World"}:
            raise RuntimeError("Unexpected hello_world result")
        print("MCP connection, domain instructions, discovery, and hello_world invocation succeeded.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify Kochwiki's MCP integration")
    parser.add_argument("url", help="Streamable HTTP endpoint, including /mcp/")
    args = parser.parse_args()
    asyncio.run(verify(args.url))


if __name__ == "__main__":
    main()
