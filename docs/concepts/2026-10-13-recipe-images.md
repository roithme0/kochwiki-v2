# Recipe Images

## Status

Draft. PNG upload in the create/edit dialog's Basis section, images replacing the grid's nutrition display, and images on the recipe detail page are requested. One optional image per recipe version, initial inheritance of the source version's image, and a neutral placeholder in the grid, detail page, and editor are agreed. Drafts and the active version can have different images; saving a draft's image does not change the active version's image. Replacing an image does not require a separate image revision history for that version. Historical-version retention and upload limits remain to be confirmed. The user supplied detail-page and editor visualizations in this conversation; a grid visualization remains pending. This document records the concept; it does not authorize implementation or configuration changes.

## Goal

Make recipes recognizable by a user-uploaded image in the recipe grid and on their detail page. Keep image selection within the existing recipe editing flow.

## Current Context

Recipe data is organized into active, draft, and historical versions. Publishing an active edit creates a new version; an existing draft is updated in place. The shared create/edit editor groups inputs into Basis, Zutaten, and Zubereitung. Basis currently contains the recipe name. Grid cards display a macro chart and a version-state badge. The detail page uses a shared recipe presentation component that also serves AI artifacts.

The README proposes private SeaweedFS object storage with backend-issued short-lived upload and download URLs and PostgreSQL image metadata. The inspected backend has no image model or storage integration, and the deployment Compose files do not currently configure SeaweedFS. This is a new storage capability rather than wiring up an existing upload service. Domain recipe endpoints currently do not enforce application sessions.

## Proposed Direction

Support PNG files with one optional image per recipe version, referenced through stable image metadata rather than a stored expiring URL. Existing recipes continue to work without an image. Show a neutral placeholder in grid cards without an image; the nutrition chart is removed from the grid. Nutrition calculations and detail-page nutrition remain available.

Associate the image reference with the recipe version. Saving a draft image change affects that draft only. Publishing the draft makes its image the active version's image. Replacing or removing an image on an existing draft does not keep a backup for that draft, but must leave other versions' images intact.

Initially inherit the source version's image when creating a draft or publishing an active edit without an explicit image change. Versions may reference the same immutable object until one selects a replacement; independent image ownership does not require duplicating identical bytes. Recommend historical versions retain their own image reference when an active edit creates a new version. Historical retention remains a recommendation pending confirmation.

In Basis, provide image selection, a local preview, replacement, and removal. Selecting or removing an image changes the editor state; saving commits the selected image together with the recipe. Cancelling leaves the saved recipe unchanged. An image upload or validation failure keeps the editor open with the entered recipe data and a clear retry action. A failed replacement must not silently remove the previous image or save the recipe without the requested image.

Display each version's saved image in its grid card in the area currently occupied by nutrition and on its detail page. Historical detail pages should use that version's image if historical retention is confirmed. Preserve recipe navigation and version-state visibility. Show the same neutral placeholder in the grid, detail-page image area, and editor preview when no image is supplied. The placeholder is a UI asset, not an uploaded image or a persisted recipe image reference.

## Visual Direction

The user supplied two visual references in this conversation: a recipe detail page and the shared editor showing an existing draft. Record their image-related direction here so implementation does not depend solely on the conversation attachments.

On the detail page, place a large, centered image below the recipe title and above the preparation-time/servings information and recipe content. Keep the version-state badge visible near the upper-right side of the image area. The image has no separate visible card background in the reference; transparent PNG content sits on the existing page background. Keep detail-page nutrition available below the recipe content.

In the shared create/edit dialog's Basis section, place a large, centered preview below the Name field, within the section's existing surface. Place a circular pencil/edit action at the lower right of the preview area. It opens PNG selection for an initial upload or replacement and remains available when the placeholder is shown. Give this icon-only action an accessible label and keyboard access. Cancelling file selection preserves the current preview.

Use the neutral placeholder in both these image areas when no image has been supplied, including after removal in the editor. Reserve a stable image area so the empty state and image load do not shift surrounding controls. Recommend fitting the full image within that area without stretching or cropping, matching the references' fully visible plate and transparent margins; exact dimensions and responsive sizing remain implementation decisions to validate.

The references guide image placement and editing controls. They do not expand this feature into restyling navigation, ingredients, preparation, nutrition, or the save actions. The editor reference does not show a removal control; its accessible placement remains to be resolved without displacing the primary image-selection action. The grid reference is still pending.

## Storage and Save Lifecycle

Follow the README's SeaweedFS direction unless a later decision changes it. Keep objects private and store stable object references and validated metadata in PostgreSQL. The backend controls upload admission, validation, attachment, and access URL issuance. Never trust a filename or browser MIME type alone: validate that uploaded bytes decode as PNG and enforce agreed byte and pixel limits.

Recommend uploading to a temporary object before recipe save and attaching only a validated image reference in the recipe database transaction. Define completion explicitly: obtaining an upload URL or successfully transferring bytes alone does not make an image eligible for attachment. Uploads must not permit later overwrite of an object already referenced by a recipe.

Object storage and database writes need a lifecycle that tolerates cancellation, failed saves, and interrupted uploads. Unattached uploads expire and are eligible for cleanup after a defined retention interval. After a replacement or removal commits, the previous object is eligible for cleanup only when no other version references it. No separate image revision history is needed. A failed replacement preserves the current reference and object. Cleanup must account for concurrent attachment, draft discard, and recipe deletion. Use a new object identity on replacement so caches do not keep displaying the old image. Expiring download URLs require refresh behavior for long-lived pages, and image delivery failures need a fallback rather than a broken layout.

