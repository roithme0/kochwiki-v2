# Foodstuff Images

## Status

Concept direction agreed. Images replace placeholders in recipe-editor ingredient rows, picker results, and basket previews, and replace the catalogue table's leading nutrition chart. Uploads accept static PNG only, up to 10 MiB and 4096 pixels per side. Replacements affect subsequent reads of the foodstuff, including its appearance in historical recipes. A shared image module owns metadata, validation, and transfers; foodstuff images use their own bucket alongside the recipe-images bucket. Compact thumbnails show the placeholder while loading or after failure; explicit fresh-URL retry is available in the editor. Remaining technical choices are recorded below. This concept does not authorize implementation, configuration changes, or deployment.

## Goal

Make foodstuffs recognizable through one optional, manually supplied image. Reuse the recipe-image upload and save behavior and replace the temporary foodstuff placeholders in the recipe editor and selection dialog.

## Current Context

Recipe images use private Garage storage through the same-origin `/storage/` gateway. Upload start issues a five-minute temporary PUT URL. Completion validates static PNG bytes, a maximum of 10 MiB, and dimensions up to 4096 pixels per side, then writes immutable permanent bytes and commits metadata before returning an image ID. Download access returns a five-minute signed URL with a non-cacheable instruction response. Completion is not idempotent and clients do not retry automatically.

The recipe editor previews selections locally and uploads only on Save after form validation. Successful uploads are reused after a failed recipe save. Replacement and removal change the pending reference; cancellation preserves saved data. Both recipe and foodstuff editors now block dialog dismissal during upload and the domain write. A forced programmatic close or destruction prevents a subsequent domain write. Saved-image failures offer explicit fresh-URL retry. Scheduled cleanup remains deferred.

Shared image metadata and limits now live in `app.images`, and the storage adapter
requires explicit bucket selection. Both buckets are configured and provisioned
through the existing initializer. The third slice shares validation and transfers
behind domain-specific image routes. The fourth slice adds catalogue image
associations and their HTTP/MCP save semantics. The fifth slice adds foodstuff
form image editing and shared frontend transfers. A follow-up extracts common
component-scoped image editor state and aligns upload/save dismissal behavior. Catalogue and
ingredient/picker/basket thumbnails remain pending.

Foodstuffs are mutable catalogue records without version history. Recipe ingredients reference those records and responses embed current foodstuff summaries. Create and edit dialogs share `FoodstuffFormComponent`. The foodstuff catalogue uses a responsive table whose first column is a nutrition chart; there is no dedicated foodstuff detail page. `FoodstuffPresentationComponent` serves nutrition-only AI artifacts.

The recipe editor's ingredient rows, picker results, and basket previews currently use `question-mark.png`. The [ingredient-selection concept](2026-10-17-recipe-ingredient-selection.md) explicitly defers real foodstuff images to a follow-up. Its selection, ordering, search, and creation-handoff behavior remain the baseline.

## Proposed Direction

### Association and Save Behavior

Give each foodstuff one nullable stable image reference. Existing records start without images. Keep expiring URLs and object keys out of foodstuff payloads.

For creation, omission or null means no image. For updates, omission preserves the image, null removes it, and a validated image ID replaces it. Reject unknown image references without committing the foodstuff write. Image-only changes should not trigger semantic embedding refresh.

The agreed image association belongs to the catalogue foodstuff, with no separate image history. Replacing it affects subsequent reads wherever that foodstuff is used, including ingredients in historical recipe versions. Historical ingredient images are not frozen. Already open views need only update through their existing reload flows; live image synchronization is outside the proposal. A recipe version's own image remains independent.

### Editing

Follow the supplied form illustration: a `Basisdaten` card contains name and unit on one row, brand below, then a large contained image preview with remove and select/replace icon buttons at the lower right. A separate `Nährwerte` card contains calories followed by the three macros. Place a full-width create/save button below the cards. Preserve the application's existing theme and adapt the field rows to narrow screens. Use the existing foodstuff question-mark placeholder when no image is selected. Fit images without stretching or cropping and retain transparent backgrounds. Icon buttons need accessible labels; hide removal when there is no image to remove.

