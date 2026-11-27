# Development

- [Validation](validation.md)
- [Frontend testing](frontend-testing.md)
- [Backend testing](backend-testing.md)
- [End-to-end tests](end-to-end-tests.md)
- [Agentic coding](agentic-coding.md)

## Prerequisites

- Docker with Compose v2; Node.js 24 and Python 3.13 for host-side development.
- GitHub Packages access to `@roithme0/chat-ui`. Set `NPM_TOKEN` in your shell for npm; put the token in the ignored `frontend/.npm-token` file for Docker builds.
- Keep local credentials in ignored files. The `.env.example` files contain placeholders to replace.

Commands below run from the stated directory. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Run locally

1. Copy [deployment/.env.example](../../deployment/.env.example) to `deployment/.env`. Set `GATEWAY_PORT=8002` to match the frontend development proxy. Configure the database passwords and Garage credentials: RPC secret, admin token, and secret access key are 64 hex characters; the access key ID is `GK` followed by 32 hex characters.
2. Configure the integrations you need:

   | Integration | Configuration |
   | --- | --- |
   | Login | Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_CALLBACK_URL`. Register the callback with the provider: `http://localhost:8002/api/auth/callback` for the container UI, or port `4202` for the frontend dev server. The secret must have at least 32 characters. Use `OIDC_BACKCHANNEL_URL` if the container needs a different address to reach the provider. |
   | AI conversations and semantic search | Set `AI_GATEWAY_URL` to the AI service gateway origin reachable from both Docker gateway and backend containers, for example `http://host.docker.internal:8000`. Blank disables conversations, semantic search, and embedding refresh. Provider credentials belong in the AI service. |

3. From the **repository root**:

   ```sh
   docker compose --env-file deployment/.env -f deployment/docker-compose-common.yml -f deployment/docker-compose-local.yml up --build -d
   ```

Open `http://localhost:8002`. Database migrations run when the backend starts. The UI requires login; the identity provider and AI service are not started by this stack.

### Frontend live reload

Keep the local stack running. From **frontend/**:

```sh
npm ci
npm start
```

Open `http://localhost:4202`. API and storage requests proxy to port 8002. For AI conversations, copy [frontend/.env.example](../../frontend/.env.example) to `frontend/.env` and set `AI_GATEWAY_URL` to the service origin reachable from the host.

### Backend changes and debugging

The container has no live reload. From the **repository root**, rebuild after backend edits:

```sh
docker compose --env-file deployment/.env -f deployment/docker-compose-common.yml -f deployment/docker-compose-local.yml up --build -d backend
docker compose --env-file deployment/.env -f deployment/docker-compose-common.yml -f deployment/docker-compose-local.yml logs -f backend
```

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
