# Foodstuff Images

## Status

Concept direction agreed. Images replace placeholders in recipe-editor ingredient rows, picker results, and basket previews, and replace the catalogue table's leading nutrition chart. Uploads accept static PNG only, up to 10 MiB and 4096 pixels per side. Replacements affect subsequent reads of the foodstuff, including its appearance in historical recipes. A shared image module owns metadata, validation, and transfers; foodstuff images use their own bucket alongside the recipe-images bucket. Compact thumbnails show the placeholder while loading or after failure; explicit fresh-URL retry is available in the editor. Remaining technical choices are recorded below. This concept does not authorize implementation, configuration changes, or deployment.

## Goal

Make foodstuffs recognizable through one optional, manually supplied image. Reuse the recipe-image upload and save behavior and replace the temporary foodstuff placeholders in the recipe editor and selection dialog.

## Current Context

Recipe images use private Garage storage through the same-origin `/storage/` gateway. Upload start issues a five-minute temporary PUT URL. Completion validates static PNG bytes, a maximum of 10 MiB, and dimensions up to 4096 pixels per side, then writes immutable permanent bytes and commits metadata before returning an image ID. Download access returns a five-minute signed URL with a non-cacheable instruction response. Completion is not idempotent and clients do not retry automatically.

The recipe editor previews selections locally and uploads only on Save after form validation. Successful uploads are reused after a failed recipe save. Replacement and removal change the pending reference; cancellation preserves saved data. Closing during upload prevents a subsequent recipe write, while closing during the recipe write is disabled. Saved-image failures offer explicit fresh-URL retry. Scheduled cleanup remains deferred.

Several pieces are recipe-specific: `RecipeImage`, `RecipeImageUploads`, image routes and frontend service, the bucket setting, and the display component. The storage adapter selects `bucket_recipe_images` directly. Reusing this implementation requires an explicit boundary rather than merely adding an image field to foodstuffs.

Foodstuffs are mutable catalogue records without version history. Recipe ingredients reference those records and responses embed current foodstuff summaries. Create and edit dialogs share `FoodstuffFormComponent`. The foodstuff catalogue uses a responsive table whose first column is a nutrition chart; there is no dedicated foodstuff detail page. `FoodstuffPresentationComponent` serves nutrition-only AI artifacts.

The recipe editor's ingredient rows, picker results, and basket previews currently use `question-mark.png`. The [ingredient-selection concept](2026-10-17-recipe-ingredient-selection.md) explicitly defers real foodstuff images to a follow-up. Its selection, ordering, search, and creation-handoff behavior remain the baseline.

## Proposed Direction

### Association and Save Behavior

Give each foodstuff one nullable stable image reference. Existing records start without images. Keep expiring URLs and object keys out of foodstuff payloads.

For creation, omission or null means no image. For updates, omission preserves the image, null removes it, and a validated image ID replaces it. Reject unknown image references without committing the foodstuff write. Image-only changes should not trigger semantic embedding refresh.

The agreed image association belongs to the catalogue foodstuff, with no separate image history. Replacing it affects subsequent reads wherever that foodstuff is used, including ingredients in historical recipe versions. Historical ingredient images are not frozen. Already open views need only update through their existing reload flows; live image synchronization is outside the proposal. A recipe version's own image remains independent.

### Editing

Add a contained preview with selection/replacement and removal controls to the shared foodstuff form. Recommend placing it after name/unit and brand, before nutrition. Use the existing foodstuff question-mark placeholder when no image is selected. Fit images without stretching or cropping and retain transparent backgrounds.

Carry over the recipe editor's local preview, upload-on-save, validation, failure preservation, successful-upload reuse, and close-during-upload safeguards. File selection alone performs no upload. Cancelling a replacement selection preserves the current preview. Invalid selections block Save until replaced or explicitly discarded. Prevent duplicate submissions while upload or save is pending and release local object URLs when no longer needed.

Creation from the ingredient picker uses the same form. Return the saved foodstuff including its image reference so its basket preview can display immediately without changing the current search or requiring another catalogue fetch. Cancelling the recipe still leaves independently created foodstuffs in the catalogue, as today.