Carry over the recipe editor's local preview, upload-on-save, validation, failure preservation, and successful-upload reuse. Both recipe and foodstuff dialogs disable the close button, Escape, and backdrop dismissal throughout upload and the subsequent domain save. Disable duplicate submission and editing during that interval, show the current upload/save status, and restore controls after failure. Browser reload/tab closure is outside dialog dismissal control. File selection alone performs no upload. Cancelling a replacement file chooser preserves the current preview. Invalid selections block Save until replaced or explicitly discarded. Release local object URLs when no longer needed.

Creation from the ingredient picker uses the same form. Return the saved foodstuff including its image reference so its basket preview can display immediately without changing the current search or requiring another catalogue fetch. Cancelling the recipe still leaves independently created foodstuffs in the catalogue, as today.

### Display

Replace placeholders in recipe-editor ingredient rows, picker results, and basket previews. These display locations are agreed. Preserve their compact image areas, text labels, selection controls, and basket order. Use contained images rather than recipe-grid natural-height rendering.

Replace the catalogue table's leading macro chart with an image, following the recipe grid's image-first direction. Numeric nutrition columns retain their current responsive behavior. Removal of the chart, including at narrow widths, is agreed.

Compact thumbnails use `question-mark.png` when no image is supplied, while loading, and after download-instruction or image-loading failure. Preserve their existing dimensions without blocking ingredient selection. Do not add thumbnail retry buttons, loading spinners, or inline error text. Explicit fresh-URL retry remains available in the foodstuff editor, where loading and failure feedback can follow the recipe editor's behavior. This thumbnail behavior is agreed. Ignore stale async responses and responses after destruction. URL expiry alone does not require reloading already displayed bytes.

## Storage and Reuse Boundary

Reuse Garage, private storage, gateway signing, immutable object identities, byte validation, and the upload-completion-before-attachment sequence. The agreed foodstuff limits match recipes: static PNG only, at most 10 MiB, and dimensions from 1 to 4096 pixels per side. PNG-only selection restricts direct use of ordinary JPEG/HEIC phone photos; this limitation is accepted. Additional formats or client conversion remain outside this scope.

Use a shared image module for validated metadata, byte validation, upload completion, and download access. Recipe and foodstuff domains retain their own association and save rules. Foodstuffs must not depend directly on recipe-owned image services or duplicate the full validation and failure-handling implementation. A shared frontend transfer helper behind separate recipe and foodstuff image services is agreed. A component-scoped `ImageEditorState` service in `core/services` owns common selection validation, preview lifecycle, upload state, errors and completed-upload reuse. Both editors follow the same behavior at this level; domain save payloads and version/catalogue rules remain with their respective editors. Dialogs enforce the same upload/save dismissal policy. Compact foodstuff rendering can differ from recipe rendering. Avoid a general media framework.

Store foodstuff images in a private `foodstuff-images` bucket alongside the existing private `recipe-images` bucket in each environment's Garage instance. Sharing the image module does not merge buckets. Temporary uploads and permanent objects must use the bucket selected for their domain. Backend-controlled upload context and persisted metadata must retain enough storage identity to complete uploads and resolve downloads to the correct bucket; callers do not supply arbitrary bucket names or object keys. Foodstuff associations must accept foodstuff images, and recipe associations must accept recipe images.

Adapt the existing explicit bucket-provisioning mechanism and storage configuration for the second bucket during implementation. Preserve existing recipe image IDs, objects, references, and version behavior when moving metadata responsibilities into the shared module. No movement of recipe bytes to another bucket is needed. Concrete schema migration and route design remain implementation details; the shared module does not itself require renaming existing recipe API routes. Any broader refactor or build/tooling configuration changes require separate confirmation under repository guidance.

Retain the existing deferred cleanup boundary for this proposal. Removing/replacing an association or deleting a foodstuff must not immediately delete bytes that may still be referenced. Future cleanup must consider all image consumers and concurrent attachment. Abandoned uploads and unattached permanent images can continue to accumulate until cleanup is implemented.

## Integration Impact

Evolve backend schemas, generated frontend contracts, and frontend consumers together. Foodstuff list/detail responses and embedded ingredient summaries need image identity for the selected display scope. Review explicit summary construction, catalogue refresh, pending basket records, and foodstuff creation results rather than assuming an added ORM field flows through automatically.

Review HTTP and MCP create/update/read paths together so omitted image fields preserve existing associations. Existing AI foodstuff/recipe presentation payloads remain unchanged: adding images to ordinary domain summaries must not implicitly add them to artifact contracts or send image bytes/access URLs to the AI Service.

