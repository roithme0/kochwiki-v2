import asyncio
import re
from typing import Literal

import httpx2
import pytest

from mcp import Client
from mcp.server import MCPServer
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.exceptions import MCPError
from mcp.types import TextResourceContents

from app.main import create_app
from app.infrastructure.mcp.instructions import KOCHWIKI_INSTRUCTIONS
from app.infrastructure.mcp.resources import register_workflow_resources


def test_static_workflow_resources_are_discoverable_and_readable() -> None:
    async def exercise() -> None:
        server = MCPServer("test")
        register_workflow_resources(server)
        async with Client(server) as client:
            resources = (await client.list_resources()).resources
            assert len(resources) == 8
            resource_uris = {str(resource.uri) for resource in resources}
            assert len(resource_uris) == 8
            instruction_uris = set(
                re.findall(r"kochwiki://[\w/-]+", KOCHWIKI_INSTRUCTIONS)
            )
            assert instruction_uris == resource_uris
            assert all(resource.name and resource.description for resource in resources)
            for resource in resources:
                first = await client.read_resource(str(resource.uri))
                second = await client.read_resource(
                    str(resource.uri), cache_mode="refresh"
                )
                assert first == second
                content = first.contents[0]
                assert isinstance(content, TextResourceContents)
                assert content.text.strip()
                linked_uris = set(re.findall(r"kochwiki://[\w/-]+", content.text))
                assert linked_uris <= resource_uris, linked_uris - resource_uris
            assert not (await client.list_resource_templates()).resource_templates
            assert not (await client.list_prompts()).prompts

    asyncio.run(exercise())


@pytest.mark.parametrize("mode", ["auto", "legacy"])
def test_workflow_resources_over_http_across_lifecycles(
    mode: Literal["auto", "legacy"],
) -> None:
    async def exercise() -> dict[str, str]:
        app = create_app()
        async with app.router.lifespan_context(app):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app),
                base_url="http://localhost",
            ) as http:
                async with Client(
                    streamable_http_client("http://localhost/mcp/", http_client=http),
                    mode=mode,
                ) as client:
                    resources = (await client.list_resources()).resources
                    assert len(resources) == 8
                    contents: dict[str, str] = {}
                    for resource in resources:
                        uri = str(resource.uri)
                        result = await client.read_resource(uri)
                        assert len(result.contents) == 1
                        content = result.contents[0]
                        assert isinstance(content, TextResourceContents)
                        assert content.text.strip()
                        contents[uri] = content.text
                    assert set(contents) == {
                        "kochwiki://reference/presentation",
                        "kochwiki://reference/nutrition",
                        "kochwiki://workflows/foodstuff-creation",
                        "kochwiki://workflows/foodstuff-updates",
                        "kochwiki://workflows/nutrition-research",
                        "kochwiki://reference/foodstuff-units",
                        "kochwiki://reference/foodstuff-naming",
                        "kochwiki://workflows/recipe-updates",
                    }
                    with pytest.raises(MCPError):
                        await client.read_resource("kochwiki://unknown/resource")
                    assert not (
                        await client.list_resource_templates()
                    ).resource_templates
                    assert not (await client.list_prompts()).prompts
                    assert len((await client.list_tools()).tools) == 10
                    return contents

    assert asyncio.run(exercise()) == asyncio.run(exercise())


