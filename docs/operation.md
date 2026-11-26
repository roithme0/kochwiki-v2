# Operation

## Deployment layout

| Environment | Compose override | Application image channel |
| --- | --- | --- |
| Production | [docker-compose-production.yml](../deployment/docker-compose-production.yml) | `latest` |
| Staging | [docker-compose-staging.yml](../deployment/docker-compose-staging.yml) | `alpha` |

Load the [common Compose file](../deployment/docker-compose-common.yml) first, then the environment override. Use a separate deployment directory and `.env` per environment. Both environments bind the same relative database and storage paths, so sharing a directory would also share their data.

The gateway defaults to host port `8000`. Set `GATEWAY_PORT` in each environment's `.env` to use a different port. Environments running on the same host need distinct ports.

The [publishing workflow](../.github/workflows/publish-app.yml) publishes versioned images and updates the channel on release tags: `vX.Y.Z` → `latest`, `vX.Y.Z-alpha.N` → `alpha`. It does not deploy them to a host.

## Configure the host

- Install Docker with Compose v2 and retain the `deployment/` directory structure, including gateway, Garage, and PostgreSQL configuration.
- Create `deployment/.env` from [.env.example](../deployment/.env.example). Replace placeholders; the [development setup](development/general.md#run-locally) describes credential formats and integration settings.
- Set `STORAGE_PUBLIC_ORIGIN` to the public application origin and `OIDC_CALLBACK_URL` to that origin plus `/api/auth/callback`. Configure the identity provider and any container-specific backchannel address.
- In the identity-provider deployment, set `KOCHWIKI_LOGOUT_REDIRECT_URIS` to include the callback origin plus `/signed-out` and apply its client configuration. Logout returns there after ending the browser's Keycloak SSO session, which can affect other applications sharing that session. Use this setup for local environments too.
- The callback origin is trusted for authenticated mutations. Add other frontend origins with `CSRF_TRUSTED_ORIGINS` (comma-separated exact HTTP(S) origins), for example `http://localhost:4202` for the Angular dev server. Login still returns to the configured callback origin.
- Put HTTPS termination in front of the HTTP gateway. Staging currently defaults `OIDC_ALLOW_INSECURE_HTTP` to `true`; set it to `false` when HTTPS is configured.
- Set `AI_GATEWAY_URL` to the AI service gateway origin reachable from both the gateway and backend containers. It serves browser conversations and backend embeddings; blank disables conversations, semantic search, and embedding refresh. Set `MCP_ALLOWED_HOSTS` for the hostnames used to access MCP.

## Deploy or update

Commands below run from **deployment/** and show production. For staging, use `docker-compose-staging.yml` as the second file.

Before updating, record the running image IDs, review migrations, and take a restorable backup. Channel tags move; use matching version tags or image digests for frontend and backend when a deployment must be reproducible.

```sh
docker compose --env-file .env -f docker-compose-common.yml -f docker-compose-production.yml pull
docker compose --env-file .env -f docker-compose-common.yml -f docker-compose-production.yml up -d
docker compose --env-file .env -f docker-compose-common.yml -f docker-compose-production.yml ps -a
docker compose --env-file .env -f docker-compose-common.yml -f docker-compose-production.yml logs --tail=100 backend gateway file-storage-init
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

Back up database and object storage together so database image references match the stored objects. For a filesystem backup, stop the stack from **deployment/**:

```sh
docker compose --env-file .env -f docker-compose-common.yml -f docker-compose-production.yml stop
```

Use the staging override when backing up staging. Back up all three data directories and configuration using the host's backup tooling. Protect copied credentials and restart with the deployment command above.

The repository has no automated backup or restore workflow. Verify recovery in an isolated deployment using a matched backup and its compatible application version before relying on it. Reverting application images alone does not reverse migrations. Unsaved proposals are held in backend memory and are lost on restart.

Session records contain ID tokens with identity claims; restrict database and backup access. Exclude logout URLs containing `id_token_hint` from logs.

## Troubleshooting

| Symptom | Start here |
| --- | --- |
| Backend does not start | Backend migration logs, database health, and database credentials. |
| Images fail | `file-storage-init` exit status, Garage health, storage credentials, and `STORAGE_PUBLIC_ORIGIN`. |
| Login fails | Provider availability, registered callback, client credentials, and backchannel connectivity. |
| AI requests fail | `AI_GATEWAY_URL` and external service connectivity; an empty URL disables the direct AI gateway route with 503. |
| Semantic search is unavailable | `AI_GATEWAY_URL`, connectivity from the backend, and AI service embedding logs. |

Use Compose logs for diagnosis.

## Endpoint duration metrics

Configure metrics export in `deployment/.env`.

- Set `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` to the full HTTP(S) URL ending in `/otlp/v1/metrics`, reachable from the backend container. Leave it blank to disable export.
- Set `OTEL_METRICS_BEARER_TOKEN` to the raw token configured on the observability stack.
- Set `DEPLOYMENT_ENVIRONMENT_NAME` only if you need to override the default local label, `local`. The staging and production Compose files set their own labels.

Follow the observability stack’s provisioning guide to load the KochWiki dashboard JSON, then select your environment in Grafana. [Dashboard JSON](../deployment/grafana/kochwiki-request-duration.json) · [Observability provisioning guide](https://github.com/roithme0/observability#provision-grafana-dashboards)

If the dashboard shows **No data**, check the backend startup logs for the export status and configuration errors. If export is enabled, send requests to a matched API route across two one-minute export cycles so the dashboard can calculate an increase.