Meaningful later verification includes invalid upload/reference rejection, omitted/null/replacement behavior, failed-save preservation, blocked recipe and foodstuff dialog dismissal during upload/save, upload reuse, create-from-picker handoff, embedded summary propagation, and thumbnail fallback without selection changes. A forced close must prevent subsequent domain writes in both editors. Also verify correct bucket routing through upload completion and download, rejection of cross-domain image associations, and preservation of existing recipe image IDs and references through the metadata migration. No application code was changed or executed to verify the proposed behavior during concept discovery.

## Scope Boundaries

Include optional manual image selection, preview, upload, replacement/removal, persistence, and the agreed foodstuff display locations. Exclude foodstuff versioning, galleries, AI image generation, image import, nutrition-label extraction, thumbnail generation, new detail pages, search changes, and broader catalogue performance work. New ownership rules and a domain authorization rollout are separate concerns; existing private-storage behavior remains the baseline.

## Successive Delivery

Work proceeds through narrow slices. Discuss and agree on each slice's scope and acceptance criteria before implementation, then validate and review it before selecting the next slice. Agreement on this concept does not authorize all slices at once.

### First Slice: Shared Metadata and Explicit Storage Routing

Authorized and implemented on 2026-10-17. The shared metadata boundary and explicit storage bucket selection are in place, preserving the recipe-image flow before adding foodstuff uploads or UI. Validation and review results are recorded below; subsequent slices still require their own agreement.

Validated image metadata lives in an `app.images` module with a shared `ImageAsset` model and shared image limits. Migration `20261017_13` renames the existing `recipe_image` table to `image_asset`, preserving every image UUID, metadata value, and recipe-version reference. It adds a required, constrained image kind (`recipe` or `foodstuff`), backfilling existing records as `recipe`. The kind identifies the logical bucket; deployment configuration resolves the physical bucket name. Object-key uniqueness is enforced within each kind so objects in separate buckets can have the same key.

Update existing recipe upload, download, association checks, and model registration to use the shared model. Recipe upload completion records kind `recipe`; recipe-specific download and attachment paths reject foodstuff-kind IDs. Preserve recipe API routes, response schemas, validation limits, immutable object keys, and version inheritance behavior. Moving the upload-validation service and its internal result types into the shared module is a later slice; only the metadata dependency moves now.

Make bucket selection an explicit backend-only argument when constructing the storage adapter instead of selecting `bucket_recipe_images` inside it. Update all existing callers and verification helpers to pass the configured recipe bucket. Exercise a second bucket through controlled adapter tests. Keep existing runtime settings and deployment definitions unchanged in this slice: actual `foodstuff-images` provisioning, its setting and credentials are a subsequent slice. This is preparation for two-bucket operation, not evidence that the second bucket exists or is usable.

Acceptance criteria:

- A PostgreSQL migration check seeded with existing metadata and a referencing recipe version preserves IDs, metadata, and the foreign key; deletion of referenced metadata remains rejected.
- Existing images acquire kind `recipe`; unsupported kinds are rejected. Identical object keys across kinds are allowed, while duplicates within one kind are rejected.
- Recipe attachment and download reject foodstuff-kind image records, including records inserted only as test fixtures. Recipe image omission, removal, replacement, and version inheritance retain existing behavior.
- Controlled storage tests verify explicit bucket selection for PUT/GET signing and internal read, write, inspect, and delete operations, including encoded paths and two distinct buckets.
- Existing upload validation and persistence-failure regressions, image API/association checks, and the backend suite pass against dedicated test storage. Verify that generated OpenAPI remains unchanged; no frontend source edits are expected.

Review the migration and bucket routing together after validation. Report PostgreSQL or live-storage checks that cannot run as incomplete validation. Do not apply the migration to the running application database or redeploy services as part of this slice. No object movement, live-data reset, foodstuff association/API, second-bucket provisioning, cleanup scheduling, or frontend work is included.

Validation: the complete backend suite passed against dedicated test PostgreSQL (355 tests and 202 subtests). The migration regression checks existing metadata and recipe references, deletion protection, kind constraints, per-kind uniqueness, and safe downgrade refusal while foodstuff records exist. Controlled storage tests cover both bucket destinations. No live Garage transfers or application migration/deployment were performed for this slice.

