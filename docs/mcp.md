# MCP integration

Kochwiki hosts the official Python MCP SDK `2.2.0` inside its FastAPI backend.
`hello_world` takes no arguments, returning
`{"message": "Hello World"}` as structured content. It and the existing HTTP
`GET /` endpoint call `app/services/greeting.py` directly.

## Domain instructions

Kochwiki provides domain guidance as MCP server instructions in connection
metadata (`instructions` in the initialization response, also available through
SDK discovery). The text lives in `backend/app/mcp_instructions.py`; it is not
a separate tool, prompt or resource. An SDK client can read `client.instructions`
after connecting. The consuming service must include it in the agent's context;
delivery through MCP alone does not cause a model to follow it.

The guidance covers supplied recipe/foodstuff snapshots, additional searches,
candidate interpretation and natural-language clarification. Clear matches need
no extra confirmation. Retrieved references should be discussed or displayed
selectively when the host supports that presentation. Retrieved recipes are
distinct from proposals. Dedicated foodstuff creation requires an explicit user
request; missing ingredients in recipe proposals remain separate. Empty results
and retrieval failures must not be treated as proof that an item is absent.

This establishes Kochwiki's ownership of domain guidance. The existing recipe
instructions in AI Service remain in use until a later migration consumes MCP
instructions and replaces the existing domain capabilities. Generic conversation,
tool execution and artifact delivery guidance remains the consuming service's
responsibility. Proposal tools and artifact integration are outside this slice.

## Foodstuff search

`search_foodstuffs` accepts a foodstuff name or alias in `query`, and an optional
integer `limit` (default 5, range 1–20). It calls the shared semantic search
service directly and returns ranked `FoodstuffSummaryOut` objects, including IDs,
names, brands, units and nutrition values. Similarity scores stay internal.
The SDK wraps the list in structured content as `{"result": [...]}`; an empty
eligible catalogue returns `{"result": []}` successfully.

Search is a prefilter for the agent, not an identity decision. The agent uses
the summaries and conversation to select an item or clarify ambiguity. Only
records with current embeddings are eligible. Configure `OPENAI_API_KEY` and
populate embeddings before use; see [semantic search setup](foodstuff-semantic-search.md).
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

Instructions require searching for duplicates first and warning/clarifying
plausible matches. This is agent guidance, not enforced duplicate detection;
search covers only current embeddings. If any nutrition value is supplied,
including zero, the agent must ask for a missing user-provided unit. Otherwise
it may choose a suitable unit and mention that choice. Tool validation always
requires a unit, but cannot establish whether it came from the user.

This tool immediately persists a catalogue entry for a dedicated user request.
It does not create recipe proposals, temporary ingredients or recipe drafts.

## Recipe search

`search_recipes` accepts a recipe name in `query`, and an optional integer
`limit` (default 5, range 1–20). It calls the existing `RecipeSemanticSearch`
service and returns ranked, complete `RecipeVersionOut` objects in structured
content as `{"result": [...]}`. Results include version and lineage IDs, state,
ingredients with foodstuff summaries, steps and nutrition. Similarity scores
stay internal. Active versions and drafts with current name embeddings are
eligible; historical versions are excluded. Multiple versions of a lineage
can appear independently.

As with foodstuff search, results are candidates for the agent to assess in
conversation. Retrieval neither creates a proposal nor displays an artifact.
Blank queries, invalid limits, missing credentials and query embedding failures
produce tool errors; an empty eligible catalogue succeeds with an empty list.
The tool remains discoverable without credentials. Both search services share
the lifespan-owned embedding client and are unbound during shutdown.
See [recipe embedding setup and initial refresh](recipe-semantic-search.md).

## Endpoint and lifecycle

The Streamable HTTP endpoint is `/mcp/` on both the backend and gateway.
The gateway forwards this path directly to the backend and redirects `/mcp`
to `/mcp/` with HTTP 308, preserving the method. `/api/mcp/` is not exposed.
Keep the trailing slash in client URLs.
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
The client probe separately permits verification over a listening TCP server.

Artifacts, recipe writes, proposal behavior, separate instruction resources, and
AI Service integration remain outside this slice.
