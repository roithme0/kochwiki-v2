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

### Recipe search MCP tool

Expose `search_recipes(query, limit=5)` using the existing recipe search service.
Return ranked, complete `RecipeVersionOut` objects without similarity scores;
limits are 1–20. Active and draft versions with current name embeddings are
eligible, and historical versions stay excluded. Each version remains a separate
candidate. Search is a prefilter for interpretation in conversation.

Both search services are bound and unbound by the application lifespan and
share its embedding client. Invalid inputs, unavailable capability and provider
failures produce tool errors; an empty eligible catalogue succeeds. Retrieval
does not create proposals or automatically render artifacts. Writes, artifact
integration, instructions and AI Service migration remain deferred.
See [tool contract and manual usage](../mcp.md#recipe-search).

Verification: all 109 backend tests pass, including MCP discovery, complete
active/draft serialization, ranking and limits, validation, unavailable search,
provider errors, empty results and both search bindings' cleanup. Tests use fake
embeddings without cloud calls.

### Kochwiki-owned MCP instructions

Provide domain guidance through MCP connection metadata, with the text maintained
in `app/mcp_instructions.py`. Cover supplied snapshots, additional foodstuff and
recipe searches, candidate interpretation, clear matches and natural-language
clarification. Discuss or display references selectively when supported by the
host; keep retrieved recipes distinct from proposals. Describe only the current
read capabilities, including incomplete search coverage and retrieval failures.

No new tool, prompt, resource, artifact interface or write capability is added.
AI Service's existing recipe instructions remain until its later MCP consumption
and domain migration slice. Generic orchestration and artifact transport guidance
belongs to AI Service. See [instruction delivery](../mcp.md#domain-instructions).

Verification: all 110 backend tests pass. The SDK client receives the exact
instructions through both default discovery and the explicit initialization
handshake across fresh application instances. The client probe checks that
instructions are present. Focused type checking passes without diagnostics.

### Dedicated foodstuff creation MCP tool

Expose `create_foodstuff(foodstuff)` with the existing `FoodstuffCreate` schema
and shared REST creation service. Name and unit remain mandatory; return
`FoodstuffOut` after transaction commit, retaining the existing embedding refresh
trigger. Validation and domain conflicts become tool errors. Database failures
roll back without scheduling refresh and expose no database diagnostics.

Instructions restrict creation to explicit, dedicated requests. Search first
for duplicates and clarify plausible matches; this remains instruction-driven.
Any supplied nutrition value, including zero, requires a user-supplied unit.
Without nutrition values, the agent may choose a suitable unit and mention it.
Validation enforces unit presence, while user provenance remains agent guidance.
Nutrition uses the existing per-100-g/ml or per-piece convention.

This persists a catalogue entry immediately. Missing ingredients in future
proposals remain separate; proposal storage, atomic proposal saving and AI Service
integration are deferred. See [tool contract](../mcp.md#foodstuff-creation).

Verification: all 112 backend tests pass. MCP tests cover discovery, saved output,
persistence, required units with zero nutrition values, invalid inputs, duplicate
conflicts, post-commit refresh and rollback without refresh on failure. Focused
type checking passes. Tests make no paid OpenAI calls.

### Dedicated foodstuff update MCP tool

Expose `update_foodstuff(foodstuff_id, changes)` through the existing partial
update schema and shared service. Omitted fields stay unchanged; null clears
optional fields. Return complete `FoodstuffOut` after commit, including recipe
references. Name/brand changes retain the post-commit embedding refresh trigger.
Creation and update share MCP transaction/error handling; database failures roll
back and return sanitized tool errors.

Instructions restrict updates to explicit requests for an unambiguously identified
target. Present the concrete target before updating and clarify uncertainty.
Search for duplicates when changing name/brand, excluding the target. Warn and
confirm intent when a unit change retains existing nutrition; the backend permits
it. Shared entry changes affect all recipes using it.

After both creation and update, present the returned saved record as a foodstuff
artifact when supported, otherwise in text. Actual artifact rendering, AI Service
integration and proposal workflows remain deferred.
See [tool contract and saved-result presentation](../mcp.md#foodstuff-updates-and-saved-results).

Verification: all 113 backend tests pass, including MCP partial updates, explicit
nulls, unit changes retaining nutrition, recipe references, refresh scheduling,
missing targets, conflicts, validation and rollback without refresh on failure.
Tests make no paid OpenAI calls.

### In-memory recipe proposal storage

Specification: [Recipe Proposal Storage](../specs/2026-10-01-recipe-proposal-storage.md)
(local, gitignored specification).

Implemented typed creation and exact retrieval through backend services only.
Retain complete immutable proposed recipes in an application-owned in-memory
store, with issued proposal UUIDs and UTC creation timestamps. Backend restart
loses proposals; durable storage, expiry/cleanup and conversation integration
remain deferred. No database migration is needed.

Each proposal references its original source recipe version and optionally a
base proposal being refined. Refinements create new complete proposals and
retain the original source. Ingredients contain index/amount and an explicit
existing-foodstuff-ID or inline temporary-definition variant. Temporary
definitions follow foodstuff creation validation and create no catalogue rows.
Reject repeated existing IDs, duplicate indexes and repeated temporary
name/brand pairs after existing schema normalization, without semantic matching.

Store source and existing foodstuff references only, accepting changes until
saving; no snapshots. Validate references at creation. Later dependency deletion
does not block deletion or remove the retained proposal: raw retrieval still
returns its references, while future preview/save must handle missing records.

This slice adds no MCP/HTTP endpoint, artifact rendering, calculated preview,
recipe saving or AI Service integration. Proposal identity remains independent
of artifact identity. These decisions refine the provisional stored-proposal and
temporary-foodstuff slices above and the earlier cross-project outline.

Models live in `app/schemas/recipe_proposal.py`; `RecipeProposalStore` in
`app/services/recipe_proposals.py` provides `create(session, payload)` and
`get(proposal_id)`. Each application owns `app.state.recipe_proposals` and clears
it on shutdown. Creation revalidates and detaches submitted content, verifies
references with read-only queries without autoflush, and inserts only after
validation and output construction. Retrieval returns a detached model without
database or provider access. This memory insertion is independent of database
transaction rollback.

Verification: all 158 backend tests pass, including strict nested validation,
mixed variants, temporary identity normalization, source/refinement attribution,
application isolation and shutdown cleanup, detached input/output, no records or
embedding refresh work, failure atomicity and retention after dependency edits
or deletion. Focused type checking passes; tests make no paid provider calls.

## Related Planning

Cross-project direction remains in the workspace's `plan` repository:

- `Architecture/Recipe Agent Capability and Proposal Outline.md`
- `Ideas/Recipe Optimization Skills and Kochwiki Tools.md`

This concept records the Kochwiki implementation block; it does not replace the cross-project outline or specify the later AI Service migration.
