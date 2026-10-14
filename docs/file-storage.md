# File storage

Local, staging, and production Compose deployments each run a `file-storage` service using their own pinned
`dxflrs/garage:v2.4.1` instance with a private `recipe-images` bucket. This slice
provides storage infrastructure and an internal backend adapter for presigned
upload/download URLs, object inspection and deletion. Recipes do not yet upload
or display images, and the backend does not validate uploaded images.

## Configuration and startup

Set these values in each deployment's ignored `deployment/.env`, with distinct
values for every environment:

| Variable | Value |
| --- | --- |
| `GARAGE_RPC_SECRET` | 32 random bytes, hex encoded (64 characters) |
| `GARAGE_ADMIN_TOKEN` | Separate private administration token: 32 random bytes, hex encoded |
| `GARAGE_ACCESS_KEY_ID` | `GK` followed by 16 random bytes, hex encoded |
| `GARAGE_SECRET_ACCESS_KEY` | 32 random bytes, hex encoded (64 characters) |
| `STORAGE_PUBLIC_ORIGIN` | Public application origin, such as `https://kochwiki.example`; required for staging/production, without `/storage` or another path |

Local Compose defaults the public origin to `http://localhost:${GATEWAY_PORT:-8000}`
when `STORAGE_PUBLIC_ORIGIN` is unset or empty. Set it explicitly when accessing
the gateway through another hostname or HTTPS. The signer must use the exact
origin used by the browser, including a non-default port.

For example, use `openssl rand -hex 32` for each secret, and prefix the output of
`openssl rand -hex 16` with `GK` for the access key ID. Keep the values private;
do not commit them. Copying `.env.example` requires supplying real generated
values before Compose can start. Keep separate deployment directories and `.env`
files for staging and production: their relative bind mount paths must not share
data, even if both environments run on the same server.

From `deployment`, choose the appropriate Compose file:

```sh
docker compose -f docker-compose-local.yml up -d --wait file-storage
docker compose -f docker-compose-local.yml run --rm file-storage-init
docker compose -f docker-compose-local.yml exec file-storage /garage bucket info recipe-images
```

Use `docker-compose-staging.yml` or `docker-compose-production.yml` on those
targets. Normal full-stack `up -d` also starts Garage. Recreate the gateway after
updating its configuration. No Garage ports are published to the host.

Garage starts with `--single-node` to initialize the node layout only. Its health
check checks the daemon, without depending on a particular bucket.
The separate one-shot `file-storage-init` service provisions the named buckets in
`deployment/garage/buckets.json`, their configured application keys, and read/write
permissions. The gateway waits for successful initialization during normal startup.
The initializer reuses existing buckets and keys, verifies existing secrets, and
fails on a credential mismatch instead of silently replacing a key. This is not
a credential rotation mechanism. Keep credentials stable and manage later
rotation explicitly through Garage administration. Existing grants are preserved;
new application keys receive read/write access without bucket owner rights.
Never distribute application keys or the administration token to browser clients.

To add another bucket, add an entry to `buckets.json` using the same fields as
`recipe-images`: `name`, `access_key_id_env`, and `secret_access_key_env`.
The last two fields name environment variables, not secret values. Supply the
new credentials through each environment's `.env` and forward those variables in
the `file-storage-init` service's `environment` section in all three Compose files.
Rerun `file-storage-init`; no change to Garage's startup command is needed.
Removing an entry does not delete its stored bucket, data, key, or permissions.

Administrative CLI commands run inside the container. RPC and the HTTP
administration endpoint bind only to container loopback. The initializer shares
the storage container's network namespace to reach administration at
`http://127.0.0.1:3903`, authenticated with `GARAGE_ADMIN_TOKEN`. This endpoint is
not available to other Compose services or the public gateway. The initializer
requires no access to Garage's data volumes. The public website endpoint is disabled.
Only the private S3 API at `http://file-storage:3900`, region `garage`, is available on
the Compose network. The backend adapter uses that address with
path-style S3 addressing.

