# File storage

Local, staging, and production Compose deployments each run a `file-storage` service using their own pinned
`dxflrs/garage:v2.4.1` instance with private `recipe-images` and `foodstuff-images`
buckets sharing the environment's application credentials. This slice
provides storage infrastructure and a backend adapter for presigned upload/download
URLs, object inspection and deletion, plus PNG validation and metadata persistence.
Upload-start/completion endpoints and a typed frontend service expose the upload
flow. Recipe versions can reference validated images, and a download endpoint issues
short-lived access URLs. Basis image editing, detail-page display and grid image display are available.

Foodstuff upload-start, completion, and download endpoints use the shared image
transfer implementation and their own bucket. Foodstuff record associations and
shared create/edit form image editing are available. Catalogue and
ingredient/picker/basket thumbnails remain pending.

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
docker compose -f docker-compose-local.yml exec file-storage /garage bucket info foodstuff-images
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

Both image buckets deliberately use the same `GARAGE_ACCESS_KEY_ID` and
`GARAGE_SECRET_ACCESS_KEY`. No additional secrets or credential rotation are
needed when adding `foodstuff-images`; the initializer grants the existing key
read/write access without replacing its recipe-bucket grants or objects.

To add another bucket, add an entry to `buckets.json` using the same fields as
`recipe-images`: `name`, `access_key_id_env`, and `secret_access_key_env`.
The last two fields name environment variables, not secret values. Reuse existing
credential variables for a shared application key, as the two image buckets do.
If using a separate key, supply its credentials through each environment's `.env`
and forward those variables in the `file-storage-init` service's `environment`
section in all three Compose files.
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
`STORAGE_REGION=garage`, `STORAGE_BUCKET_RECIPE_IMAGES=recipe-images`,
`STORAGE_BUCKET_FOODSTUFF_IMAGES=foodstuff-images`, and the configured
`STORAGE_PUBLIC_ORIGIN`. The backend receives no Garage administration credentials.
For a backend outside Compose, supply these seven `STORAGE_*` settings directly in
its environment or ignored `.env`. All seven are required together; leaving all seven
absent disables storage configuration. Both addresses must be HTTP(S) origins
without paths, queries, fragments or embedded credentials. The two bucket names
must differ. Existing enabled deployments must add the foodstuff bucket setting
together with the backend update; there is no fallback to the recipe bucket.

`Settings.storage_config` supplies the strictly typed configuration to
`app.infrastructure.storage.storage.Storage`. The adapter uses boto3 with explicit credentials,
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

### Angular development proxy

The shared frontend image transfer service converts signed upload and download
URLs to same-origin `/storage/...` paths, preserving the encoded path and query.
The Angular development proxy forwards this route unchanged to
`http://localhost:8002`, with `changeOrigin: true` so Garage receives the gateway
Host and port used by the signer. `STORAGE_PUBLIC_ORIGIN` must match that proxy
target during development. In deployed environments the browser and gateway use
the configured public origin directly. Neither flow needs browser CORS access.

Restart `ng serve` after changing `proxy.conf.cjs`; rebuilding the backend is not
required. Proxying `/api/**` alone does not proxy an absolute storage URL returned
in an API response. Sending that URL directly from port 4202 bypasses Angular and
causes a cross-origin PUT preflight, which private storage rejects.

Verified on 2026-10-17 through a temporary Angular development server on port
4203: signed PNG PUT, completion, signed GET with identical bytes, and denied
unsigned GET passed for both recipe and foodstuff buckets. The server on port
4202 still requires a restart to load the new proxy route. Verification created
two unattached 2-by-2 PNG assets without changing existing domain records. Frontend
formatting, lint, 13 tooling tests and all 660 Angular tests passed; transfer tests
cover same-origin upload/download routing and preservation of encoded signatures.

User-level authorization remains outside this slice. Private buckets and signed
URLs do not implement recipe ownership or permissions.

## Shared image transfers

`app.images.transfers.ImageTransfers` implements validation, persistence, and
download access behind domain-specific HTTP routes. Recipe and foodstuff services
attach its persisted image IDs separately. Construct
it with the domain's storage adapter, a SQLAlchemy session factory (normally
`SessionLocal`), and an explicit backend-selected `ImageKind`.
`begin()` returns an upload UUID and a 300-second presigned PUT transfer for
`recipe-image-uploads/<uuid>` or `foodstuff-image-uploads/<uuid>` in the selected
domain bucket. The caller transfers bytes, waits for upload success,
then explicitly calls `complete(upload.id)`; no Garage event is required.

Completion reads at most 10 MiB plus one overflow-detection byte and validates
PNG chunk integrity and full pixel decoding with Pillow. Only static PNG is
accepted, with dimensions from 1 to 4096 pixels per side, inclusive. APNG is
rejected even with a single frame. Filename and declared MIME type are not trusted.
No resizing, re-encoding or metadata stripping is performed.