The exported OpenAPI document remains byte-identical. `npm run check:kochwiki-contract` fails on generated TypeScript byte comparisons because the worktree uses CRLF and fresh output uses LF. Independent regeneration from the unchanged OpenAPI confirms all three generated TypeScript files match after newline normalization. This is a failed exact contract check, not a passing command; generated frontend files and tooling were left unchanged.

### Second Slice: Foodstuff Bucket Provisioning and Configuration

Authorized and implemented on 2026-10-17, including deployment configuration edits. The private `foodstuff-images` bucket is defined beside `recipe-images` in the existing initializer, and its name is supplied to the backend in local, staging, and production definitions. No foodstuff upload routes, associations, frontend work, or further extraction of validation services is included.

Sharing the existing environment-specific application key across both buckets is agreed and configured. Both belong to the same backend and share its trust boundary; separate credentials would add configuration and rotation work without separating the running process. Separate buckets provide explicit storage organization, and image-kind checks remain responsible for preventing cross-domain attachment. Existing recipe credentials and grants are preserved.

Add `STORAGE_BUCKET_FOODSTUFF_IMAGES` to backend storage configuration, require distinct recipe and foodstuff bucket names when storage is enabled, and resolve `ImageKind` to the corresponding configured bucket through a small shared-image helper. Keep the adapter's explicit bucket argument. Update Compose definitions, environment examples, and operational documentation together. Storage-disabled startup remains supported; partial enabled configuration should fail clearly without exposing secrets. No temporary compatibility mode for old enabled configuration is proposed; configuration and backend changes must ship together.

Acceptance criteria: repeated initialization preserves objects and keys in both buckets; signed PUT/GET through the gateway reaches the intended bucket with byte-identical results; unsigned listing/read/write remains denied; backend tests cover kind-to-bucket routing, missing configuration, and accidental duplicate bucket names; all three Compose definitions validate; existing recipe storage checks and backend regressions pass.

Validation passed using isolated Garage/gateway fixtures with synthetic credentials: both buckets accept the shared key, preserve distinct bytes under identical object keys, reject unsigned access, and retain objects through repeated initialization, restart, and container recreation. Existing signature rejection, separate-key isolation, and log/port checks also passed. All three Compose definitions validated. The complete backend suite passed against dedicated test PostgreSQL (357 tests, 209 subtests). No frontend sources or API schemas changed.

The running application stack, its ignored secrets, and staging/production services were not modified. Preparing their definitions and verifying isolated fixtures does not establish rollout to those environments. Existing enabled backend configurations must add `STORAGE_BUCKET_FOODSTUFF_IMAGES` with the backend update. The isolated verifier stops its containers and retains its test volumes, following the existing fixture lifecycle.

### Third Slice: Shared Transfers and Foodstuff Image Endpoints

Authorized, implemented, and reviewed on 2026-10-17. Domain-specific HTTP routes
share PNG validation, upload completion, metadata persistence, download access,
and storage dependency construction in `app.images`. Recipe routes, response
shapes, existing object-key prefixes, transaction handling, and immediate cleanup
behavior are preserved.

Add foodstuff upload-start, completion, and download endpoints matching the recipe
flow. Backend-selected image kind determines the bucket, temporary/permanent key
prefixes, and persisted metadata kind. Download rejects images of the other kind;
completion through the other domain must not consume the original upload.
Callers cannot select arbitrary kinds, buckets, or object keys. Generate frontend
contracts with the backend changes; foodstuff associations and UI remain later
slices. Completed foodstuff images remain unattached under the accepted deferred
cleanup boundary.

Acceptance covers existing recipe regressions, foodstuff validation and committed
metadata, bucket routing and cross-domain rejection, storage/database failures,
and generated contracts. Review the extraction for preserved transaction and
failure behavior. No application deployment or database migration is included.

Validation: the complete backend suite passed against dedicated test PostgreSQL
(386 tests, 218 subtests). Existing upload and API tests moved to `tests/images`
and now exercise both kinds, retaining validation and ambiguous-commit/cleanup
regressions. Route-to-adapter tests use real S3 signing with stubbed internal S3
operations and distinct configured bucket names. They verify wrong-domain
completion leaves the source upload usable, permanent bytes and metadata reach
the source domain, consumed uploads return 404, and cross-kind downloads are
rejected. All existing OpenAPI routes and schemas compare unchanged; exactly
three foodstuff image routes and their response schemas were added.

