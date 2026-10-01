# Kochwiki Recipe Workflow through MCP

## Status

Initial outline. Kochwiki's MCP capabilities form the first implementation block. Individual slices will be specified before implementation; the slice boundaries below are provisional.

Keep this document as the overview of the block. As slices are specified and delivered, add their agreed contracts, decisions, implementation references, and verified behavior. Detailed slice specifications and delivery plans remain separate; speculative implementation detail does not belong here.

## Goal

Prepare the Kochwiki-owned capabilities needed for an agent to discover ingredients and reference recipes, prepare reviewable proposals, and explicitly create drafts or foodstuffs.

This builds the workflow foundation for future recipe improvements. Improving suggestion quality is not an immediate acceptance criterion. Migrating AI Service to consume these capabilities is a later block.

## Agreed Boundaries

- Kochwiki owns domain tools, instructions, proposal validation and storage, preview calculation, and persistence. Expose these capabilities through MCP and reuse domain services.
- AI Service will retain generic conversations, model execution, MCP integration, and artifact delivery. The later migration should remove its Kochwiki domain implementation. Future domain skills belong to Kochwiki; skill support follows later.
- Initial context contains the selected recipe and its used foodstuffs. Additional foodstuffs and optional reference recipes use semantic search and authoritative retrieval. Reference recipes do not change the editing target.
- Clarify ambiguity through natural language; clear matches may be chosen directly. Display retrieved items selectively. Advanced UI controls are deferred.
- A stored proposal is distinct from a display artifact. Redisplaying a proposal does not create a new proposal; reference artifacts do not affect proposal numbering or bases.
- Proposals may contain temporary foodstuff definitions without inserting catalogue records. Abandoning a proposal requires no user cleanup.
- Explicit saving includes creating required missing foodstuffs without separate confirmation. Create the dependencies and draft atomically; failure rolls back newly created dependencies and the draft.
- Standalone foodstuff creation requires an explicit request. Semantic similarity alone does not authorize reusing a catalogue item as an identical foodstuff.
- Preserve the current recipe conversation while its replacement is prepared. Detailed security hardening, publication/deletion tools, and changes to existing shared foodstuffs are outside this block.

## Capability Outline

Names describe capabilities, not final tool contracts.

| Capability | Intended outcome |
| --- | --- |
| Domain instructions | Kochwiki supplies guidance for using its workflow and tools. |
| Search/read foodstuffs | Bounded semantic discovery and authoritative ingredient details. |
| Search/read recipes | Optional semantic discovery and exact reference-recipe retrieval. |
| Source context | Bind proposals to the selected source and its snapshot without duplicating chat lifecycle. |
| Prepare/read proposals | Validate and retain complete proposals, including temporary definitions, and return previews and domain references. |
| Save proposal | Materialize the retained proposal as a draft with required dependencies in one transaction. |
| Create foodstuff | Fulfil explicit standalone creation requests. |

Results should support later selective presentation without requiring recipe-aware logic in AI Service. Writes need recoverable outcomes so retries after uncertainty do not accidentally duplicate records.

## Provisional Slices

Each slice should have a narrow specification and independently verifiable behavior. Split these boundaries further when needed.

1. **MCP integration:** use the official Python MCP SDK with Streamable HTTP inside the existing backend, and expose one deterministic hello-world tool sharing its service implementation with the existing HTTP hello-world endpoint. Verify client initialization, tool discovery, invocation, and linked server lifecycle. Explore the technology without domain instructions, foodstuff reads, database access, or AI Service changes.
2. **Foodstuff semantic search:** establish alias/name discovery through a shared backend service and operational commands, without MCP integration. Expose search and authoritative reads through MCP in a subsequent narrow slice; domain instructions remain separately scoped.
3. **Reference recipes:** add semantic discovery and detailed reference retrieval.
4. **Stored proposals:** establish source context, proposal identity/storage, and preparation/retrieval using existing foodstuffs.
5. **Temporary foodstuffs:** extend proposals and preview to unsaved ingredient definitions without catalogue writes.
6. **Atomic saving:** create drafts and required foodstuffs together, including conflict handling and write-outcome recovery.
7. **Standalone creation and handoff:** support explicit foodstuff creation and verify/document the interface needed by the later AI Service migration.

Domain and MCP behavior can be verified without migrating the existing chat or requiring a live model. The later migration must additionally verify conversational behavior and artifact rendering.

## Agreed Technical Decisions

