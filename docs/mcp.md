# MCP integration

Kochwiki hosts the official Python MCP SDK `2.2.0` inside its FastAPI backend.
`hello_world` takes no arguments, returning
`{"message": "Hello World"}` as structured content. It and the existing HTTP
`GET /` endpoint call `app/services/greeting.py` directly.

## Domain instructions

Kochwiki provides domain guidance as MCP server instructions in connection
metadata (`instructions` in the initialization response, also available through
SDK discovery). The authoritative domain policy lives in
[`backend/app/mcp_instructions.py`](../backend/app/mcp_instructions.py), not in
this document or a separate tool, prompt or resource. An SDK client can read
`client.instructions` after connecting. The consuming service must include it in the agent's context;
delivery through MCP alone does not cause a model to follow it.

Kochwiki owns the domain guidance. The AI Service consumes these instructions
alongside discovered tools and supplies only generic conversation, tool execution
and artifact delivery guidance. The frontend advertises presentation capabilities
and their payload, header and metadata contracts; the AI Service provides the
generic local `present_artifact` tool. MCP results remain data and do not
automatically display artifacts. No Kochwiki recipe workflow instructions or
presentation schemas are defined in the AI Service.

Domain instructions guide agent behavior; they do not implement authorization
checks or enforce artifact delivery. This document describes integration,
contracts and operational limitations rather than restating those policies.

Instructions and tool definitions are discovered at AI Service startup. Restart
the AI Service after changing them; there is no live instruction refresh.

### Guidance responsibilities

- MCP instructions own domain workflows: when to search, clarify, create, refine,
  save and present results, and why a particular tool or artifact is appropriate.
  They own sequencing, duplicate checks, unit clarification, artifact selection,
  required result presentation and domain behavior such as hiding internal IDs.
- Each tool description and parameter schema describes only that operation:
  how to call it, accepted inputs, returned outputs, side effects and constraints.
  Descriptions must be self-contained. They must not prescribe overall behavior,
  workflow sequencing, when or why to call the tool, or comparisons and directions
  to other tools or artifacts.
- Each frontend artifact capability describes only its own display and how to
  supply its complete payload, headers and metadata. This includes nutritional
  basis, unknown-value representation and the meaning of any enabled actions.
  It must not prescribe when or why to display the artifact, retrieval or write
  workflows, overall behavior, or distinctions and directions to other artifacts.
- AI Service instructions own generic conversation and execution behavior.
  Its presentation tool describes its own invocation and validation contract;
  Kochwiki artifact selection policy remains in MCP instructions.

Keep each rule with its owner to avoid duplication and drift. MCP instructions
refer to advertised contracts rather than repeating payload fields, header rules
or metadata definitions. Tool and capability descriptions may state their own
consequences, such as read-only retrieval, values not being converted by a display,
or metadata enabling a save button. These are contract facts, not workflow policy.

For example, "Display calories and macronutrients with the supplied basis"
belongs in the nutrition capability. "Use the nutrition artifact for nutrition
questions" and comparisons with full item displays belong in MCP instructions.

## Foodstuff search

`search_foodstuffs` accepts a foodstuff name or alias in `query`, and an optional
integer `limit` (default 5, range 1–20). It calls the shared semantic search
service directly and returns ranked `FoodstuffSummaryOut` objects, including IDs,
names, brands, units and nutrition values. Similarity scores stay internal.
The SDK wraps the list in structured content as `{"result": [...]}`; an empty
eligible catalogue returns `{"result": []}` successfully.

Ranking is not an identity guarantee. Only records with current embeddings are
eligible. Configure `OPENAI_API_KEY` and populate embeddings before use;
see [semantic search setup](foodstuff-semantic-search.md).
Blank queries and invalid limits produce MCP tool errors. Missing credentials
report semantic search unavailable; query embedding failures report a tool
error rather than an empty list. The tool remains discoverable without a key.

The search service shares the application-owned embedding client with background
refresh work. The SDK executes the synchronous tool in a worker thread, keeping
database and cloud calls off the application's event loop.

## Foodstuff creation