Accepted bytes are written unchanged to `recipe-images/<new-image-uuid>.png`
or `foodstuff-images/<new-image-uuid>.png` in that same domain bucket,
with `image/png` content type. The returned immutable result contains image UUID,
object key, size, dimensions, SHA-256, content type and UTC creation time. The
shared `image_asset` table persists these fields, with unique object keys per image
kind and database constraints for format and size limits. Completion returns success
only after the metadata transaction commits. Recipe writes attach the validated
image ID separately. Completion never copies the temporary object after validation: a concurrent upload cannot change
the bytes being promoted. The service never issues PUT URLs for permanent keys.

After successful promotion or invalid-image rejection, completion attempts to
delete the temporary object. `cleanup_pending` on the result or
`InvalidImage` reports a failed deletion without hiding the validation
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

Foodstuff routes expose the same flow and response fields through
`POST /api/foodstuff-image-uploads` and
`POST /api/foodstuff-image-uploads/{uploadId}/complete`. They select the foodstuff
bucket and persist kind `foodstuff`; recipe completion persists kind `recipe`.
Completing an upload through the other domain returns 404 for the absent upload
in that domain, without consuming the original. Generated frontend contracts
include these routes, and the foodstuff create/edit form uses them on Save.

Missing temporary objects return 404, rejected images return 400 with a validation
message, and storage/persistence failures return 503 with a sanitized message.
Malformed upload UUIDs use FastAPI's standard 422 validation response. An unset
storage configuration returns 503 without disabling unrelated application APIs.
These routes follow the existing domain API authentication baseline; this slice
adds no session enforcement or authorization policy.

Angular's `RecipeImageService` and `FoodstuffImageService` use a shared
`ImageTransferService` for start, raw-byte PUT, completion and download access,
with each domain's routes and generated response validators. Upload returns
persisted metadata, propagates failures and performs no automatic retry.
Completion is not idempotent: an ambiguous failure must not trigger an automatic
repeat. The Basis editor uses this service when saving a selected PNG.

## Image download access

`GET /api/recipe-images/{imageId}/download` returns `url` and `expiresIn`
(300 seconds). It resolves the persisted image ID to its private object key and
signs a GET URL without reading or inspecting the object. Missing metadata returns
404; missing storage configuration or signing failures return a sanitized 503.
Malformed UUIDs return 422. A missing object behind existing metadata is detected
when the browser requests the signed URL, not when the URL is issued.

`GET /api/foodstuff-images/{imageId}/download` has the same response and cache
behavior. Each domain rejects image IDs of the other kind with 404 before signing.
The persisted key and backend-selected kind determine access; clients cannot
select arbitrary buckets or object keys.

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
`images/recipe-image-placeholder.png` below Name. The add-photo action selects a static PNG;
it becomes a pencil for replacement when an image is selected or attached.
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

Cancelling file selection keeps the preview. Both recipe and foodstuff dialogs
block close, Escape and backdrop dismissal during upload and the domain write.
A forced programmatic close or destruction prevents a subsequent domain save.
Unattached uploads and images abandoned after a failed save remain for the
explicitly deferred cleanup slice. No automatic upload or domain-write retries
are introduced. A failed upload/save restores the caller's prior dismissal policy
and the editor controls.

## Shared image editor UI

Recipe and foodstuff forms render `core/components/image-editor/ImageEditorComponent`,
passing their existing component-scoped image state and the domain placeholder.
Foodstuffs keep the question mark; recipes keep the empty dish. The shared preview
contains images without cropping at a responsive height of 12–22rem. Its bottom
action row keeps feedback beside the image controls within that stable area,
wrapping at narrow widths without adding a message below the controls. Feedback
has a surface background for readability over images.

Both editors use state-specific add/replace icons and labels, generic preview,
removal and error wording, and 0.75rem action spacing. Loading, access failures,
validation errors and upload progress share this row; retry and invalid-selection
dismissal appear with their messages. The file input and all image actions are
disabled during upload/save. Placeholder failures do not trigger actual-image
failure handling. Recipe fields remain inert during upload/save, while the image
feedback stays outside inert regions. Parent submission, dialog behavior and
existing domain-save feedback remain unchanged.

Verified on 2026-10-17: formatting, lint, 13 tooling tests and all 666 Angular tests
passed. Shared component tests cover both placeholders, file selection/removal,
failed-image retry, invalid-selection recovery and upload progress/failure.
Existing create/edit dialog tests verify inline upload feedback in both domains.
Browser review checked the create editors and their placeholders, including
390-pixel viewport bounds without horizontal overflow. Upload/error visual states
are covered by controlled tests; no new live browser upload was performed.