Compose forwards the application's Garage credentials as `STORAGE_ACCESS_KEY_ID`
and `STORAGE_SECRET_ACCESS_KEY`, with `STORAGE_ENDPOINT_URL=http://file-storage:3900`,
`STORAGE_REGION=garage`, `STORAGE_BUCKET_RECIPE_IMAGES=recipe-images`, and the configured
`STORAGE_PUBLIC_ORIGIN`. The backend receives no Garage administration credentials.
For a backend outside Compose, supply these six `STORAGE_*` settings directly in
its environment or ignored `.env`. All six are required together; leaving all six
absent disables storage configuration. Both addresses must be HTTP(S) origins
without paths, queries, fragments or embedded credentials.

`Settings.storage_config` supplies the strictly typed configuration to
`app.services.storage.Storage`. The adapter uses boto3 with explicit credentials,
Signature V4 and path-style addressing. It uses separate internal and public
clients; presigning performs no network request. Call `close()` after use.
`presign_upload` and `presign_download` return the URL, method and lifetime
(default 300 seconds, allowed range 1 to 3600). These URLs are reusable bearer
credentials until expiry; upload signing does not bind or validate image content.
No application endpoints expose this adapter yet.

`inspect` returns object size, content type and ETag, or `None` for an absent
object. Permission and transport failures raise a sanitized `StorageUnavailable`;
`delete` is idempotent for absent keys and likewise reports failures. Internal
requests use a 5-second connect timeout, 15-second read timeout and one attempt.
The adapter rejects ambiguous key segments (`.`, `..`, empty segments),
backslashes, control characters and keys exceeding S3's 1024-byte limit.
Do not enable boto3/botocore HTTP debug logging: it can expose signed requests.
The transfer result omits its URL from its default representation, but callers
must also avoid logging or persisting the URL explicitly.

## Persistence

| Environment | Object data | Garage metadata |
| --- | --- | --- |
| Local | `garage-data` named volume | `garage-meta` named volume |
| Staging / production | `./garage/data` | `./garage/meta` |

The service name is independent of the storage implementation. Existing volume names
and bind mount paths retain their Garage names so the rename preserves stored data.

Both directories are required for recovery and fall within the existing server
filesystem backup. No additional backup automation, restore exercise, or
replication is included. The accepted single-node topology has no redundancy.

## Gateway and presigned URL contract

The application gateway forwards `/storage/<bucket>/<key>` to Garage as
`/<bucket>/<key>`, preserving the original Host header (including its port), raw
encoded path, query, and method. It strips application cookies, disables access
logging for this route to avoid recording presigned credentials, suppresses
routine proxy error logs that could include signed queries, and does not
retry transfers. `/storage` without a slash returns 404. Anonymous bucket listing,
uploads, and object reads are rejected by Garage.

The route has a 16 MiB request-body ceiling and 60-second upstream send/read
timeouts. This is an infrastructure limit, not the future PNG validation limit.
The same-origin route requires no browser CORS configuration. Use the existing
external HTTPS termination for staging and production. An outer reverse proxy
must preserve the public Host header and pass the storage URI unchanged to the
application gateway; differing hostnames, ports, or rewritten paths invalidate
signatures. Garage's request logger is disabled through the scoped
`RUST_LOG=info,garage_api_common::generic_server=off` filter because it also logs
signed query strings; other operational logging remains enabled.

The backend adapter implements this signing sequence:

1. Create a path-style S3 signer using the **public application origin**, without
   `/storage`, region `garage`, Signature V4, and the environment's application key.
2. Sign `/<bucket>/<key>` for the intended operation and expiry.
3. Insert `/storage` before that URL's path without changing its encoded path or
   query. Return this URL to the browser.

For example, a URL signed for `https://kochwiki.example/recipe-images/plate.png`
is transported as `https://kochwiki.example/storage/recipe-images/plate.png`,
with exactly the same signature query. **Do not sign an endpoint containing
`/storage`, or sign with the internal `file-storage:3900` hostname and then replace it.**
Both fail verification. Prefix insertion is a routing step, not a new signature.