def test_representative_workflow_policy_contracts() -> None:
    async def exercise() -> dict[str, str]:
        server = MCPServer("test")
        register_workflow_resources(server)
        async with Client(server) as client:
            result: dict[str, str] = {}
            for resource in (await client.list_resources()).resources:
                content = (await client.read_resource(str(resource.uri))).contents[0]
                assert isinstance(content, TextResourceContents)
                result[resource.name] = " ".join(content.text.lower().split())
            return result

    def normalized(text: str) -> str:
        return " ".join(re.sub(r"[^\w]+", " ", text.lower()).split())

    raw_content = asyncio.run(exercise())
    content = {name: normalized(value) for name, value in raw_content.items()}
    creation = content["Foodstuff creation"]
    assert normalized("explicit creation request") in creation
    assert normalized("every plausible duplicate, even a clear match") in creation
    assert (
        normalized(
            "always follow kochwiki://workflows/nutrition-research before creation"
        )
        in creation
    )
    assert normalized("unknowns") in creation

    updates = content["Foodstuff updates"]
    assert normalized("preserving known values including zero") in updates
    assert (
        normalized(
            "nutrition-only edits need target identification, not another duplicate search"
        )
        in updates
    )
    assert normalized("consult before any meaning change") in updates
    assert normalized("do not relabel numbers") in updates

    research = content["Nutrition research"]
    assert normalized("without catalogue writes") in research
    assert normalized("material discrepancies block merging") in research
    assert normalized("fallback supplies fiber only") in research
    assert (
        normalized("preserve recorded values pending explicit replacement") in research
    )

    units = content["Foodstuff units"]
    assert normalized("being countable alone does not justify piece") in units
    assert (
        "per_piece = per_100_g * piece_weight_g / 100" in raw_content["Foodstuff units"]
    )
    assert normalized("do not assume mass equals volume") in units

    recipe = content["Recipe updates"]
    assert normalized("caller-owned source lineage") in recipe
    assert (
        normalized(
            "save only the explicitly identified proposal on explicit save intent"
        )
        in recipe
    )
    assert (
        normalized(
            "taste-only updates do not require nutrition research, including for new temporary ingredients"
        )
        in recipe
    )
    assert (
        normalized("backend-calculated proposal nutrition from get_recipe_proposal")
        in recipe
    )

    shared = normalized(KOCHWIKI_INSTRUCTIONS)
    assert (
        normalized("reading instructions or research does not authorize writes")
        in shared
    )
    assert normalized("before starting an applicable task, read and follow") in shared
    assert (
        normalized(
            "apply all relevant resources, including applicable linked references and workflows"
        )
        in shared
    )
    assert "kochwiki://reference/presentation" in KOCHWIKI_INSTRUCTIONS
    presentation = content["Presentation"]
    assert (
        normalized("never a successful write merely to repair display") in presentation
    )
    assert normalized("never invent IDs or expose internal IDs") in presentation
    assert normalized("relay ingredient imageId unchanged, or null") in presentation
    assert (
        normalized("as full kochwiki-recipe/kochwiki-foodstuff source artifacts")
        in presentation
    )
    assert normalized("exactly once as a final result artifact") in presentation
    assert normalized("use the final saved state") in presentation
    assert normalized("only stored proposals may enable saving") in presentation
    assert (
        normalized("text and Markdown tables do not replace artifacts") in presentation
    )
    assert normalized("preserve source facts and unknowns") in shared
    assert "kochwiki://reference/nutrition" in KOCHWIKI_INSTRUCTIONS
    assert "kochwiki://reference/nutrition" in raw_content["Recipe updates"]
    assert normalized("only in the nutrition artifact") in presentation
    assert normalized("full recipe artifacts retain per-serving values") in presentation
    assert normalized("including zero, as exact") in presentation
    assert normalized("missing values as unknown/null") in presentation
    assert "kochwiki://reference/nutrition" in raw_content["Presentation"]
    nutrition = content["Nutrition"]
    assert (
        normalized("do not independently calculate replacement recipe totals")
        in nutrition
    )
    assert normalized("accepting gaps does not authorize guessing") in nutrition
    assert normalized("minimum (a lower bound), or unknown") in nutrition
    assert normalized("preserve the foodstuff's catalogue basis") in nutrition
    assert normalized("multiply known per-serving values by servings") in nutrition
    assert normalized("preserve statuses when scaling") in nutrition
    assert (
        normalized("nutrient completeness is independent, including fiber") in nutrition
    )
    assert normalized("never infer one nutrient from another") in nutrition
    assert (
        normalized(
            "do not claim exact improvements, rankings or satisfied upper targets"
        )
        in nutrition
    )
    assert normalized("only if its bound meets the target") in nutrition