## Foodstuff image editing

The shared create/edit form has a `Basisdaten` card with name/unit, brand and a
contained image preview with remove/select/replace controls, followed by a
`Nährwerte` card and a full-width submit button. Narrow screens stack fields.
Absent or unavailable previews use the existing question-mark image. Saved-image
access failures offer explicit fresh-URL retry. PNG filename/MIME and size checks
run on selection; decoding, dimensions and static-PNG validation remain enforced
by the backend on upload completion.

Selection previews locally and uploads only after valid submission. Ordinary
edits omit `imageId`, removal sends null, and a completed replacement sends its ID.
Failed upload/save retains form values and the selection. A completed upload is
reused after a failed foodstuff save. Invalid selections block Save until replaced
or explicitly discarded. Local object URLs are released on replacement, removal
and destruction; late download/upload results cannot update a destroyed form or
cause a subsequent foodstuff write.

Both dialogs disable close, Escape and backdrop dismissal throughout upload/save,
disable editing and duplicate submission, and show the current operation. Failure
restores controls and the caller's original dismissal policy. Editing waits for
the catalogue record to load rather than exposing an empty form during loading
or after failure. Creation from the picker returns the saved record including its
image ID through the existing handoff; thumbnail rendering is a later slice.
Recipe and foodstuff editors share `ImageEditorState` from `core/services`,
provided separately by each component. It owns validation, pending image references,
local previews, cleanup, fresh access retry, stale-response protection and upload
reuse, using a typed domain client and the source/submission signals. Dialogs keep
domain writes and enforce the same upload/save dismissal policy. The recipe editor
now blocks ordinary cancellation during upload as the foodstuff editor does.

Validation on 2026-10-17 passed formatting, lint, all 13 tooling tests, all 640
Angular tests and the exact generated-contract check. Controlled tests cover both
domain transfer routes, blocked dialog dismissal, failed-save upload reuse,
failure recovery, cancellation before submission and preview lifecycle. Browser
review verified create/edit forms and a 390-pixel phone viewport after rebuilding
only the local backend and confirming migration `20261017_14`. File selection
automation was blocked by the extension's file-URL access setting; no live
upload/save or new Garage/gateway verification ran. No catalogue records were
written during review, and staging/production were not changed.

The shared-state follow-up passed formatting, lint, all 13 tooling tests and all
652 Angular tests. The former foodstuff dialog suite now lives in core and covers
both domains' create/edit flows, including upload/save dismissal, invalid-selection
save blocking and retry parity.
Existing component tests remain, with new service regressions for simultaneous
editor isolation and source-image changes during a pending download. No backend
or deployment changes were needed for this follow-up.

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

## Shared image metadata and bucket routing

Migration `20261017_13` renames `recipe_image` to `image_asset`, preserving image
IDs, metadata, and recipe-version foreign keys. `app.images.models.ImageAsset`
and shared image limits live in `app.images`. Every record has a required
`recipe` or `foodstuff` kind; existing records are backfilled as `recipe`.
Object keys are unique within each kind. Recipe completion always writes
recipe-kind metadata, and recipe attachment/download reject foodstuff-kind IDs.
Recipe HTTP routes and payloads remain unchanged. Downgrade refuses to proceed
while foodstuff-kind records exist.

The storage adapter requires an explicit backend-selected bucket:
`Storage(config, bucket=config.bucket_recipe_images)`. It no longer selects the
recipe bucket implicitly. `app.images.storage.image_bucket(config, kind)` maps
each image kind to its configured bucket. Both domains' image API dependencies use
this mapping. The shared metadata migration is verified against
dedicated test PostgreSQL. A user-requested local backend rebuild during foodstuff
form review on 2026-10-17 applied startup migrations through `20261017_14` to the
local application database. Staging/production rollout remains unverified.

Two-bucket provisioning and configuration were verified on 2026-10-17 using
isolated Garage/gateway fixtures with synthetic credentials. Both buckets accept
the existing shared key, retain distinct bytes at identical object keys, reject
unsigned listing/read/write, and preserve objects through repeated initialization,
restart, and container recreation. All three deployment definitions validated,
and the backend suite passed (357 tests, 209 subtests). The running application
stack and its secrets were not changed; application, staging, and production
rollout of the second bucket remain pending.

The shared transfer extraction and foodstuff image endpoints were verified on
2026-10-17 with the complete backend suite (386 tests, 218 subtests), including
PNG validation and persistence/cleanup failures for both kinds. Controlled
route-to-adapter tests verify configured bucket selection, wrong-domain upload
completion without consuming the source, and cross-kind download rejection.
Existing OpenAPI routes and schemas are unchanged; the generated frontend
contract check, lint, tooling tests, and Angular suite passed. These checks do not
establish live Garage/gateway operation of the new foodstuff endpoints.

