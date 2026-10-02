# Kochwiki

Kochwiki is a private, mobile-first recipe app. This next iteration builds on v1 and introduces AI-assisted recipe improvements, while serving as a practical project for professional AI and full-stack engineering.

## Core Features

- **Recipe and ingredient management**: Create and maintain recipes and ingredients manually, including images.
- **Nutrition tracking**: Track calories and macronutrients per ingredient and calculate them for each recipe from its ingredients and quantities.
- **Gut-health recipe improvements**: Use AI to assess recipes against transparent, non-medical gut-health criteria and propose reviewable improvements. Initial signals include fibre, ingredient diversity, fermented foods, and the degree of processing. Allergies, intolerances, and dietary exclusions take priority.
- **Mobile-first experience**: Use the application on a phone, including image capture or selection and cooking-friendly interactions. A Progressive Web App is the intended delivery model; desktop is secondary for now.

## Planned Architecture

- **Frontend**: Angular, built mobile-first as an installable PWA.
- **Backend**: A single Python FastAPI service.
- **Database**: PostgreSQL for recipes, ingredients, nutrition data, and image metadata.
- **Image storage**: Self-managed SeaweedFS, accessed through its S3-compatible API. Images are stored as objects; PostgreSQL stores metadata and object references.
- **Image access**: Private buckets with short-lived presigned upload and download URLs issued by the backend.

## AI and API Direction

AI suggestions must be explainable and individually reviewable. Accepted changes should preserve the original recipe or otherwise provide a clear history.

The project may later expose a constrained API for general-purpose agents. This will be treated as a security boundary: capabilities, authentication, authorization, and auditability must be designed before agent write access is introduced.

## Operational Notes

The optional backend foodstuff alias search uses OpenAI embeddings and PostgreSQL pgvector. See [configuration, initial refresh/search commands, lifecycle and verification](docs/foodstuff-semantic-search.md).

Recipe name search uses the same embedding foundation for active versions and
drafts, returning complete recipes. See [recipe search and refresh commands](docs/recipe-semantic-search.md).

The backend also hosts a Streamable HTTP MCP endpoint with hello-world and
foodstuff and recipe search tools, explicit foodstuff creation and updates, and
recipe proposal creation, retrieval and saving. See
[MCP integration and local verification](docs/mcp.md).

The backend consumes the local `kochwiki-contract` package containing shared
resolver API models. After installing backend requirements, install
`backend/contract` into the same environment before running the backend or
OpenAPI generation. See [contract package development and wheel verification](backend/contract/README.md).

The optional AI Service connection uses restricted same-origin session routes through the gateway and Angular development proxy. See [AI Service gateway configuration and verification](docs/ai-service-gateway.md) for deployment/developer addresses, long-turn timeouts, and reverse resolver connectivity.

Browser API access is same-origin through the gateway or Angular development
proxy, so the backend has no CORS middleware. Server-to-server requests require
no browser CORS permissions. MCP validates Host and Origin headers separately.

The initial service layout intentionally stays small: FastAPI, PostgreSQL, and SeaweedFS. A single SeaweedFS node is a single point of failure, so backups for both database and object storage are required from the outset. Replication and additional services will be added only when they address a concrete need.

## Scope

Kochwiki is for personal, private use. It is also a learning environment for applying production-minded AI and full-stack practices.

## AI Workflows

The frontend uses `@roithme0/chat-ui` version `0.0.4-alpha` from GitHub Packages. Active and draft recipe detail pages offer **Rezept verbessern**, opening a conversation for that specific version. The page captures the original recipe and full foodstuff catalog once, shows read-only original and proposal recipes, and supports free-text refinement through the AI Service gateway. Generation never writes recipes. Each proposal can be saved explicitly as a new draft in the source lineage, preserving the original snapshot attribution. Saving stays in chat; the snackbar offers to open the returned draft through the leave confirmation. Repeat saves create separate drafts; ambiguous failures are not retried automatically.

Conversations exist only while the page is open. After submitting a message, leaving or replacing the conversation requires confirmation; the existing user-switch flow discards it without confirmation. Reload/tab-close protection depends on browser support. Returning starts a fresh session. Leaving does not cancel remote work. History scrolling is manual, and catalog/context limits surface as initialization errors rather than silently reducing the catalog.

Docker and CI use the locked installation; the CI workflow passes its short-lived `GITHUB_TOKEN` to `npm ci` as a BuildKit secret. Contract tests cover the public `/ui` and `/conversation` entry points and controlled request/response flows; these do not establish live-agent or mobile-keyboard readiness.

For interactive development, run `npm run link:chat-ui` in `frontend` to link the sibling AI Service build. To restore the locked registry installation afterward, run `npm ci` in `frontend` with `NPM_TOKEN` supplied through the existing credential setup. Release builds and tests must use that registry installation, not the local link.

Use workflow skills only when explicitly invoked by the user.

- `$prepare-spec`: pressure-test a scoped change and create or refine its lightweight spec.
- `$deliver-spec`: plan and implement an approved spec continuously, pausing only for material exceptions.
- `$review-delivery`: perform the final spec-conformance, validation, and broader codebase review.
