# Development

## Prerequisites

- Docker with Compose v2; Node.js 24 and Python 3.13 for host-side development.
- GitHub Packages access to `@roithme0/chat-ui`. Set `NPM_TOKEN` in your shell for npm; put the token in the ignored `frontend/.npm-token` file for Docker builds.
- Keep local credentials in ignored files. The `.env.example` files contain placeholders to replace.

Commands below run from the stated directory. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Run locally

1. Copy [deployment/.env.example](../deployment/.env.example) to `deployment/.env`. Set `GATEWAY_PORT=8002` to match the frontend development proxy. Configure the database passwords and Garage credentials: RPC secret, admin token, and secret access key are 64 hex characters; the access key ID is `GK` followed by 32 hex characters.
2. Configure the integrations you need:

   | Integration | Configuration |
   | --- | --- |
   | Login | Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_CALLBACK_URL`. Register the callback with the provider: `http://localhost:8002/api/auth/callback` for the container UI, or port `4202` for the frontend dev server. The secret must have at least 32 characters. Use `OIDC_BACKCHANNEL_URL` if the container needs a different address to reach the provider. |
   | AI conversation | Set `AI_GATEWAY_URL` to the external service origin reachable from Docker. Leave empty if unavailable. |
   | Semantic search | Set `AI_SERVICE_URL` to the AI service origin reachable from the backend, for example `http://host.docker.internal:8004`; blank disables semantic search and refresh. Provider credentials belong in the AI service. |

3. From the **repository root**:

   ```sh
   docker compose --env-file deployment/.env -f deployment/docker-compose-local.yml up --build -d
   ```

Open `http://localhost:8002`. Database migrations run when the backend starts. The UI requires login; the identity provider and AI service are not started by this Compose file.

### Frontend live reload

Keep the local stack running. From **frontend/**:

```sh
npm ci
npm start
```

Open `http://localhost:4202`. API and storage requests proxy to port 8002. For AI conversations, copy [frontend/.env.example](../frontend/.env.example) to `frontend/.env` and set `AI_GATEWAY_URL` to the service origin reachable from the host.

### Backend changes and debugging

The container has no live reload. From the **repository root**, rebuild after backend edits:

```sh
docker compose --env-file deployment/.env -f deployment/docker-compose-local.yml up --build -d backend
docker compose --env-file deployment/.env -f deployment/docker-compose-local.yml logs -f backend
```

## Validate changes

**Frontend/** — run in order after frontend edits. Formatting includes all changed frontend files; review unrelated edits first.

```sh
npm run format:changed
npm run lint
npm run test:tooling
npm run test -- --watch=false
```

**Repository root**: format changed Python files and test the backend validation tooling:

```sh
node .codex/validation/backend.mts --format
node --test .codex/validation/shared.test.mts .codex/validation/backend.test.mts
```

Install the backend development dependencies as described [below](#update-the-api-contract). Use the backend virtual environment's Black in your editor to match the pinned version and Python 3.13 settings in `backend/pyproject.toml`. Formatting includes staged, unstaged, and untracked changed files and leaves the Git index unchanged.

Start the dedicated test database from the **repository root**:

```sh
docker compose -f deployment/tests/docker-compose-test.yml up -d --wait db
```

Then run the full suite from **backend/**:

```powershell
.venv/Scripts/python.exe -m pytest
```

On Unix use `.venv/bin/python -m pytest`. The default test database is `postgresql+psycopg://test:test@localhost:5433/kochwiki_test`; set `TEST_DATABASE_URL` if using another dedicated test database.

Alternatively, backend tests can build their own image and use the test database:

```sh
docker compose -f deployment/tests/docker-compose-test.yml run --build --rm backend-tests
```

Tests migrate and clear the database selected by `TEST_DATABASE_URL`; use a dedicated test database only. Additional gateway, storage, and authentication checks live in [deployment/tests/](../deployment/tests/).

## Update the API contract

Set up Python dependencies from **backend/**:

```sh
python -m venv .venv
```

Activate that environment (`.venv\Scripts\Activate.ps1` in PowerShell; `source .venv/bin/activate` in Bash), then run:

```sh
python -m pip install -r requirements-dev.txt
```

From **frontend/**, with npm dependencies installed:

```sh
npm run generate:kochwiki-contract
npm run check:kochwiki-contract
```

Ship backend schema changes and frontend consumers together. Review generated changes; do not edit generated files by hand. The generator uses `backend/.venv` automatically, or the interpreter selected by `PYTHON`.

## Agentic coding

| Resource | Purpose |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | Repository rules for coding agents, including approval boundaries and required validation. |
| [Skills](../.agents/skills/) | Reusable task workflows. Read each skill's `SKILL.md` for its scope and instructions. |
| [Hooks](../.codex/hooks.json) | Codex prompt and stop hooks for frontend and backend validation. |
| [Codex configuration](../.codex/config.toml) | Project MCP connections for Angular CLI and OpenAI documentation. |

For larger changes, the available workflow is `concept-creator` → `prepare-spec` → `deliver-spec` → `review-delivery`: explore the direction, agree a scoped spec, implement it, then review. Invoke the spec and delivery skills explicitly; routine changes do not require this workflow.

Temporary concepts, specs, and plans belong under `.agents/`, as defined in `AGENTS.md`. Keep them out of commits and permanent documentation.

The hooks snapshot frontend and backend content before a prompt and validate affected scopes on stop. Frontend validation formats changed files, runs lint, tooling tests, and the full Angular suite. Backend validation formats changed Python files with Black, runs tooling tests, and runs the full pytest suite against the dedicated test database, which must already be running. Shared hook changes validate both scopes. Hooks never install dependencies or start services automatically. Successful validation is reused only for identical content after every check passes; persistent failures request at most one continuation. Review formatting changes; logs are under `frontend/.codex-validation/` and `backend/.codex-validation/`.

Review and trust hooks in Codex before relying on them. The current hook commands use PowerShell and absolute checkout paths. If hooks are unavailable, run the [validation commands](#validate-changes) manually.

Use `/skills` and `/hooks` to inspect them in the Codex CLI; see the [official command reference](https://learn.chatgpt.com/docs/developer-commands).