`create_foodstuff` accepts a `foodstuff` object using the existing REST
`FoodstuffCreate` schema. Name and unit (`G`, `ML`, `PIECE`) are mandatory;
brand, kcal, carbs, protein and fat are optional. Nutrition values are per
100 g/ml or per piece. The result is a complete `FoodstuffOut` object directly
in structured content, including the assigned ID and empty `recipeVersionIds`.

The tool uses the same creation service as REST, inside its own database
transaction. It returns success only after commit and retains the post-commit
embedding refresh trigger. Validation errors and existing name/brand conflicts
produce tool errors; database failures roll back and return a generic error.
Creation works without OpenAI credentials; embedding refresh remains disabled
in that case. The tool is marked as a write and is not idempotent.

Tool validation requires a unit but cannot establish whether it came from the
user. Semantic search covers only current embeddings and is not an exhaustive
duplicate check; persistence rejects existing name/brand conflicts.

This tool immediately persists a catalogue entry.
It does not create recipe proposals, temporary ingredients or recipe drafts.

## Foodstuff updates

`update_foodstuff` accepts `foodstuff_id` (a positive integer) and `changes`
using the REST `FoodstuffUpdate` schema. Omitted fields remain unchanged;
explicit `null` clears brand or nutrition. Name and unit cannot be cleared.
The shared update service runs in a transaction and returns complete
`FoodstuffOut` structured content after commit, including recipe version IDs.
Missing targets, name/brand conflicts and invalid inputs produce tool errors.
Database failures roll back and return a generic error. The tool is marked as a
potentially destructive, idempotent write. Name/brand changes schedule embedding
refresh after commit; nutrition and unit changes alone do not.

Updates affect all recipes using the shared entry. Changing the unit while
retaining nutrition values changes their basis without converting those values;
the backend permits this change without checking user intent.

## Recipe search

`search_recipes` accepts a recipe name in `query`, and an optional integer
`limit` (default 5, range 1–20). It calls the existing `RecipeSemanticSearch`
service and returns ranked, complete `RecipeVersionOut` objects in structured
content as `{"result": [...]}`. Results include version and lineage IDs, state,
ingredients with foodstuff summaries, steps and nutrition. Similarity scores
stay internal. Active versions and drafts with current name embeddings are
eligible; historical versions are excluded. Multiple versions of a lineage
can appear independently.

Retrieval neither creates a proposal nor displays an artifact.
Blank queries, invalid limits, missing credentials and query embedding failures
produce tool errors; an empty eligible catalogue succeeds with an empty list.
The tool remains discoverable without credentials. Both search services share
the lifespan-owned embedding client and are unbound during shutdown.
See [recipe embedding setup and initial refresh](recipe-semantic-search.md).

## Recipe lineage retrieval

`get_recipe_lineage` accepts `recipe_version_id` (a UUID) and returns a
`RecipeLineageOut` object directly in structured content: `recipeLineageId` and
`versions`, a list of complete `RecipeVersionOut` objects. All active, draft and
historical versions in that lineage are included, including the supplied version.
Versions are ordered by `lastModified` descending, then version ID descending.
There is no filtering, limit or pagination. Unsaved proposals are excluded.

The tool queries the database through the shared recipe service and does not
depend on embeddings or OpenAI credentials. It is marked read-only and idempotent.
Unknown or deleted versions and invalid UUIDs produce tool errors; database
failures return a generic error. Retrieval does not write records or display
artifacts. Lineage membership does not encode parent-version relationships.

## Recipe proposals

`create_recipe_proposal` accepts a `proposal` object using `RecipeProposalCreate`:
`sourceRecipeVersionId`, optional `baseProposalId`, and a complete `recipe`.
Ingredients use either `{"kind": "existing", "foodstuffId": 123}` or
`{"kind": "temporary", "definition": {"name": "Beans", "unit": "G"}}`.
The result is `RecipeProposalOut`, including the new `proposalId` and creation
time. Registration validates references but writes no recipes or foodstuffs.
Refinement creates a new proposal with the base proposal's original source and
a complete replacement recipe, leaving the base unchanged.