- Use the official Python MCP SDK. Official project ownership is the deciding preference; the convenience of the separate FastMCP project does not outweigh that preference. Select the latest stable release when implementing and pin it for reproducibility. The latest stable release verified on 2026-10-01 is [v2.2.0](https://github.com/modelcontextprotocol/python-sdk/releases/tag/v2.2.0).
- Use Streamable HTTP for communication between the separately deployed Kochwiki and AI Service.
- Host MCP inside the existing FastAPI backend and link its startup/shutdown to the backend lifecycle.
- Related MCP tools and HTTP endpoints call shared service implementations directly. MCP does not call the local HTTP endpoint as an intermediary. Use the existing hello-world endpoint and the new tool as the first proof of this pattern, preserving the endpoint's current response.

## Decisions to Resolve in Relevant Slices

- Semantic retrieval approach, relevance examples, and index freshness.
- Source/bootstrap references and minimal domain context.
- Proposal retention, durability, expiry, and temporary-definition identity across refinements.
- Structured results and explicit selective-presentation convention for a generic consumer.
- Unknown-nutrition policy and exact foodstuff reuse/conflict rules.
- Write-operation identity, result recovery, and concurrent-call behavior.

## Implementation Record

### Slice 3 foundation: recipe semantic searchability

Embed recipe version names only using the existing OpenAI/pgvector foundation.
Search active versions and drafts, excluding historical versions before ranking
and limiting. Return complete `RecipeVersionOut` candidates in one request;
multiple versions of a lineage remain distinct. Similarity scores stay internal.

Refresh after committed creation/name edits and publication, plus nightly at
03:00 Europe/Berlin; initial population remains manual. Delete embeddings
atomically when versions become historical, and recheck eligibility before
storing in-flight results. Sweeps skip historical versions and remove leftover
historical embeddings. Reuse the embedding client and shared scheduling loop.

Delivered as backend services and `python -m app.recipe_semantic` commands.
MCP exposure, artifacts and AI Service integration remain separate slices.
See [recipe semantic search](../recipe-semantic-search.md).

Verification: all 89 backend tests passed with deterministic providers and
PostgreSQL/pgvector. Focused type checking found no new errors; the existing
`main.py` domain exception handler typing issue remains.

Follow-up consolidation shares embedding columns/constants, transaction refresh
coordination, refresh/search base services and operational command handling.
Domain source text, eligibility, queries and output formatting remain explicit.
Independent Sol review prompted partial-startup cleanup protection, explicit
foodstuff candidate naming and a shared model-level recipe eligibility policy.
Re-review found no remaining actionable findings; all 107 backend tests passed.

### Slice 2 follow-up: foodstuff search through MCP

Expose `search_foodstuffs(query, limit=5)` through the existing MCP server.
Return ranked foodstuff summaries, without similarity scores, using the shared
search service and application-owned embedding client. Search is a bounded
prefilter; the agent interprets the summaries in conversation rather than treating
ranking as an identity decision. Limits are 1–20.

Unavailable search and failed query embeddings produce tool errors; an empty
eligible catalogue returns an empty list successfully. Keep artifacts, writes,
recipe search, domain instruction resources and AI Service migration deferred.
See [tool contract and Inspector usage](../mcp.md#foodstuff-search).

Verification: all 70 backend tests passed, including MCP client discovery,
serialization without scores, limits, validation, error/empty-result distinctions,
and lifecycle cleanup. Tests use deterministic embeddings without cloud calls.

### Slice 2: foodstuff semantic search

Specification: [Foodstuff Semantic Search](../specs/2026-10-01-foodstuff-semantic-search.md)
(local, gitignored specification).

Use cloud OpenAI `text-embedding-3-large` with default 3,072 dimensions,
PostgreSQL/pgvector, and exact cosine nearest-neighbour search. Focus on aliases
and alternative ingredient names. Embed deterministic name/brand text and retain
the model identifier and exact input text with each vector.

Refresh missing or mismatched model/text embeddings after committed creation or
input-affecting edits, and nightly at 03:00 Europe/Berlin inside the single-worker
backend. Initial population is manual; no startup sweep. Log and skip failures
without immediate retries. Missing credentials disable semantic capability while
ordinary backend operations remain usable.

Implemented in the shared search/refresh services and `python -m app.foodstuff_semantic` commands. See [configuration, lifecycle and verified alias rankings](../foodstuff-semantic-search.md). A dependent cascading table stores current vectors. Post-commit/savepoint hooks and one lifecycle worker maintain freshness without tying catalogue writes to provider availability.

Defer HTTP/MCP
search endpoints, artifacts, broader category/nutrition queries, and AI Service
changes. Search excludes stale embeddings and returns candidates rather than
identity decisions.

### Slice 1: MCP integration

Implemented with official SDK `2.2.0`, mounted at `/mcp/` inside FastAPI.
The backend lifespan owns the SDK session manager; each application instance
gets a fresh server. The HTTP greeting and MCP `hello_world` tool call one
shared greeting service, preserving the existing HTTP response.

Use stateless Streamable HTTP with JSON responses for this initial request/result
workflow. Domain state will use explicit references rather than transport sessions.
The Host allowlist is configurable for loopback, Docker, and gateway addresses.

See [integration and verification](../mcp.md) for the endpoint, client probe,
configuration, and test coverage. Domain instructions and reads remain deferred.

Verification on 2026-10-01: all 45 backend tests passed; the contract unittest
suite passed (12 tests, one skipped). The SDK probe also succeeded against a
live Uvicorn TCP endpoint. The generated HTTP contract check passed after
regeneration, with no semantic changes to generated files.

## Related Planning

Cross-project direction remains in the workspace's `plan` repository:

- `Architecture/Recipe Agent Capability and Proposal Outline.md`
- `Ideas/Recipe Optimization Skills and Kochwiki Tools.md`

This concept records the Kochwiki implementation block; it does not replace the cross-project outline or specify the later AI Service migration.
