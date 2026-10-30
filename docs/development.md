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
   | AI conversations and semantic search | Set `AI_GATEWAY_URL` to the AI service gateway origin reachable from both Docker gateway and backend containers, for example `http://host.docker.internal:8000`. Blank disables conversations, semantic search, and embedding refresh. Provider credentials belong in the AI service. |

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

With [frontend dependencies and Chromium](#frontend-checks) installed and the [dedicated backend test database](#backend-checks) running, validate from the **repository root**:

```sh
node .agents/validation/run.mts
node .agents/validation/run.mts --scope frontend
```

The runner defaults to all scopes with app and tooling checks enabled; [E2E](#end-to-end-tests) is opt-in with `--e2e`. Use `--scope frontend|backend` to narrow validation or `--app-tests=false`, `--tooling-tests=false`, and `--shared-tooling-tests=false` to skip test groups. See [the runner](../.agents/validation/run.mts) for argument handling. Review formatting changes.

### Frontend checks

Install dependencies and Chromium from **frontend/**:

```sh
npm ci
npx playwright install chromium
```

Then run in order after frontend edits. Formatting includes all changed frontend files; review unrelated edits first.

```sh
npm run format:changed
npm run lint
npm run test:tooling
npm run test -- --watch=false
npm run test:browser
```

The default unit suite runs in jsdom; `test:browser` runs `*.browser.spec.ts` in headless Chromium. App validation includes both suites. See [Angular test configuration](../frontend/angular.json) and [browser configuration](../frontend/vitest.browser.config.ts).

Browser component failure screenshots and traces are under `frontend/test-results/browser/` and uploaded on CI failure.

Upgrade `vitest` and `@vitest/browser-playwright` together; their pinned versions must match. Keep `playwright` aligned with `@playwright/test` so component and E2E suites use the same browser installation.

### Backend checks

From the **repository root**, format changed Python files and test the backend validation tooling:

```sh
node .agents/validation/backend.mts --format
node --test .agents/validation/shared.test.mts .agents/validation/backend.test.mts
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
| [Hooks](../.codex/hooks.json) | Codex prompt and stop hooks for frontend and backend app and tooling validation. |
| [Codex configuration](../.codex/config.toml) | Project MCP connections for Angular CLI, OpenAI documentation, and Playwright tests. |

For larger changes, the available workflow is `concept-creator` → `prepare-spec` → `deliver-spec` → `review-delivery`: explore the direction, agree a scoped spec, implement it, then review. Invoke the spec and delivery skills explicitly; routine changes do not require this workflow.

Temporary concepts, specs, and plans belong under `.agents/`, as defined in `AGENTS.md`. Keep them out of commits and permanent documentation.

Review and trust hooks in Codex before relying on them. They run affected [frontend and backend checks](#validate-changes), excluding [E2E](#end-to-end-tests); prepare the same dependencies first. Logs are under `.agents/.codex-validation/`. Update absolute paths in [.codex/hooks.json](../.codex/hooks.json) when relocating the checkout. If hooks are unavailable, run validation manually.

Use `/skills` and `/hooks` to inspect them in the Codex CLI; see the [official command reference](https://learn.chatgpt.com/docs/developer-commands).

## End-to-end tests

Run isolated E2E explicitly for changes to browser flows, frontend/backend integration, or deployment behavior. Prepare the [repository prerequisites](#prerequisites) and [frontend dependencies and Chromium](#frontend-checks).

Check out [identity-provider](https://github.com/roithme0/identity-provider) beside this repository at the revision in [identity-provider.ref](../deployment/tests/identity-provider.ref). Its configuration and apply script must have no local changes. Set `IDENTITY_PROVIDER_REPOSITORY` to use another checkout path. CI checks out the pinned revision automatically; update the pin deliberately when adopting provider changes.

Keep Docker running and loopback ports `9002` (Kochwiki) and `8026` (Keycloak) free. From the **repository root**:

```sh
node .agents/validation/e2e.mts
```

The runner rebuilds and recreates the isolated `kochwiki-e2e` stack using [the E2E Compose configuration](../deployment/tests/docker-compose-e2e.yml). It applies the provider's original realm, profile, client and mapper configuration through its original apply script, then creates a [disposable test account](../deployment/tests/e2e-user.json). Callback URLs and credentials are specific to the test instance. Its database, storage, and identity data are temporary and reset on each run. The development environment is separate. The stack stays running for inspection.

Every E2E test runs in two Chromium projects: `desktop-chromium` uses Desktop Chrome settings, and `mobile-chromium` uses Pixel 7 settings. To rerun only the browser tests against the prepared stack, run `npm run test:e2e:browser` from **frontend/**. Select one project with `npm run test:e2e:browser -- --project=mobile-chromium` (or `desktop-chromium`). See [the browser tests](../frontend/e2e/) for the login and navigation flows and [the Playwright configuration](../frontend/playwright.config.ts) for browser settings.

Each isolated run prints its retained artifact directory under `.agents/.codex-validation/e2e/`, containing logs, `html-report/`, and failure traces/screenshots in `test-results/`. From **frontend/**, open a report with `npx playwright show-report <artifact-directory>/html-report`.

Direct browser runs use `frontend/e2e/test-results/` and `frontend/playwright-report/`. CI uploads diagnostics on failure; see [the publish workflow](../.github/workflows/publish-app.yml).