`get_recipe_proposal` accepts `proposal_id` and returns `RecipeProposalDetailsOut`:
`proposal` preserves the stored input and identifiers; `presentation` resolves
current catalogue foodstuffs, retains temporary definitions and calculates
per-serving nutrition. Missing referenced foodstuffs cause a tool error. Neither
registration nor retrieval renders an artifact or saves a recipe.

`save_recipe_proposal` accepts `proposal_id` and returns the complete saved
`RecipeVersionOut`. It creates a draft in the source lineage and materializes
temporary foodstuffs in one transaction. Failed saves roll back together;
database errors return a generic tool error. Successful
commits retain the existing embedding refresh triggers.

Repeated saves return the same created version in its current state, even after
editing or publication. A deleted saved version is not recreated. Proposals and
save mappings live in application memory and are cleared on shutdown; saved
database records remain. This assumes a single process. Creation is marked as a
non-idempotent write, retrieval as read-only, and saving as an idempotent write.
These tools work without embedding credentials.

## Endpoint and lifecycle

The Streamable HTTP endpoint is `/mcp/` on both the backend and gateway.
The gateway forwards `/mcp/` directly to the backend and internally rewrites
`/mcp` to `/mcp/`, preserving the method and query. `/api/mcp/` is not exposed.
Both gateway paths work for clients that do not follow redirects.
For a backend on port 8080, connect to `http://localhost:8080/mcp/`.
Other containers on the same network can use `http://backend:8080/mcp/`.

The FastAPI lifespan runs the SDK session manager. `create_app()` allocates a
fresh MCP server and manager for each application instance; the SDK manager
cannot be restarted after shutdown. The existing Uvicorn entry point remains
`app.main:app`.

This slice uses stateless HTTP with JSON responses. Domain context will use
explicit references in later slices; it must not depend on transport sessions.
Streaming notifications and client callbacks are outside this slice.
MCP tool schemas are discovered through MCP, not FastAPI OpenAPI.

`MCP_ALLOWED_HOSTS` configures the SDK transport's Host allowlist as a
comma-separated list. Defaults allow loopback addresses and the Docker service
name `backend`, with optional ports. Add the actual gateway hostname when using
a different address. This setting does not grant authentication or domain
permissions. Browser-origin MCP connections are not enabled in this slice;
the intended consumer is a service-side client.
The local Compose configuration also allows `host.docker.internal` for clients
in other Docker projects connecting through the published gateway port.
Staging and production Compose forward `MCP_ALLOWED_HOSTS` when set; include
the hostname used in `KOCHWIKI_MCP_URL` along with the existing allowed hosts.

## Try it

Install the backend requirements and local contract package as described in the
repository README. From `backend`, start the existing application:

```powershell
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8080
```

In another terminal, from `backend`, run the official SDK client probe:

```powershell
.venv\Scripts\python.exe tests/verify_mcp.py http://localhost:8080/mcp/
```

The probe connects, checks that server instructions are present, discovers the
tools, invokes hello-world, and checks its structured result. It requires neither
an AI model nor database queries. Normal deployment
startup still runs the existing database migrations.

## Verification

### Manual check with MCP Inspector

With the current backend running in Compose, start Inspector from PowerShell:

```powershell
npx.cmd @modelcontextprotocol/inspector --server-url http://localhost:8000/mcp/ --transport http
```

Replace `8000` with the gateway port. Open the UI URL printed in the terminal,
connect, and select `hello_world` under **Tools**. Execute it without arguments;
the structured result should be `{"message": "Hello World"}`.

To exercise foodstuff search, select `search_foodstuffs` and enter, for example,
`{"query": "Moehre", "limit": 5}`. With configured credentials and populated
embeddings, verify that the ranked summaries contain no similarity scores.
Without credentials, expect a semantic-search-unavailable tool error.

To exercise recipe search, select `search_recipes` and enter, for example,
`{"query": "Spaghetti Bolognese", "limit": 5}`. Populate recipe embeddings first;
the result contains full recipe versions without similarity scores.

In an already open Inspector, add a **Streamable HTTP** server with that URL.
For a directly running backend, use `http://localhost:8080/mcp/` instead.
Keep the trailing slash. Inspector proxies the connection through its Node
backend, so no browser CORS configuration is needed in Kochwiki.

