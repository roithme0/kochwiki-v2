# File storage

Local, staging, and production Compose deployments each run a `file-storage` service using their own pinned
`dxflrs/garage:v2.4.1` instance with a private `recipe-images` bucket. This slice
provides storage infrastructure and a backend adapter for presigned upload/download
URLs, object inspection and deletion, plus PNG validation and metadata persistence.
Upload-start/completion endpoints and a typed frontend service expose the upload
flow. Recipe versions can reference validated images, and a download endpoint issues
short-lived access URLs. Basis image editing, detail-page display and grid image display are available.

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
Upload-start and completion endpoints use this adapter through the PNG validation
service; see the upload API section below.

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
URLs do not implement recipe ownership or permissions.

## Internal recipe image uploads

`app.services.recipe_image_uploads.RecipeImageUploads` implements validation and
persistence behind the upload API. Recipe services attach its persisted image IDs separately. Construct it with
the storage adapter and a SQLAlchemy session factory, normally `SessionLocal`.
`begin()` returns an upload UUID and a 300-second presigned PUT transfer for
`recipe-image-uploads/<uuid>`. The caller transfers bytes, waits for upload success,
then explicitly calls `complete(upload.id)`; no Garage event is required.

Completion reads at most 10 MiB plus one overflow-detection byte and validates
PNG chunk integrity and full pixel decoding with Pillow. Only static PNG is
accepted, with dimensions from 1 to 4096 pixels per side, inclusive. APNG is
rejected even with a single frame. Filename and declared MIME type are not trusted.
No resizing, re-encoding or metadata stripping is performed.

Accepted bytes are written unchanged to `recipe-images/<new-image-uuid>.png`
with `image/png` content type. The returned immutable result contains image UUID,
object key, size, dimensions, SHA-256, content type and UTC creation time. The
`recipe_image` table persists these fields, with unique object keys and database
constraints for format and size limits. Completion returns success only after
the metadata transaction commits. Images are not yet attachable through a recipe API. Completion never
copies the temporary object after validation: a concurrent upload cannot change
the bytes being promoted. The service never issues PUT URLs for permanent keys.

After successful promotion or invalid-image rejection, completion attempts to
delete the temporary object. `cleanup_pending` on the result or
`InvalidRecipeImage` reports a failed deletion without hiding the validation
outcome. Missing uploads raise `ImageUploadNotFound`. Storage read/write failures
raise sanitized `StorageUnavailable` and preserve the temporary upload for retry.
A failed permanent write may have an ambiguous outcome and leave an orphan.

If metadata persistence fails, a fresh database session checks whether the image
was committed despite the error. A confirmed record allows completion to succeed.
If no record exists after a failure without an invalidated connection, completion
attempts to delete the permanent object, preserves
the temporary upload for retry and raises sanitized `ImagePersistenceFailed`.
Its `cleanup_pending` flag reports failed permanent-object deletion. If the database
cannot confirm the commit outcome, or the original connection was invalidated and
the record is not yet visible, the permanent object is retained and the error
reports `cleanup_pending=True`; deleting it could break an already committed record.
Scheduled reconciliation remains deferred. SHA-256 identifies the validated bytes;
completion does not read back the permanent object to verify its checksum.

There is no completion registry or durable idempotency yet. A repeated completion
normally finds the temporary object missing; concurrent completion or re-upload
through a still-valid temporary URL can create another independent permanent
image, never overwrite a previous accepted image. Deleting a temporary object
does not revoke its upload URL. Abandoned uploads, recreated temporary objects,
failed deletions and unattached permanent images require the explicitly deferred
cleanup-policy slice. No scheduled cleanup or retention policy is added here.

## Upload API and frontend service

`POST /api/recipe-image-uploads` returns `uploadId`, `url`, `method` (`PUT`),
`headers` and `expiresIn` (seconds). Send the raw file bytes to the returned URL
with those headers, then call `POST /api/recipe-image-uploads/{uploadId}/complete`.
Completion returns the committed image `id`, `contentType`, `size`, `width`,
`height` and `createdAt`. Permanent object keys, storage credentials and internal
cleanup status are not exposed. Temporary deletion failures do not invalidate
the accepted permanent image or its metadata.

