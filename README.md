# Kochwiki

Kochwiki is a personal, private, mobile-first recipe app. This next iteration builds on v1 and introduces AI-assisted recipe improvements.

## Core Features

- **Recipe and ingredient management**: Create and maintain recipes and ingredients manually, including images.
- **Nutrition tracking**: Track calories and macronutrients per ingredient and calculate them for each recipe from its ingredients and quantities.
- **Gut-health recipe improvements**: Use AI to assess recipes against transparent, non-medical gut-health criteria and propose reviewable improvements. Initial signals include fibre, ingredient diversity, fermented foods, and the degree of processing. Allergies, intolerances, and dietary exclusions take priority.
- **Mobile-first experience**: Use the application on a phone, including image capture or selection and cooking-friendly interactions. A Progressive Web App is the intended delivery model; desktop is secondary for now.

## Planned Architecture

- **Frontend**: Angular, built mobile-first as an installable PWA.
- **Backend**: A single Python FastAPI service.
- **Database**: PostgreSQL for recipes, ingredients, nutrition data, and image metadata.
- **Image storage**: Self-managed Garage, accessed through its S3-compatible API. Local, staging, and production Compose definitions provision private `recipe-images` and `foodstuff-images` buckets in separate environment instances, sharing each environment's application credentials across both buckets. The shared image module validates uploads, persists metadata in PostgreSQL with an explicit image kind, and issues download access behind domain-specific recipe and foodstuff endpoints. Recipe versions can reference images; foodstuff associations and editing workflows remain pending. Two-bucket provisioning is verified in isolated fixtures; application rollout remains pending.
- **Image access**: The gateway exposes the S3 API at `/storage/`. Upload-start and completion endpoints issue presigned URLs, validate temporary PNG uploads and store accepted bytes under separate permanent keys. A download endpoint issues five-minute image URLs with a non-cacheable API response. The create/edit dialog's Basis section provides image preview, selection, replacement and removal, uploading selected files on Save. Recipe saves support image selection, removal and version inheritance; the detail page displays the viewed version?s image above the ingredients card. Grid cards display the version image in place of the nutrition diagram, at full content width with height determined by its aspect ratio.

## AI and API Direction

AI suggestions must be explainable and individually reviewable. Accepted changes should preserve the original recipe or otherwise provide a clear history.

The project may later expose a constrained API for general-purpose agents. This will be treated as a security boundary: capabilities, authentication, authorization, and auditability must be designed before agent write access is introduced.

## Operational Notes

Frontend quality commands, Codex hook behavior, and the initial lint debt are documented in [frontend linting](docs/frontend-linting.md). The Codex Stop hook formats changed frontend files, checks lint, and runs tooling tests and the full Angular test suite. CI runs read-only linting and fails on findings.

See [file storage configuration and verification](docs/file-storage.md) for Garage
credentials, persistence, automatic initialization, and the presigned URL routing
contract. Recipe versions reference validated images; image editing is available in Basis.

Compose gives the backend a restricted PostgreSQL database owner and installs
pgvector separately during database initialization. Local and staging will start
with fresh database storage; see
[database accounts and initialization](docs/database-permissions.md).

The optional backend foodstuff alias search uses OpenAI embeddings and PostgreSQL pgvector. See [configuration, initial refresh/search commands, lifecycle and verification](docs/foodstuff-semantic-search.md).

Recipe name search uses the same embedding foundation for active versions and
drafts, returning complete recipes. See [recipe search and refresh commands](docs/recipe-semantic-search.md).

The backend also hosts a Streamable HTTP MCP endpoint with hello-world and
foodstuff and recipe search tools, explicit foodstuff creation and updates, and
recipe proposal creation, retrieval and saving. See
[MCP integration and local verification](docs/mcp.md).