### Display

Replace placeholders in recipe-editor ingredient rows, picker results, and basket previews. These display locations are agreed. Preserve their compact image areas, text labels, selection controls, and basket order. Use contained images rather than recipe-grid natural-height rendering.

Replace the catalogue table's leading macro chart with an image, following the recipe grid's image-first direction. Numeric nutrition columns retain their current responsive behavior. Removal of the chart, including at narrow widths, is agreed.

Compact thumbnails use `question-mark.png` when no image is supplied, while loading, and after download-instruction or image-loading failure. Preserve their existing dimensions without blocking ingredient selection. Do not add thumbnail retry buttons, loading spinners, or inline error text. Explicit fresh-URL retry remains available in the foodstuff editor, where loading and failure feedback can follow the recipe editor's behavior. This thumbnail behavior is agreed. Ignore stale async responses and responses after destruction. URL expiry alone does not require reloading already displayed bytes.

## Storage and Reuse Boundary

Reuse Garage, private storage, gateway signing, immutable object identities, byte validation, and the upload-completion-before-attachment sequence. The agreed foodstuff limits match recipes: static PNG only, at most 10 MiB, and dimensions from 1 to 4096 pixels per side. PNG-only selection restricts direct use of ordinary JPEG/HEIC phone photos; this limitation is accepted. Additional formats or client conversion remain outside this scope.

Use a shared image module for validated metadata, byte validation, upload completion, and download access. Recipe and foodstuff domains retain their own association and save rules. Foodstuffs must not depend directly on recipe-owned image services or duplicate the full validation and failure-handling implementation. Shared frontend preview behavior remains a recommendation; compact foodstuff rendering can differ from recipe rendering. Avoid a general media framework.

Store foodstuff images in a private `foodstuff-images` bucket alongside the existing private `recipe-images` bucket in each environment's Garage instance. Sharing the image module does not merge buckets. Temporary uploads and permanent objects must use the bucket selected for their domain. Backend-controlled upload context and persisted metadata must retain enough storage identity to complete uploads and resolve downloads to the correct bucket; callers do not supply arbitrary bucket names or object keys. Foodstuff associations must accept foodstuff images, and recipe associations must accept recipe images.

Adapt the existing explicit bucket-provisioning mechanism and storage configuration for the second bucket during implementation. Preserve existing recipe image IDs, objects, references, and version behavior when moving metadata responsibilities into the shared module. No movement of recipe bytes to another bucket is needed. Concrete schema migration and route design remain implementation details; the shared module does not itself require renaming existing recipe API routes. Any broader refactor or build/tooling configuration changes require separate confirmation under repository guidance.

Retain the existing deferred cleanup boundary for this proposal. Removing/replacing an association or deleting a foodstuff must not immediately delete bytes that may still be referenced. Future cleanup must consider all image consumers and concurrent attachment. Abandoned uploads and unattached permanent images can continue to accumulate until cleanup is implemented.

## Integration Impact

Evolve backend schemas, generated frontend contracts, and frontend consumers together. Foodstuff list/detail responses and embedded ingredient summaries need image identity for the selected display scope. Review explicit summary construction, catalogue refresh, pending basket records, and foodstuff creation results rather than assuming an added ORM field flows through automatically.

Review HTTP and MCP create/update/read paths together so omitted image fields preserve existing associations. Existing AI foodstuff/recipe presentation payloads remain unchanged: adding images to ordinary domain summaries must not implicitly add them to artifact contracts or send image bytes/access URLs to the AI Service.

Meaningful later verification includes invalid upload/reference rejection, omitted/null/replacement behavior, failed-save preservation, cancellation during upload, upload reuse, create-from-picker handoff, embedded summary propagation, and thumbnail fallback without selection changes. Also verify correct bucket routing through upload completion and download, rejection of cross-domain image associations, and preservation of existing recipe image IDs and references through the metadata migration. No application code was changed or executed to verify the proposed behavior during concept discovery.

## Scope Boundaries