Missing temporary objects return 404, rejected images return 400 with a validation
message, and storage/persistence failures return 503 with a sanitized message.
Malformed upload UUIDs use FastAPI's standard 422 validation response. An unset
storage configuration returns 503 without disabling unrelated application APIs.
These routes follow the existing domain API authentication baseline; this slice
adds no session enforcement or authorization policy.

Angular's `RecipeImageService.upload(file)` coordinates start, raw-byte PUT
and completion, validates API responses against the generated contract and returns
the persisted metadata. It propagates failures and performs no automatic retry.
Completion is not idempotent: an ambiguous failure must not trigger an automatic
repeat. The Basis editor uses this service when saving a selected PNG.

## Image download access

`GET /api/recipe-images/{imageId}/download` returns `url` and `expiresIn`
(300 seconds). It resolves the persisted image ID to its private object key and
signs a GET URL without reading or inspecting the object. Missing metadata returns
404; missing storage configuration or signing failures return a sanitized 503.
Malformed UUIDs return 422. A missing object behind existing metadata is detected
when the browser requests the signed URL, not when the URL is issued.

Successful instruction responses and explicit 404/503 errors use
`Cache-Control: no-store`. This prevents storage of the URL response by compliant
browsers and intermediary caches. It does not disable caching of image bytes or
revoke bytes already downloaded when the URL expires. Images have immutable keys;
replacement uses a new identity. Keep signed URLs out of logs and persistent state.

Angular's `RecipeImageService.download(imageId)` requests and validates
fresh instructions on every call, without caching, retrying or downloading image
bytes. The editor requests a URL when loading an existing image, shows the neutral
placeholder on failure and offers an explicit retry that obtains a fresh URL.
Loaded image bytes remain visible after URL expiry; no timer or automatic retry
is needed for this editor flow. No authorization policy or session enforcement is added here.

## Basis image editing

The shared create/edit editor previews the saved image or
`assets/images/recipe-image-placeholder.png` below Name. The pencil selects a static PNG;
the adjacent trash action removes the image from the pending recipe save. Images
fit within a stable area without cropping. Selection previews use local object
URLs, released on replacement, removal or editor destruction.

File selection checks PNG type and the 10 MiB byte limit locally; the backend
enforces all limits, including full decoding, static PNG and 4096 pixels per side.
An invalid selection blocks Save until replaced or explicitly discarded. Selecting
a file does not upload it. After form validation, Save uploads and validates it
before submitting the recipe with its image ID. Controls are unavailable during
upload/save. Upload failure leaves entered data and the pending image in place for
explicit retry. A successful upload is reused if recipe saving subsequently fails.

Cancelling file selection keeps the preview. Closing the dialog before the recipe
write leaves the saved recipe unchanged; an upload already in flight may finish but cannot trigger a
recipe save after closing begins. Such unattached uploads, and images abandoned
after a failed recipe save, remain for the deferred cleanup slice. No automatic
upload or recipe-write retries are introduced. While the recipe write itself is
pending, closing is unavailable; a failed save restores the close action.

## Recipe image associations

Recipe responses include a required nullable `imageId`; object keys and expiring
download URLs are not part of the recipe contract. Recipe create, active-edit,
draft-create and draft-update requests accept an optional nullable `imageId`:

- Omitted: keep the draft's image on update, or inherit the active version's image
  when creating a version. A new lineage, or a lineage without an active version,
  has no image to inherit.
- UUID: select an existing validated image metadata record. Unknown IDs return
  404 and malformed UUIDs return 422; the recipe save does not commit.
- `null`: save the version without an image.

Draft publication preserves the draft's image. Historical versions keep their
existing references. AI proposal saves inherit the specific source version's image,
including a draft or historical source with no image. Multiple versions can share
the same immutable image without duplicating stored bytes. The editor carries its
loaded version's image ID, including explicit `null`, through existing save actions.
AI presentation payloads remain unchanged.

