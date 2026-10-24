# Operation

## Deployment layout

| Environment | Compose file | Application image channel | Default gateway port |
| --- | --- | --- | --- |
| Production | [docker-compose-production.yml](../deployment/docker-compose-production.yml) | `latest` | 8003 |
| Staging | [docker-compose-staging.yml](../deployment/docker-compose-staging.yml) | `alpha` | 8002 |

Use a separate deployment directory and `.env` per environment. Both files bind the same relative database and storage paths; different Compose project names alone do not isolate their data. `GATEWAY_PORT` overrides the defaults.

The [publishing workflow](../.github/workflows/publish-app.yml) publishes versioned images and updates the channel on release tags: `vX.Y.Z` → `latest`, `vX.Y.Z-alpha.N` → `alpha`. It does not deploy them to a host.

## Configure the host

- Install Docker with Compose v2 and retain the `deployment/` directory structure, including gateway, Garage, and PostgreSQL configuration.
- Create `deployment/.env` from [.env.example](../deployment/.env.example). Replace placeholders; the [development setup](development.md#run-locally) describes credential formats and integration settings.
- Set `STORAGE_PUBLIC_ORIGIN` to the public application origin and `OIDC_CALLBACK_URL` to that origin plus `/api/auth/callback`. Configure the identity provider and any container-specific backchannel address.
- Put HTTPS termination in front of the HTTP gateway. Staging currently defaults `OIDC_ALLOW_INSECURE_HTTP` to `true`; set it to `false` when HTTPS is configured.
- Set `AI_GATEWAY_URL` to the external AI service origin reachable from the backend and gateway. Set `MCP_ALLOWED_HOSTS` for the hostnames used to access MCP.

## Deploy or update

Commands below run from **deployment/** and show production. For staging, substitute `docker-compose-staging.yml`.

Before updating, record the running image IDs, review migrations, and take a restorable backup. Channel tags move; use matching version tags or image digests for frontend and backend when a deployment must be reproducible.

```sh
docker compose --env-file .env -f docker-compose-production.yml pull
docker compose --env-file .env -f docker-compose-production.yml up -d
docker compose --env-file .env -f docker-compose-production.yml ps -a
docker compose --env-file .env -f docker-compose-production.yml logs --tail=100 backend gateway file-storage-init
```

The backend runs `alembic upgrade head` before starting. Garage initialization creates/configures image buckets; its container should exit successfully. PostgreSQL initialization runs only for a new data directory: changing passwords in `.env` does not rotate existing database credentials.

After deployment, check login, recipe loading, and image upload/download through the public origin. Check an AI conversation if configured. `/api/meta/version` reports the backend version; it is not a readiness check. Database and storage health checks do not establish that the complete application works.

## Persistent data and recovery

Paths are relative to **deployment/**:

| Data | Location |
| --- | --- |
| PostgreSQL records, sessions, image metadata, and embeddings | `postgres/data/` |
| Garage image objects and storage metadata | `garage/data/` and `garage/meta/` |
| Credentials and deployment configuration | `.env` and the configuration files used for that deployment |

Back up database and object storage together: database image references must match the stored objects. For a filesystem backup, stop the stack first with `docker compose --env-file .env -f docker-compose-production.yml stop`, then back up all three data directories and configuration using the host's backup tooling. Protect copied credentials and restart with the deployment command above.

The repository has no automated backup or restore workflow. Verify recovery in an isolated deployment using a matched backup and its compatible application version before relying on it. Reverting application images alone does not reverse migrations. Unsaved proposals are held in backend memory and are lost on restart.

## Troubleshooting

| Symptom | Start here |
| --- | --- |
| Backend does not start | Backend migration logs, database health, and database credentials. |
| Images fail | `file-storage-init` exit status, Garage health, storage credentials, and `STORAGE_PUBLIC_ORIGIN`. |
| Login fails | Provider availability, registered callback, client credentials, and backchannel connectivity. |
| AI requests fail | `AI_GATEWAY_URL` and external service connectivity; an empty URL disables the relay with 503. |
| Semantic search is unavailable | Backend embedding logs and `OPENAI_API_KEY`. |

Use Compose logs for diagnosis. The repository does not configure centralized monitoring or alerting.