## Scope Boundaries

Include manual PNG upload, preview, replacement and removal, persistence, grid display, and detail display. Multiple images per version, separate image revision history, image generation, galleries, foodstuff images, and additional file formats are outside the initial scope. Images remain optional. Automatic cropping, editing, and thumbnail generation are not settled requirements.

Authorization and access-management changes are explicitly out of scope. Do not add recipe/image ownership rules, permissions, roles, sharing policies, or a broader domain API access-enforcement rollout. Use the existing authentication foundation without making new authorization work a prerequisite. Private object storage, storage credentials, presigned transfer URLs, file validation, and reference integrity remain technical image-storage concerns within scope; they do not establish user-level authorization.

Do not implicitly add images to AI artifact payloads or send image bytes or access URLs to the AI Service. A saved AI proposal draft initially inherits its source version's image, consistent with manual draft creation. Generated recipe changes can make that image less representative; the user can replace the draft's image manually without changing the source version.

## Wider Planning Context

Reviewed `../plan` on 2026-10-13, particularly [Recipe and Ingredient Images](../../../plan/Initiatives/Recipe%20and%20Ingredient%20Images.md), [Kochwiki](../../../plan/Projects/Kochwiki.md), [System Overview](../../../plan/Architecture/System%20Overview.md), and [Photo-assisted Foodstuff Nutrition Entry](../../../plan/Initiatives/Photo-assisted%20Foodstuff%20Nutrition%20Entry.md). These notes describe high-level intent; this repository remains authoritative for current implementation.

The broader image initiative assigns image associations, metadata, access policy, replacement, deletion, and storage lifecycle to Kochwiki. AI Service would own a later bounded image-generation capability and provider integration. Ordinary image support comes first and must work without AI Service. This supports the current manual-upload scope and backend-owned lifecycle.

The longer-term direction is for uploaded, imported, and generated images to fit the same domain model. Keep stable image identity and storage metadata independent of an AI provider or upload transport. This does not add import, generation, generated-image provenance fields, a transfer contract, or a general media framework to this slice. Ingredient/foodstuff images also remain outside scope. The separate nutrition-label initiative does not require permanent photo storage and is not a dependency here.

The plan intentionally leaves storage technology to service repositories, so it does not conflict with this repository's SeaweedFS direction. Its recipe-ownership direction is future context for image access policy, not authorization to implement ownership in this concept. Some planning notes still describe temporary user selection and an undecided identity provider; the implemented local session and Keycloak setup documented here supersede those descriptions for current-state reasoning. No files in `../plan` were changed.

## Integration Impact

Backend and frontend contracts must evolve together, including generated frontend API types. Recipe responses expose stable image identity and suitable display access; writes distinguish keeping, replacing, and removing the image. Existing records require no uploaded image. All version lifecycle paths need deliberate behavior, including active edits, draft creation, draft updates, publication, historical reads, draft discard, lineage deletion, and AI proposal saves.

Place detail-page image rendering deliberately: the shared recipe presentation component also renders AI artifacts, so changing it can expand the scope unintentionally. Preserve existing artifact behavior unless image support there is explicitly agreed.

Image integration does not introduce authorization policy or expand session enforcement across recipe APIs. Existing authentication behavior remains the baseline. Upload validation and image-reference integrity checks protect data consistency without defining who owns a recipe or who may access it. Future authorization can apply to these operations separately.

Direct browser uploads also require a decision on browser-reachable storage addresses and object-store CORS; backend connectivity alone is insufficient. Storage provisioning, credentials, gateway upload limits, dependencies, and deployment configuration will need a concrete proposal and confirmation before configuration edits, as required by AGENTS.md. Database and object storage backup/restore must preserve their references together.

## Delivery Boundaries

The concept suggests three reviewable slices, without prescribing a task-level implementation plan:

1. Establish storage, validation, image metadata, save/version lifecycle, and upload controls in Basis, using the supplied editor visualization.
2. Replace grid nutrition with image display and the agreed fallback. Obtain the user's grid visualization before implementation.
3. Display the viewed version's image on the recipe detail page, using the supplied detail visualization.

Each implemented slice should ship its frontend/backend contract changes together. Meaningful regression coverage should focus on invalid uploads, failed or cancelled saves, independent draft/active images, publication, replacement/removal, retention of objects referenced by other versions, cleanup of unreferenced objects, presigned transfer behavior, and fallback behavior. Authorization-policy tests belong to the deferred access-management work.

## Open Questions

- Should historical recipe versions retain their own image? Recommended to follow version ownership; this is distinct from retaining backups of replaced images within an existing draft.
- What maximum file size and decoded dimensions should apply? Are animated PNG files allowed?
- What browser upload route, retention interval, and cleanup mechanism fit the deployment?
- Are generated thumbnails needed initially, or can one bounded original serve both grid and detail views?
- Where should the editor's image-removal action appear alongside the supplied pencil action?
- What grid image layout should the pending grid visualization establish?

## Risks

Large PNGs can make a mobile grid slow even when upload succeeds. Client validation alone cannot establish a valid image. Independent storage and database writes can leave orphan objects or dangling references without a defined lifecycle. Concurrent editors can replace the same draft's image, so conflict handling needs a deliberate decision. Prematurely deleting an object still referenced by another version would break that version's image. Private buckets do not secure backend access URL issuance by themselves. The supplied image layout still needs verification at narrow mobile widths and with arbitrary uploaded PNG aspect ratios and opaque backgrounds.