Backend API models and validation live in `backend/app`; no separate contract
package installation is required. Domain models, schemas, services, and HTTP
routes live in `backend/app/recipes`, `backend/app/foodstuffs`, and
`backend/app/identity`. Identity includes users, OIDC login, and application
sessions. Search commands stay with their recipe and foodstuff domains;
shared settings, errors, greeting, and schema helpers live in `backend/app/core`.
The shared HTTP router, greeting, and metadata routes live in `backend/app/api`.
Database, storage, and embedding adapters live in `backend/app/infrastructure`. Install `backend/requirements.txt` before
running the backend or OpenAPI generation. From `frontend`, run
`npm run check:kochwiki-contract` to verify that the generated OpenAPI document
and frontend types match the backend schemas.

The optional AI Service connection uses restricted same-origin session routes through the gateway and Angular development proxy. See [AI Service gateway configuration and verification](docs/ai-service-gateway.md) for deployment/developer addresses, long-turn timeouts, and reverse resolver connectivity.

Browser API access is same-origin through the gateway or Angular development
proxy, so the backend has no CORS middleware. Server-to-server requests require
no browser CORS permissions. MCP validates Host and Origin headers separately.

FastAPI manages Keycloak login and creates or reuses a local user by validated
issuer and subject. Each login refreshes the provider-owned email and non-unique
display name. Email never links accounts; manual user selection, creation and
local profile editing are removed. Angular resolves the current user through
`/api/auth/me` on the first guarded navigation, keeping content hidden until the session is verified.
Absent sessions initiate browser login; successful callbacks redirect home.
There is no return destination feature. Temporary failures show an error without
automatic login or retry actions. See [OIDC configuration and verification](docs/authentication-verification.md).

Successful login establishes a PostgreSQL-backed local session with a host-only,
HttpOnly cookie and 30-day sliding inactivity expiry. `/api/auth/me` returns the
current user and renews the session; same-origin `POST /api/auth/logout` ends only
the local session. Logout opens `/signed-out`, with a short hint and explicit sign-in
button; reloading that page does not automatically start login. The Keycloak
session remains active. Existing domain APIs, provider revocation checks and AI
Service authentication remain subsequent slices. Domain requests do not yet renew
or enforce the session.

The initial service layout intentionally stays small: FastAPI, PostgreSQL, and Garage. The accepted single-node Garage deployment relies on the existing server filesystem backup covering its metadata and object data. Replication and additional backup tooling are outside the current storage slice.

## AI Workflows

The frontend uses `@roithme0/chat-ui` version `0.5.4` from GitHub Packages. Active and draft recipe detail pages offer **Rezept verbessern**, opening a conversation for that specific version. The page captures the original recipe and its used foodstuffs once, supplying them as generic caller context to the AI Service, shows read-only original and proposal recipes, and supports free-text refinement through the AI Service gateway. Generation never writes recipes. Each stored proposal can be saved explicitly as a new draft in the source lineage, through its artifact save button or an explicit request in chat. Saving stays in chat; the snackbar offers to open the returned draft through the leave confirmation. Repeat saves return the same created recipe version; ambiguous failures are not retried automatically.