The nullable foreign key is added by migration `20261015_12`; existing recipe
versions start without images. PostgreSQL rejects deletion of referenced image
metadata. Replacing/removing references, discarding drafts and deleting lineages
leave image metadata and objects for the deferred cleanup slice. No storage access
is required for recipe writes that keep/remove an image or reads of recipe metadata.
## Deferred storage cleanup

Scheduled storage cleanup is explicitly deferred. Remaining tasks are:

- Delete abandoned temporary uploads and temporary objects left by failed immediate cleanup.
- Delete validated but unattached images after cancelled or failed recipe saves.
- Delete unreferenced image metadata and objects after replacement, removal, draft discard or recipe deletion, and permanent objects left by failed persistence cleanup.

Any future cleanup must preserve images referenced by active, draft or historical
versions and handle concurrent attachment safely. Retention intervals, scheduling,
retry behavior and coordination of database and object deletion are not yet
defined. Existing immediate cleanup attempts remain unchanged; unused objects
can accumulate until the deferred work is implemented.

## Detail-page image display

Active, draft and historical detail pages display the viewed version's image above
the ingredients card, outside the shared presentation used by AI artifacts. The
existing title, version badge, preparation time, servings and nutrition stay in
place. Images fit a stable area without stretching or cropping; missing images
use `frontend/src/assets/images/recipe-image-placeholder.png`.

The image component requests fresh download instructions when its image ID changes
or the user explicitly retries after an access or image-loading failure. Loading shows a centered Material spinner. Failures
show centered text above a retry button, separated by a 0.5rem gap. Stale responses and responses after view
destruction are ignored. There is no automatic retry or expiry timer: URL expiry
does not remove an already displayed image.

Grid cards reuse this image component in natural-height mode: images and the
placeholder fill the existing content width and retain their aspect ratio without
cropping. Loading and failure states reserve 12rem of height. The existing grid
resize observer handles image-driven card height changes. Names, preparation
time, badges and links retain their existing layout. Retry clicks prevent link
navigation. Authorization changes remain deferred.

## Verification

Run the regression checks without PostgreSQL from the repository root (upload
tests use isolated in-memory SQLite databases):

```sh
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests -p test_storage_adapter.py
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests -p test_recipe_image_uploads.py
```

On Windows, use `backend/.venv/Scripts/python.exe` and set `PYTHONPATH=backend`
in the shell. The normal backend pytest suite includes these checks too, and
requires its dedicated test database.

After building the backend image with the locked dependencies, verify the adapter
against the running local stack from the repository root:

```sh
docker compose -f deployment/docker-compose-local.yml run --rm --no-deps \
  -v "$PWD/backend/tests:/checks:ro" \
  -e PYTHONPATH=/app \
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

After rebuilding with the locked Pillow dependency and applying database migrations,
use the same Compose verifier
command with `/checks/verify_recipe_image_uploads.py` to check upload completion.
It verifies PNG metadata, byte-identical permanent downloads, immediate temporary
deletion, invalid-image rejection, and permanent-image isolation when the original
temporary PUT URL is reused. It also checks committed metadata through a separate
database session and removes its own metadata records and test objects on completion.
The storage and validation flows previously passed against local Garage and the
local gateway; the added metadata persistence check requires a migrated database.
Staging and production verification remain pending.

After deploying the current backend, run the same Compose verifier command with
`/checks/verify_recipe_image_api.py` to exercise the upload and download endpoints through the
gateway, direct PUT to Garage, committed metadata, identical permanent bytes,
invalid PNG rejection and immediate temporary cleanup. It also checks no-store
download instructions, byte-identical signed downloads and denied unsigned access.
It removes only its own
test records and objects. API/metadata verification passed locally on 2026-10-15
after rebuilding the backend and applying pending migrations. The frontend upload
service has controlled HTTP tests for sequencing, contract validation and failures
without retry; these do not establish live browser/UI readiness. Download access
and the extended gateway verifier passed locally on 2026-10-15 after rebuilding
the backend; startup applied pending application migrations through `20261015_12`.

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
