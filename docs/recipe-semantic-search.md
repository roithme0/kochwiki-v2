# Recipe semantic search

The shared `RecipeSemanticSearch` service discovers recipes by name and returns
ranked candidates containing the complete existing `RecipeVersionOut` schema.
Ingredients, foodstuff summaries, steps, nutrition, version and lineage IDs, and
state are returned together. Multiple versions of a lineage remain separate
candidates. Search is a prefilter, not an identity decision.

The service is available through backend commands and the MCP `search_recipes`
tool. See [MCP contract and Inspector usage](mcp.md#recipe-search). HTTP search
endpoints, artifacts and AI Service changes remain deferred.

## Storage and configuration

Run the normal Alembic upgrade. Migration `20261001_06` adds `recipe_embedding`,
with a cascading foreign key to the recipe version; existing recipe data is
unchanged. The preceding foodstuff migration supplies the pgvector extension.

Use the same optional `OPENAI_API_KEY` and application-owned embedding client as
foodstuff search: OpenAI `text-embedding-3-large`, 3072 dimensions, exact cosine
nearest-neighbour search without an approximate index. The existing
`EMBEDDING_MODEL` setting determines this shared client's model;
this slice introduces no separate model configuration.

The embedded text is exactly the saved recipe name. Each embedding retains its
model and source text. Active versions and drafts are searchable; historical
versions are excluded. Source/model/state filtering occurs before ranking and
limiting. There is no relevance threshold, keyword fallback or lineage deduplication.
Similarity scores remain internal to search candidates and are omitted from
the command's recipe output.

## Refresh and lifecycle

The typed `semantic_search.SemanticSearch` base handles search input validation,
availability checks, query embedding and sanitized provider errors. Recipe
retrieval retains its SQL eligibility/freshness filters, ranking and limit,
relationship loading and full recipe serialization.

`RecipeEmbeddingService` supplies recipe-specific source text, eligibility,
embedding construction and historical cleanup. The shared typed
`embedding_service.EmbeddingService` owns freshness checks, generation outside
database transactions, locked revalidation, persistence, error handling and
sweep counting. `FoodstuffEmbeddingService` uses the same algorithm with its
own source and storage rules.

Creation of an active version or draft, draft renaming, and draft publication
enqueue refresh after the outer write transaction commits. Savepoints wait for
the outer commit; rolled-back writes enqueue nothing. Changes to servings,
ingredients, steps or foodstuff data do not require a new name embedding.
Returned recipes are serialized from current database data.

Both active-edit publication and draft publication delete the previous active
version's embedding in the transaction that makes it historical. Rolling back
publication restores the previous state and embedding. Deleting a draft or
lineage cascades the associated embeddings.

Generation takes place outside the recipe write transaction. Before persisting
the vector, refresh locks and rechecks the recipe's state, name and requested
model. Deleted, historical or otherwise obsolete results are discarded.

Recipe refresh uses a UUID `RefreshCoordinator` instance, with the same generic
transaction handling as the integer foodstuff coordinator. Each has independent
transaction bookkeeping and subscribers. The domain marking functions are thin
wrappers; both coordinators bind directly to lifespan-owned
`EmbeddingRefreshWorker` instances. Both use the same embedding client, which is closed
after both workers stop. Nightly sweeps run at 03:00 Europe/Berlin, with no
startup population or durable queue. Deploy a single backend process/worker.
Sweeps remove leftover historical embeddings and refresh only missing or stale
active/draft embeddings. Initial population is manual.

`app/semantic_lifecycle.py` separates search-service/client setup from refresh-worker
setup into two context managers. The application lifespan nests search services,
refresh workers and the MCP session manager; shutdown reverses that order.
Each context registers cleanup as resources are acquired. Partial worker
construction/startup failure stops previously started workers, clears the MCP
search bindings and closes the client. A failed thread start also removes its coordinator
subscription. Cleanup continues if another cleanup callback raises.

Provider failures log the version ID and exception type, skip the record and
continue; there are no immediate retries. Background failure does not fail a
recipe write. Missing credentials disable background embedding and semantic
search while ordinary recipe operations, including historical cleanup, continue.

## Commands

`app.recipe_semantic` is a thin entry point to the shared `app.semantic_commands`
runner. It supplies recipe service factories and JSON formatting; argument
parsing, embedding-client lifecycle, errors, refresh reporting and exit codes
are shared with the foodstuff command.

From `backend`, using the existing environment or `.env` for credentials:

```powershell
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m app.recipe_semantic refresh
.venv/Scripts/python.exe -m app.recipe_semantic search "Spaghetti Bolognese" --limit 5
```

For a local deployment:

```powershell
docker compose --env-file deployment/.env -f deployment/docker-compose-local.yml exec backend python -m app.recipe_semantic refresh
docker compose --env-file deployment/.env -f deployment/docker-compose-local.yml exec backend python -m app.recipe_semantic search "Spaghetti Bolognese" --limit 5
```

Search defaults to five results, accepts limits 1–20 and prints one full recipe
JSON object per result, in rank order. Empty eligible results succeed. Blank
queries, invalid limits, unavailable capability and query embedding failures
exit nonzero. Refresh prints refreshed/skipped/failed counts and exits nonzero
on record failures. Current embeddings cause no provider calls.

## Verification

Deterministic tests use fake providers and PostgreSQL/pgvector. They cover name
and model freshness, historical filtering before the limit, complete/current
recipe serialization, publication cleanup and rollback, in-flight state/name/
model/deletion changes, cascading deletion, failed-record continuation,
post-commit/savepoint scheduling, input validation, unavailable capability,
and application lifecycle behavior. No live recipe-quality evaluation or paid
embedding requests were made for this slice.

Verification on 2026-10-01: all 89 backend tests passed, including the migration
against the existing test database, UUID worker scheduling and command output.
Focused type checking found no new errors; the existing FastAPI domain exception
handler signature mismatch in `main.py` remains. The existing Alembic
`path_separator` deprecation warning also remains.

Follow-up review after the shared-code extractions: all 107 backend tests passed,
including partial worker construction/startup and cleanup failures. An independent
Sol review found no remaining actionable correctness, duplication or clarity
issues after the fixes. Type checking found no new errors.