User-level authorization remains outside this slice. Private buckets and signed
URLs do not implement recipe ownership or permissions. Upload completion and
image validation before recipe attachment belong to a later application slice.

## Verification

Run the adapter regression checks without a database from the repository root:

```sh
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests -p test_storage_adapter.py
```

On Windows, use `backend/.venv/Scripts/python.exe` and set `PYTHONPATH=backend`
in the shell. The normal backend pytest suite includes these checks too, and
requires its dedicated test database.

After building the backend image with the locked dependencies, verify the adapter
against the running local stack from the repository root:

```sh
docker compose -f deployment/docker-compose-local.yml run --rm --no-deps \
  -v "$PWD/backend/tests:/checks:ro" \
  -e STORAGE_VERIFY_CONNECT_ORIGIN=http://gateway:80 \
  backend python /checks/verify_storage_adapter.py
```

The verifier uses the backend's private network for HEAD/DELETE and connects to
the gateway for signed PNG PUT/GET, preserving the configured public Host and port.
It compares downloaded bytes, checks real URL expiry, and deletes its unique
temporary object in a `finally` block. Garage reports expiration as HTTP 400
`InvalidRequest` / `Date is too old`; this is checked explicitly. It prints
neither credentials nor URLs. Omit `STORAGE_VERIFY_CONNECT_ORIGIN` to connect
directly through the configured public origin, including external TLS termination.
The internal gateway override verifies local routing and signing, not external
DNS, TLS or an outer reverse proxy.

Run the isolated integration check from the repository root with Python 3.12+
and Docker Compose available:

```sh
python deployment/tests/verify_storage.py
```

It uses synthetic credentials, dedicated named volumes, the actual Garage image
and shared gateway configuration, stub app services, and loopback port 18994.
It tests presigned PUT/GET/HEAD, encoded keys, transfers over 1 MiB, rejected
anonymous/expired/tampered requests, invalid host/method/prefix signatures,
repeatable provisioning, adding a second bucket, rejection of mismatched secrets,
persistence across restart and container recreation, ordinary gateway routes,
and absence of published Garage ports or presigned URLs in Garage/gateway logs.
It stops its containers afterward and retains test volumes; it never touches
application data. The objects are test data, not validated recipe images.

Successful local fixture checks establish neither live staging/production
deployment nor verification of their external proxies. On each target, start
Garage, check bucket health, and verify signed transfer through its actual public
origin before marking that environment verified.

Verified on 2026-10-14: all three Compose definitions validated; the isolated
storage checks passed, including restart/recreation persistence; existing Nginx
API/MCP/AI relay checks passed for controlled, unset, unresolved, and unreachable
AI upstreams (long-delay and Angular checks were not rerun). Garage was also
started in the actual local Compose stack and signed PUT/GET/DELETE and anonymous
denial were verified through its gateway, with the temporary object removed.
Staging and production rollout and public-origin verification remain pending.

The explicit initializer was also verified on 2026-10-14: fresh provisioning,
repeat runs, second-bucket read/write with a separate key, denied access with the
recipe key, and rejected secret mismatches passed. Existing local bucket access
survived the migration, and the backend container could not reach the loopback-only
administration endpoint.

The backend adapter was verified on 2026-10-14 against the actual local Garage
and gateway using a disposable backend container: encoded-key PNG PUT, private
HEAD metadata, identical-byte GET, expired-URL rejection and confirmed deletion
passed. The running application container was not rebuilt or modified. The five
adapter regression tests and complete backend suite passed (285 passed, one
skipped), and all three Compose definitions passed synthetic storage-setting
checks, including the local custom-port fallback. Staging and production have
configuration only; adapter rollout and verification through their external
public origins remain pending.

References: [Garage quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/),
[configuration](https://garagehq.deuxfleurs.fr/documentation/reference-manual/configuration/),
and [S3 compatibility](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/).