## Foodstuff image associations

Migration `20261017_14` adds a nullable `foodstuff.image_id` foreign key to
`image_asset`. Existing foodstuffs start without images. PostgreSQL prevents
deletion of referenced metadata. Foodstuff HTTP and MCP writes share these rules:

- Creation: omitted or null `imageId` means no image.
- Update: omission preserves the current image; null removes it; a UUID replaces it.
- Unknown IDs and recipe-kind images are rejected before mutation (HTTP 404).
  Malformed UUIDs fail request validation (HTTP 422). Failed saves do not commit
  image changes or other foodstuff edits.

Foodstuff outputs and summaries include a required nullable `imageId`, including
semantic search results and embedded recipe ingredients. They contain no object
keys or signed URLs. Foodstuffs remain mutable: replacement changes subsequent
reads of historical recipe ingredients, while each recipe version's own image
remains independent. Image-only changes do not schedule embedding refresh.

AI presentation payloads exclude image identity. Temporary proposal foodstuff
definitions retain the name/unit/brand/nutrition fields through `FoodstuffFields`;
explicit catalogue creation and updates accept image IDs through their own schemas.
Removing/replacing an association or deleting a foodstuff retains metadata and
stored bytes for deferred cleanup. Association writes require no object-storage
request; completed metadata is the validation boundary.

Foodstuff form image editing is available; catalogue and ingredient/picker/basket
thumbnails remain pending. This migration is verified against dedicated test
PostgreSQL and was applied to the local application database during the
user-requested backend rebuild on 2026-10-17. Staging/production rollout is pending.

Association verification passed on 2026-10-17: 399 backend tests and 218 subtests,
including migration preservation, foreign-key protection, HTTP/MCP association
rules, rollback, historical recipe reads and current search results. Generated
contracts, frontend formatting and lint, 13 tooling tests and 610 Angular tests
passed. Existing Alembic deprecation warnings and jsdom canvas notices remain.
No application database migration, deployment or new live storage checks ran.

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
use `frontend/public/images/recipe-image-placeholder.png`.

The image component requests fresh download instructions when its image ID changes
or the user explicitly retries after an access or image-loading failure. The empty
plate placeholder remains visible while download instructions or image bytes load,
and after either fails. Failures offer a labelled refresh icon button in the lower
right corner, with a tooltip; the failure message remains available to screenreaders.
Retry clicks do not navigate a surrounding recipe link. Stale responses and responses after view
destruction are ignored. There is no automatic retry or expiry timer: URL expiry
does not remove an already displayed image.

Grid cards reuse this image component in natural-height mode: images and the
placeholder fill the existing content width and retain their aspect ratio without
cropping. Loading, failure and retry retain the area reserved by the image dimensions,
with a square fallback when dimensions are unavailable. The existing grid
resize observer handles image-driven card height changes. Names, preparation
time, badges and links retain their existing layout. Retry clicks prevent link
navigation. Authorization changes remain deferred.

## Verification

Run the regression checks without PostgreSQL from the repository root (upload
tests use isolated in-memory SQLite databases):

```sh
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests/infrastructure/storage -p test_storage_adapter.py
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests/images -p test_image_transfers.py
```

On Windows, use `backend/.venv/Scripts/python.exe` and set `PYTHONPATH=backend`
in the shell. The normal backend pytest suite includes these checks too, and
requires its dedicated test database.

After building the backend image with the locked dependencies, verify the adapter
against the running local stack from the repository root:

```sh
docker compose -f deployment/docker-compose-local.yml run --rm --no-deps \
  -v "$PWD/backend/tests:/checks/tests:ro" \
  -e PYTHONPATH=/app:/checks \
  -e STORAGE_VERIFY_CONNECT_ORIGIN=http://gateway:80 \
  backend python -m tests.infrastructure.storage.verify_storage_adapter
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
use the same Compose verifier command, replacing
`tests.infrastructure.storage.verify_storage_adapter` with
`tests.recipes.verify_recipe_image_uploads`, to check upload completion.
It verifies PNG metadata, byte-identical permanent downloads, immediate temporary
deletion, invalid-image rejection, and permanent-image isolation when the original
temporary PUT URL is reused. It also checks committed metadata through a separate
database session and removes its own metadata records and test objects on completion.
The storage and validation flows previously passed against local Garage and the
local gateway; the added metadata persistence check requires a migrated database.
Staging and production verification remain pending.

After deploying the current backend, run the same Compose verifier command with
`tests.recipes.verify_recipe_image_api` as the module to exercise the upload and download endpoints through the
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