Generated frontend contracts are current, including a passing exact contract
check. Frontend formatting checked no handwritten files; lint, all 13 tooling
tests, and all 599 Angular tests passed. The backend emitted existing Alembic
configuration deprecation warnings; Angular emitted jsdom canvas notices.
No new live Garage/API gateway verification or application deployment was
performed in this slice. Foodstuff images can be uploaded and downloaded but
remain unattached until the association slice; orphan cleanup remains deferred.

### Fourth Slice: Foodstuff Associations and Save Semantics

Authorized, implemented, and reviewed on 2026-10-17. Attach completed foodstuff images to mutable catalogue
entries through a nullable foreign key. Existing entries start without images.
Creation omission/null means no image; update omission preserves, null removes,
and a validated foodstuff-kind ID replaces. Reject missing and recipe-kind IDs
without committing any foodstuff changes. HTTP and MCP use the same service.

Return required nullable `imageId` in foodstuff outputs and summaries, including
semantic search results and embedded recipe ingredients. Historical recipe reads
resolve the current catalogue image, independently of each recipe version's own
image. Image-only changes do not trigger semantic embedding refresh. Generate
frontend contracts and adapt existing consumers/fixtures together; image editing
and rendering remain later slices.

Keep AI presentation payloads unchanged. Temporary proposal foodstuff definitions
use the existing name/unit/brand/nutrition base fields; materialization explicitly
converts those fields to catalogue creation input. Image-bearing catalogue
summaries explicitly exclude image identity when resolving proposal presentations.
Removal, replacement and foodstuff deletion retain image metadata and bytes under
the existing deferred cleanup boundary.

Acceptance covers migration preservation and deletion protection, omitted/null/
replacement behavior, invalid and cross-kind rejection, failed-write rollback,
HTTP/MCP parity, current images in historical recipes and search, no embedding
refresh for image-only updates, unchanged artifact payloads, and generated frontend
contract validation. No application migration, deployment, image UI, cleanup or
build/tooling configuration changes are included.

Validation: the complete backend suite passed against dedicated test PostgreSQL
(399 tests, 218 subtests). Migration `20261017_14` preserves existing records with
null image references and protects referenced metadata. Regression tests cover
HTTP/MCP association rules, malformed/unknown/cross-kind references, rollback
after flush, metadata retention, current images in historical recipes and search,
embedding refresh behavior, and unchanged AI artifact payloads. Frontend
formatting, lint, all 13 tooling tests and all 610 Angular tests passed, along with
the exact generated-contract check. Review confirmed the frontend field-label
type excludes image identity until image editing/display is introduced.

Existing Alembic configuration deprecation warnings and jsdom canvas notices
remain. No migration was applied to the running application database, and no
deployment or new live Garage/gateway checks ran. Foodstuff image UI and orphan
cleanup remain pending.

### Fifth Slice: Foodstuff Form Image Editing

Authorized, implemented and reviewed on 2026-10-17 with the supplied form layout,
blocked foodstuff dialog dismissal throughout upload/save, and a shared frontend
transfer helper behind domain-specific image services.

Deliver image preview, selection/replacement, removal, and saved-image retry in
the shared create/edit form, including creation from the ingredient picker.
Upload only after valid submission, preserve pending values after failure, and
reuse a completed upload when retrying a failed foodstuff save. Limit recipe
changes to the shared transfer extraction and practical validation/preview reuse,
preserving recipe domain save semantics. The shared-state follow-up below aligns
image editing and dialog dismissal behavior across both domains.

Acceptance covers create/edit success, image removal, failed-save retry without
another completed upload, blocked close/Escape/backdrop dismissal while busy,
controls restored after failure, stale-response handling and object-URL release,
picker creation returning the saved image reference, and recipe regressions.
Catalogue and ingredient/picker/basket thumbnails, caching, deployment, and
build/tooling configuration changes remain outside this slice.

`ImageTransferService` lives in frontend `core/services`, following the core
module's technical folder structure. It shares start/PUT/completion and fresh download instructions
with domain-specific generated response validators. Common preview and upload
state now lives in the component-scoped `ImageEditorState` service. Dialogs own
domain saves and enforce the common closing policy. Existing caller dismissal
settings are restored after failure. The edit dialog waits for
the loaded record and shows loading/error feedback rather than an empty form.

