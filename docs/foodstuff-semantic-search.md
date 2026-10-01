# Foodstuff semantic search

The backend offers alias/name discovery through `app.services.foodstuff_search.FoodstuffSemanticSearch`, operational commands, and the [MCP `search_foodstuffs` tool](mcp.md#foodstuff-search). No REST endpoint or UI is added. Results are ranked candidates, never an identity decision. Cosine distance is a ranking metric, not a confidence probability; no threshold or keyword fallback is applied. MCP returns foodstuff summaries without distances.

## Configuration and database rollout

Use the official OpenAI Python SDK with optional `OPENAI_API_KEY`. Backend `.env` or process environment follows the existing settings conventions; Compose forwards the key from deployment environment. Keep secrets out of command arguments, logs and version control. Missing/empty credentials leave ordinary foodstuff, recipe and MCP operations usable, disable background refresh with a warning, and make semantic commands exit nonzero with an unavailable diagnostic.

All four Compose database images use `pgvector/pgvector:0.8.2-pg16`. PostgreSQL remains major version 16, with the existing local named volume and staging/production bind mount paths unchanged. Take the existing database backup before deployment, recreate the database container with its existing volume, and deploy the backend migration normally. Do not remove or reinitialize volumes. Migration `20261001_05` enables `vector` and adds a dependent table; it does not rewrite foodstuff or recipe data. The database migration account must be able to create the extension. Custom database installations need pgvector 0.8.2 available before upgrading.

The model is `text-embedding-3-large`, with the default 3072 dimensions. Other configured models are rejected because a different model/dimension requires an explicit compatible storage decision. Existing metadata from another model is refreshed. The source is exactly the foodstuff name, plus `\nBrand: <brand>` when brand is nonempty; no nutrition, category, descriptions or alias list is embedded. One cascading dependent record retains the source text, model and full vector. Exact PostgreSQL cosine search filters current source/model before ordering and limiting; no approximate index is used.

Official API reference: [OpenAI vector embeddings](https://developers.openai.com/api/docs/guides/embeddings).

## Manual initial population and search

The module commands use the shared `app.semantic_commands` runner for argument
parsing, client lifecycle, errors, refresh reporting and exit codes. Domain entry
points supply service factories and result formatting; foodstuff search keeps its
ranked summary/distance output, while recipe search prints full recipe JSON.

Run from `backend` after installing `requirements.txt` and `./contract` into the same Python environment. Set `DATABASE_URL` and `OPENAI_API_KEY` through your existing environment or `.env`. The web server is not required.

```powershell
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m app.foodstuff_semantic refresh
.venv/Scripts/python.exe -m app.foodstuff_semantic search Moehre --limit 5
.venv/Scripts/python.exe -m app.foodstuff_semantic search chickpeas --limit 5
```

For a deployed backend container, with the secret configured through `deployment/.env` or process environment:

```powershell
docker compose --env-file deployment/.env -f deployment/docker-compose-local.yml exec backend python -m app.foodstuff_semantic refresh
docker compose --env-file deployment/.env -f deployment/docker-compose-local.yml exec backend python -m app.foodstuff_semantic search chickpeas --limit 5
```

Search defaults to five results and accepts limits 1?20. Blank queries, invalid limits, missing credentials and query embedding failures exit nonzero; an empty eligible catalogue is a successful empty result. Refresh reports refreshed/skipped/failed counts, exits nonzero when a record failed, and skips already current records. A failed item stays eligible for a later trigger or sweep.

## Service responsibilities

`semantic_search.SemanticSearch` shares query/limit validation, availability
checks, query embedding and sanitized provider errors. The foodstuff and recipe
search services retain their domain SQL, filtering before ranking/limiting,
relationship loading and candidate conversion.

The typed `embedding_service.EmbeddingService` base shares the refresh algorithm
between foodstuffs and recipes: freshness checks, generation outside database
transactions, locked revalidation, persistence, error handling and sweep counting.
The domain implementations supply eligible source text, embedding records and
IDs to refresh. Recipe-only historical cleanup remains in the recipe service.

`foodstuff_embeddings.FoodstuffEmbeddingService` owns foodstuff embedding generation, freshness checks and persistence, including single-record refresh and full sweeps. `foodstuff_search.FoodstuffSemanticSearch` embeds a query and retrieves ranked current records. Both use the shared `embeddings.EmbeddingClient`; foodstuff text generation and its SQL freshness expression live in `foodstuff_embedding_text`. The shared model setting is `EMBEDDING_MODEL` (formerly `FOODSTUFF_EMBEDDING_MODEL`); update that name if explicitly configured. The application or command owns and closes the client; neither domain service owns its lifecycle.

`foodstuff_refresh.foodstuff_refresh` is a typed instance of the shared `embedding_refresh.RefreshCoordinator`, which handles committed transaction triggers and savepoint/rollback behavior. `mark_foodstuff_refresh` is a thin domain wrapper. The backend binds the coordinator to `EmbeddingRefreshWorker`, which schedules and delegates refresh work to the embedding service. Recipe refresh uses a separate UUID coordinator and queue with the same implementation. The command creates the service appropriate to `refresh` or `search`, without starting a worker.

## Freshness and lifecycle

Shared foodstuff creation and name/brand edits mark their transaction for refresh. Work is enqueued after the outer transaction commits, including savepoint behavior. Rollback and nutrition-only edits enqueue nothing. Writes finish independently of provider availability. Generation uses its own sessions and never holds the write transaction open; before storing, it locks/rechecks the authoritative record and requested text/model. Obsolete or deleted results are discarded. Deleting a foodstuff cascades its embedding.

A single worker belongs to the FastAPI lifespan and serializes triggered refreshes and nightly sweeps. The next sweep is 03:00 Europe/Berlin local time, recalculated with daylight-saving rules. There is no startup population and no durable queue or promised catch-up after downtime. Deploy one backend worker. Shutdown unregisters triggers, stops pending work, and interrupts a sweep between records after the active bounded provider call finishes; the OpenAI client is then closed. Every API call has a 30-second SDK timeout and `max_retries=0`. Errors log a foodstuff ID and exception type, skip the affected record, and continue the sweep without immediate retry.

## Verification record, 2026-10-01

The deterministic backend suite passed 68 tests against pgvector 0.8.2 / PostgreSQL 16, including refresh metadata/currentness, failed-record continuation, concurrent edit/delete/model changes, cascading deletion, exact distance/currentness-before-limit/stable ties, post-commit and savepoint rollback, missing credentials, controlled Berlin DST timing, cooperative sweep shutdown and application lifespan cleanup. Ordinary tests explicitly use an empty key and fake providers.

Both empty-schema migration and upgrading a seeded revision `20260910_04` succeeded. The existing-schema check retained a Karotte foodstuff, a recipe version and its ingredient reference. The latter check and live commands used an isolated test-container database `kochwiki_semantic_upgrade` on localhost:5433, leaving the user catalogue untouched.

Live official OpenAI requests populated five records (Karotte, Kichererbsen, Tomate, Haferflocken, Zucchini); a second refresh made zero requests and skipped all five current records. Observed top-three results:

| Query | Rank 1 (distance) | Rank 2 (distance) | Rank 3 (distance) |
| --- | --- | --- | --- |
| Moehre | Karotte (0.614335) | Haferflocken (0.694010) | Kichererbsen (0.702252) |
| chickpeas | Kichererbsen (0.313849) | Zucchini (0.609019) | Haferflocken (0.663448) |
| Karotte | Karotte (0.000000) | Zucchini (0.548166) | Kichererbsen (0.556340) |
| Kichererbsen | Kichererbsen (0.000000) | Haferflocken (0.478722) | Karotte (0.556340) |

These observations are an empirical smoke check on a small catalogue, not a universal alias-accuracy promise. Fresh/dried and other identity distinctions remain deferred. Missing/outdated vectors reduce discoverability until refresh succeeds.