Include optional manual image selection, preview, upload, replacement/removal, persistence, and the agreed foodstuff display locations. Exclude foodstuff versioning, galleries, AI image generation, image import, nutrition-label extraction, thumbnail generation, new detail pages, search changes, and broader catalogue performance work. New ownership rules and a domain authorization rollout are separate concerns; existing private-storage behavior remains the baseline.

## Successive Delivery

Work proceeds through narrow slices. Discuss and agree on each slice's scope and acceptance criteria before implementation, then validate and review it before selecting the next slice. Agreement on this concept does not authorize all slices at once.

### Proposed First Slice: Shared Metadata and Explicit Storage Routing

Prepared for discussion; not yet authorized for implementation. Establish the shared metadata boundary and preserve the working recipe-image flow before adding foodstuff uploads or UI.

Move validated image metadata into an `app.images` module with a shared `ImageAsset` model. Recommend renaming the existing `recipe_image` table to `image_asset` through a new migration, preserving every image UUID, metadata value, and recipe-version reference. Add a required, constrained image kind (`recipe` or `foodstuff`), backfilling existing records as `recipe`. The kind identifies the logical bucket; deployment configuration resolves the physical bucket name. Retain object-key uniqueness within each kind so objects in separate buckets can have the same key.

Update existing recipe upload, download, association checks, and model registration to use the shared model. Recipe upload completion records kind `recipe`; recipe-specific download and attachment paths reject foodstuff-kind IDs. Preserve recipe API routes, response schemas, validation limits, immutable object keys, and version inheritance behavior. Moving the upload-validation service and its internal result types into the shared module is a later slice; only the metadata dependency moves now.

Make bucket selection an explicit backend-only argument when constructing the storage adapter instead of selecting `bucket_recipe_images` inside it. Update all existing callers and verification helpers to pass the configured recipe bucket. Exercise a second bucket through controlled adapter tests. Keep existing runtime settings and deployment definitions unchanged in this slice: actual `foodstuff-images` provisioning, its setting and credentials are a subsequent slice. This is preparation for two-bucket operation, not evidence that the second bucket exists or is usable.

Acceptance criteria:

- A PostgreSQL migration check seeded with existing metadata and a referencing recipe version preserves IDs, metadata, and the foreign key; deletion of referenced metadata remains rejected.
- Existing images acquire kind `recipe`; unsupported kinds are rejected. Identical object keys across kinds are allowed, while duplicates within one kind are rejected.
- Recipe attachment and download reject foodstuff-kind image records, including records inserted only as test fixtures. Recipe image omission, removal, replacement, and version inheritance retain existing behavior.
- Controlled storage tests verify explicit bucket selection for PUT/GET signing and internal read, write, inspect, and delete operations, including encoded paths and two distinct buckets.
- Existing upload validation and persistence-failure regressions, image API/association checks, and the backend suite pass against dedicated test storage. Verify that generated OpenAPI remains unchanged; no frontend source edits are expected.

Review the migration and bucket routing together after validation. Report PostgreSQL or live-storage checks that cannot run as incomplete validation. Do not apply the migration to the running application database or redeploy services as part of this proposed slice. No object movement, live-data reset, foodstuff association/API, second-bucket provisioning, cleanup scheduling, or frontend work is included.

## Remaining Technical Choices

No blocking product questions remain. During implementation, decide whether repeated visible references should share download instructions. The current recipe service fetches fresh instructions on every call; caching and request coalescing are not existing guarantees. Any sharing must respect URL expiry, image replacement, and explicit fresh-URL retry. This does not expand scope into broader catalogue performance work.

## Risks

Large originals rendered as small thumbnails can cost bandwidth and trigger many signed-URL requests in the unfiltered picker. Avoid claiming thumbnail optimization or catalogue scalability without implementing and measuring it. Repeated images do not replace textual identification, especially in the basket.

Catalogue-level changes do not preserve historical ingredient appearance. PNG-only parity is simpler but less convenient for direct phone photography. Moving recipe metadata into the shared module requires care to preserve existing IDs and references; storage routing must consistently distinguish the two buckets. Cleanup remains an existing storage-growth limitation.