Validation: formatting, lint, all 13 tooling tests and all 640 Angular tests pass,
including parameterized recipe/foodstuff HTTP transfer checks and real-dialog
tests for blocked close/Escape/backdrop dismissal, upload/save failure recovery,
completed-upload reuse and cancellation before submission. Form tests cover
selection validation, removal, preserved references, cancelled replacement
selection, fresh access retry, stale responses and object-URL release. The exact
generated-contract check passes.

After the user requested a local backend rebuild for browser review, only the
local backend service was rebuilt/recreated. Its normal startup applied migrations
through `20261017_14`; the running foodstuff API now includes `imageId`. Browser
review verified create/edit rendering and the 390-pixel phone layout without
writing catalogue records. Automated file selection was blocked by the browser
extension's file-URL access setting, so no live upload/save was verified. No
storage provisioning, staging/production deployment, cleanup or configuration
changes were performed. Existing jsdom canvas and npm configuration notices remain.

### Fifth Slice Follow-up: Shared Image Editor State

Authorized, implemented and reviewed on 2026-10-17. Recipe and foodstuff image
editing share validation, pending reference state, local previews, object-URL
cleanup, download access/retry, stale-response protection, upload errors and
completed-upload reuse in `core/services/image-editor-state.service.ts`.
Each editor provides its own service instance and connects its domain image
client, loaded image ID and submission signal through a small typed interface.
No selection or pending upload state is shared between editor instances.

Behavioral alignment is explicitly agreed. Both domains block close, Escape and
backdrop dismissal during upload and save, disable editing/repeat submission,
retain selections and values after failure, restore the caller's prior dismissal
settings, and allow cancellation before submission. Forced programmatic closing
or destruction suppresses subsequent domain writes. Recipe uploads therefore no
longer allow ordinary dialog cancellation while in flight. Layout and domain
association/version rules remain separate.

Validation passed formatting, lint, all 13 tooling tests and all 652 Angular tests.
The existing real-dialog tests moved from the foodstuff domain into a shared test
suite and now cover recipe and foodstuff create/edit flows with the same blocked
dismissal, retry, invalid-selection save blocking and cancellation assertions. Existing component regressions are
retained. New service tests verify isolation between simultaneous editors and
source-image removal invalidating a pending download. No backend, deployment or
build/tooling configuration changes were needed for this follow-up. Browser file
selection remains unverified under the extension limitation recorded above.

### Development Storage Routing Follow-up

Approved on 2026-10-17. Both domain clients use the shared transfer service to
convert signed storage URLs to same-origin `/storage/...` paths without changing
the encoded path or signature query. Angular proxies storage requests to the
local gateway, replacing Host with the gateway target used by the signer. This
keeps upload PUTs and image downloads on the browser's app origin and avoids the
rejected cross-origin upload preflight. Backend signing and storage configuration
remain unchanged. The development proxy target must match `STORAGE_PUBLIC_ORIGIN`;
proxy configuration changes require restarting the development server.

Verified through a temporary Angular server on port 4203: both buckets accepted
signed PNG uploads and completion, returned identical bytes through signed
same-origin downloads, and rejected unsigned downloads. Existing domain records
were unchanged. Formatting, lint, 13 tooling tests and 660 Angular tests passed.
The running server on 4202 needs a restart to load the new proxy configuration.

## Remaining Technical Choices

No blocking product questions remain. During implementation, decide whether repeated visible references should share download instructions. The current recipe service fetches fresh instructions on every call; caching and request coalescing are not existing guarantees. Any sharing must respect URL expiry, image replacement, and explicit fresh-URL retry. This does not expand scope into broader catalogue performance work.

## Risks

Large originals rendered as small thumbnails can cost bandwidth and trigger many signed-URL requests in the unfiltered picker. Avoid claiming thumbnail optimization or catalogue scalability without implementing and measuring it. Repeated images do not replace textual identification, especially in the basket.

Catalogue-level changes do not preserve historical ingredient appearance. PNG-only parity is simpler but less convenient for direct phone photography. Moving recipe metadata into the shared module requires care to preserve existing IDs and references; storage routing must consistently distinguish the two buckets. Cleanup remains an existing storage-growth limitation.