See the [official Inspector connection documentation](https://github.com/modelcontextprotocol/inspector/blob/main/docs/mcp-server-configuration.md).

To exercise creation, select `create_foodstuff` and submit
`{"foodstuff": {"name": "Inspector test ingredient", "unit": "G"}}`.
This writes a real catalogue entry. Use the regular foodstuff UI to delete the
test entry afterwards if desired.

To exercise updating, use that returned ID as `foodstuff_id`:
`{"foodstuff_id": 123, "changes": {"brand": "Inspector test", "protein": 0}}`.
Replace `123` with the actual ID. This changes the real catalogue entry and
returns its complete saved representation.

To exercise proposals in Inspector, select `create_recipe_proposal` and use an
actual source recipe version UUID and foodstuff ID:

```json
{
  "proposal": {
    "sourceRecipeVersionId": "REPLACE-WITH-SOURCE-UUID",
    "recipe": {
      "name": "Inspector proposal",
      "servings": 2,
      "ingredients": [
        {"index": 1, "amount": 50, "foodstuff": {"kind": "existing", "foodstuffId": 123}},
        {"index": 2, "amount": 100, "foodstuff": {"kind": "temporary", "definition": {"name": "Inspector beans", "unit": "G"}}}
      ],
      "steps": [{"index": 1, "description": "Cook and serve"}]
    }
  }
}
```

Use the returned ID in `{"proposal_id": "REPLACE-WITH-PROPOSAL-UUID"}` for
`get_recipe_proposal`, then `save_recipe_proposal`. Retrieval creates no database
records; saving writes a real draft and the temporary foodstuff. Saving again
returns the same version. To try refinement, submit the complete creation payload
again with `baseProposalId` set to the previous proposal ID.

### Automated checks

Run the backend regression suite with the existing test PostgreSQL available:

```powershell
.venv\Scripts\python.exe -m pytest tests -q
```

`tests/test_mcp.py` exercises the SDK client over Streamable HTTP through the
ASGI transport, application startup/shutdown across fresh instances, the
existing greeting/OpenAPI routes, and rejection of an unconfigured Host.
It verifies instruction delivery through both the default SDK connection mode
and the explicit initialization handshake.
It also verifies both search schemas, ranked summary/full-recipe serialization, limits,
invalid inputs, unavailable capability, provider failures, empty results, and
embedding-client cleanup using a fake provider and the test database; it makes
no paid OpenAI calls.
Creation checks cover the required name/unit contract (including omitted units
with zero nutrition values), saved output, persistence, post-commit refresh,
name/brand conflicts, invalid inputs and rollback without refresh on failure.
Update checks cover partial changes and explicit nulls, retained nutrition on
unit changes, recipe version references, identity-only refresh, missing targets,
conflicts, validation and rollback without refresh on database failure.
The client probe separately permits verification over a listening TCP server.

`tests/test_mcp_recipe_lineage.py` verifies lineage discovery and annotations,
complete recipe serialization across active, draft and historical versions,
retrieval from each state without embeddings, deterministic ordering, unbounded
coverage, isolation between lineages, read-only behavior, invalid/deleted/missing
versions and sanitized database failures through the real SDK transport.

`tests/test_mcp_recipe_proposals.py` covers discovery and annotations, proposal
creation and refinement, resolved retrieval without database writes, atomic saving,
repeat saves, deleted drafts, validation and missing dependencies, sanitized
database failures with rollback/retry, and isolation across application instances.
It uses the real test database and SDK transport without paid model calls.

The frontend save button uses `POST /recipe-proposals/{proposal_id}/save`, which
calls the same save service and uses the same in-memory proposal store as MCP.
Both paths share atomic ingredient/draft creation and repeated-save behavior.
`tests/test_recipe_proposal_http.py` verifies the HTTP path; the MCP workflow test
also verifies that HTTP returns the draft already saved through MCP.

Artifact presentation and metadata are supplied by the consumer frontend through
the AI Service presentation contract. They are not MCP output responsibilities.