The conversation frontend advertises the shared chat UI JSON capability and a
KochWiki foodstuff, recipe and dedicated nutrition presentation capabilities alongside the selected recipe context.
The agent can explicitly present data using the AI Service local presentation
tool; MCP results do not automatically appear as artifacts. Domain behavior is
defined in [the MCP instructions](backend/app/infrastructure/mcp/instructions.py);
[MCP integration](docs/mcp.md#domain-instructions) documents delivery and
instruction ownership. Artifact delivery depends on the consuming agent.
Foodstuff artifacts
use the name as title and the brand as optional subtitle. Their complete payload
contains `unit`, `kcal`, `carbs`, `protein`, and `fat`, with explicit `null` values
for unknown nutrition. The shared nutrition card displays values per 100 g,
100 ml, or piece. Complete, nonzero macro totals show a chart and percentages;
partial or all-zero totals show absolute values and missing-value indicators.
These presentations have no save, selection, editing, or navigation actions and
perform no enrichment fetches. This integration requires a chat UI package with
the capability contract, header guidance, subtitles, and explicit JSON renderer.

The `kochwiki-nutrition` artifact can display nutrition for either a foodstuff or
recipe. It contains `kcal`, `carbs`, `protein`, and `fat` as `{ value, status }`
results: `exact` or `minimum` with a nonnegative number, or `unknown` with a null
value, plus a required `basis`: `per-100-g`, `per-100-ml`,
`per-piece`, `per-serving`, or `whole-recipe`. The shared nutrition card displays
that basis without converting values. Recipe lower bounds retain their minimum
status; known foodstuff values (including zero) become exact and missing values
become unknown. Basis conversions must preserve each nutrient's status. Nutrition
artifacts have no save actions. Legacy numeric/null nutrition artifacts are rejected.
The current full foodstuff display uses
the same nutrition card and can be expanded independently.

Recipe artifacts use the recipe name as their title and render complete data
through the shared recipe presentation component: servings, preparation time,
ingredients, steps, and per-serving nutrition. Ingredient foodstuffs contain only
name, unit label, and nutrition; catalogue IDs and proposal identity are excluded.
Recipe aggregate nutrient fields use `{ value, status }` results: `exact`,
`minimum` (the sum of known contributions), or `unknown` with a null value.
Saved recipes and recipe presentations show minimum values with `≥` and unknown
values with `—`. Incomplete macros use a gray ring without percentages; calories
have their own completeness status. Ingredient foodstuff fields remain numeric
or null. The editor's live preview uses the same per-nutrient statuses and updates
immediately. Invalid amounts on selected ingredients count as unknown contributions;
unselected rows are ignored. With valid portions, an empty selection shows unknown
nutrition. Invalid portions show a hint instead of per-serving results. Form and
save validation remain unchanged.

Both existing recipes and resolved proposals can be presented. Presentation
alone does not create or save a proposal or draft. The optional
artifact metadata field `proposalId` identifies the stored proposal represented
by the resolved presentation. Its presence enables the save button, which calls
`POST /recipe-proposals/{proposal_id}/save`. HTTP and MCP share the same proposal
save service and in-memory mapping; saving atomically creates required temporary
foodstuffs and a draft, and repeat saves return that version. Recipe payloads
contain no save identity, roles, or foodstuff IDs.

Conversation requests, including SSE observation, carry the authenticated user's stable `kochwiki:<user.id>` identity in `X-Application-User`. An authenticated user is required before session creation; authentication restoration alone does not start a conversation. Logout clears chat and detaches the observer. Late responses cannot update the signed-out view; a later login starts a fresh conversation. Already admitted backend work continues. The locked `0.5.4` package provides the identity-aware chat UI constructor. Release verification uses the published registry package. The documented local-link workflow produced duplicate Angular injection contexts in tests.

Conversations exist only while the page is open. After submitting a message, leaving or replacing the conversation requires confirmation; explicit logout discards it without a separate leave confirmation. Reload/tab-close protection depends on browser support. Returning starts a fresh session. Leaving stops observing the event stream without cancelling remote work. New content and status changes scroll the history to the bottom. Context limits surface as initialization errors rather than silently reducing the snapshot.

Docker and CI use the locked installation; the CI workflow passes its short-lived `GITHUB_TOKEN` to `npm ci` as a BuildKit secret. Contract tests cover the public `/ui` and `/conversation` entry points and controlled request/response flows; these do not establish live-agent or mobile-keyboard readiness.

For interactive development, run `npm run link:chat-ui` in `frontend` to link the sibling AI Service build. To restore the locked registry installation afterward, run `npm ci` in `frontend` with `NPM_TOKEN` supplied through the existing credential setup. Release builds and tests must use that registry installation, not the local link.

Use workflow skills only when explicitly invoked by the user.

- `$prepare-spec`: pressure-test a scoped change and create or refine its lightweight spec.
- `$deliver-spec`: plan and implement an approved spec continuously, pausing only for material exceptions.
- `$review-delivery`: perform the final spec-conformance, validation, and broader codebase review.
