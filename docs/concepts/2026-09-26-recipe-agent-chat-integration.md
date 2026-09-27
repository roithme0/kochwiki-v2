# Recipe Improvement through Chat

## Status

Draft under joint discussion. Agreed scope: technical integration of the chat UI library and backend, integration into the recipe workflow, and proper recipe rendering, replacing Kochwiki's demo integration. Input is free text only. Saving proposals as drafts is desirable but secondary and conditional on a reasonably scoped interaction. If saving is included, it creates a draft, not an active version. The discussed product and integration decisions are recorded below. Implementation is not authorized.

## Context

Kochwiki already supports active, draft, and historical recipe versions, a shared recipe presentation, and an editor. Publishing a draft moves the previous active version into history. The AI Service provides the Kochwiki agent, validated recipe proposal artifacts, and a shared conversation controller.

The user supplied release evidence for `@roithme0/chat-ui` version `0.1.0`. Kochwiki currently declares `0.0.0` and its demo imports the package root. The new public APIs use `/ui` and `/conversation`; the root no longer exports APIs. Registry installation has not been tested in this concept phase.

## Problem

Rendering a conversation alone does not establish a usable improvement workflow. Users need to understand which recipe they are improving, inspect proposed changes, refine a proposal, and deliberately save the result. A published conversation artifact is not a saved Kochwiki recipe.

## Proposed Direction

Offer an explicit Improve recipe action only on the recipe detail page, beside the existing Edit button. It is available for active recipes and drafts. Historical versions are outside scope; they are not currently exposed for viewing in the user workflow. The action opens a dedicated chat page. Bind each conversation to the displayed source version and a fixed content snapshot rather than silently following subsequent recipe changes; this also matters for drafts, whose content can change under the same version ID.

The chat fills the available viewport below Kochwiki's existing page header. The page header shows the source recipe name as its main heading and "Rezept verbessern" as its subheader. The library banner may contain generic introductory text; exact copy is not a concept decision. Use the supplied chat-library screenshot as the structural reference for the conversation and composer, replacing demo text with recipe-improvement copy. Do not place the chat inside another inset page card. The conversation scrolls within the available space and the composer remains reachable at the bottom, including with the keyboard open. The user starts with free text describing the desired improvement. Guided choices, goal shortcuts, macro-optimization controls, and automatic initial assessment are outside this concept's scope.

Show the original recipe as an expandable artifact at the start of the chat so the user can inspect it without leaving the conversation. It is read-only, with no edit or save action, and clearly distinguished from generated proposals. The original artifact represents the source snapshot used for the conversation.

Recipe detail pages, the source artifact, and proposal artifacts share `frontend/src/app/recipes/components/recipe-presentation`. Render complete recipes through this component rather than maintaining a separate chat-specific recipe layout. Artifact framing and any proposal actions belong around the shared presentation. Visual comparison, diffs, and change highlighting are explicitly out of scope.

If included, saving a selected proposal creates a new draft in the source recipe lineage, even when the conversation started from a draft. Preserve the source recipe and use the existing edit and publication flow for the newly saved draft. Saving is a secondary goal and must not drive unnecessary expansion of the chat library. It must be explicit and report success only after Kochwiki persists it. Chat generation itself must not change the active recipe.

After a successful save, stay in the chat and show a snackbar with "Entwurf gespeichert" and an "Entwurf öffnen" action targeting the newly created draft. Do not track which proposals have been saved, mark artifacts as saved, or permanently disable their save actions. A subsequent save of the same proposal creates another draft. Transient request-pending state may prevent overlapping clicks; it is not saved-proposal tracking. Do not automatically retry a failed save: an ambiguous network failure may have occurred after draft creation, and a manual retry can create another draft.

The agreed placement for draft saving is a Kochwiki-owned "Als Entwurf speichern" button inside each proposal artifact, above the shared recipe presentation, so it remains visible when the recipe body is collapsed. The original recipe artifact omits this action. Use the library's existing host-owned Angular artifact template for the control and event binding; no recipe-specific library API or generic library action area is needed for this direction. Keep persistence and save state in Kochwiki, outside the shared recipe-presentation component. Verify button visibility with the library's actual clipping behavior during implementation. Saving remains a secondary goal, subject to reasonable implementation scope.

A relationship between a proposal and a derived draft is explicitly out of scope, in both frontend state and backend storage. Saving copies recipe content into the normal draft contract without proposal/session provenance or a proposal-to-draft mapping. The snackbar uses the save response's draft identifier only for its immediate navigation action; this does not establish a tracked relationship. Membership in the existing recipe lineage remains unchanged.

Preserve `originName` and `originUrl` from the conversation's original recipe snapshot when saving any proposal as a draft, including proposals refined from earlier proposals. Preserve absent values as absent. Proposal payloads do not supply these fields; this is ordinary recipe source attribution, not a relationship to an AI proposal or session. Users can subsequently edit attribution through the existing draft editor.

The agent currently emits complete recipe proposals, not independently selectable patches. This integration presents those complete recipes for inspection and conversational refinement. Individual-change acceptance and a dedicated change-review UI are outside this concept; the README's broader aspiration does not expand this integration's scope.

## Integration Impact

Use the package's ConversationController and HttpConversationTransport with AgentConfiguration.Kochwiki. Kochwiki owns initialization, typed artifact mapping, domain presentation, and save actions. Do not duplicate the controller's acknowledgement, turn execution, reconciliation, or recovery behavior.

The initial source artifact is Kochwiki-owned presentation of the initialization snapshot, not an agent-generated proposal. Compose it with the controller's conversation content without sending it as a user message or registering it as a generated proposal. Keep its identity stable as conversation content updates.

Route browser requests through Kochwiki's existing Nginx gateway to the separately deployed AI Service. Use the same-origin `/ai/api/v1/agents/kochwiki/sessions` route family, mapping to the AI Service's `/api/v1/agents/kochwiki/sessions` endpoints. Provide equivalent routing through Angular's development proxy. Do not add FastAPI pass-through endpoints or start the AI Service through Kochwiki's Compose setup. The upstream service address is deployment configuration rather than a browser-facing address.

Preserve response bodies and statuses, accommodate long turns, and avoid automatic retries of state-changing requests. Restrict the integration to the intended agent routes rather than introducing a general-purpose relay. The AI Service also needs connectivity back to Kochwiki's existing recipe-presentation resolver through its configured Kochwiki API base.

Both applications currently run only in a private network. This integration assumes that deployment boundary remains in place; new authentication, session authorization, and additional security measures are explicitly deferred. Gateway routing is not access control, and private-network deployment does not establish per-user session ownership. Revisit this deferred work before exposing either application outside that boundary.

The frontend assembles initialization from Kochwiki's existing recipe and foodstuff APIs and supplies it to the library's conversation transport through the same-origin relay. No separate backend snapshot-assembly endpoint is needed. Capture the source recipe-version UUID, recipe content, and full available-foodstuff catalog for session initialization; use that same source snapshot for the original recipe artifact. Keep the conversation's source snapshot fixed while the page remains open.

The current catalog fits the 100-foodstuff limit according to the user. Send the full catalog without ranking, filtering, truncation, or ingredient-selection UI. The service also enforces a 16,000-character limit on initial rendered context; exceeding either existing limit should surface an initialization error through the normal error flow. Catalog reduction strategies and support for larger catalogs are outside scope.

Proposals arrive enriched by the Kochwiki presentation resolver in turn responses and history. There is no individual artifact lookup. The frontend must distinguish proposal envelopes and presentation data from persisted recipe versions; saving requires an explicit mapping into Kochwiki's existing draft write contract, with its normal backend validation. Do not check whether the source recipe changed during the conversation or before saving or publication. The conversation continues to use its original snapshot, saving creates a separate draft, and the existing publication and conflict-handling behavior remains unchanged.

Conversation state exists only while its chat page is open. Leaving the page, including opening a saved draft through the snackbar, discards the frontend conversation state. Returning through browser navigation or opening Improve again starts a fresh conversation from the requested recipe version; it does not resume the previous chat. Do not retain conversations in an application-wide cache or browser storage. Continuing chats across navigation or reloads is explicitly deferred. This avoids implying a return path from a derived draft to a conversation associated with another recipe version.

Once the user has submitted a message, leaving the chat requires confirmation that the conversation will be lost and saved drafts remain available. This includes app navigation, browser Back within the app, and the snackbar's "Entwurf öffnen" action. Cancelling keeps the user in the current chat; confirming permits navigation and discards its frontend state. An untouched chat does not require confirmation. Do not condition the confirmation on whether proposals were saved, since that relationship is not tracked. For reload or tab closure, use the browser's native leave protection where supported; custom wording and display cannot be guaranteed there.

Explicit exception: switching users through the existing temporary user-selection flow clears the chat without confirmation. Preserve that behavior rather than redesigning user switching. For recovery actions that replace a started conversation without navigating, confirm before forwarding `new-session` to the controller; initial session-creation retries need no confirmation.

AI Service sessions are process-local and expire after 90 minutes. Discarding frontend state does not imply deleting the server session or cancelling an in-flight turn; neither capability is part of the current contract. Expiry and unavailable sessions while the page remains open use the controller's existing recovery behavior. No streaming or cancellation is promised. A saved recipe draft survives independently of the chat.

## Scope Boundaries

Replace the current `/chat-ui-demo` route, demo page, fixture renderer/content, and demo-specific tests and references as part of the productive integration. Retain reusable theme/package infrastructure where appropriate. Upgrade package consumption and imports together; document the productive flow in the README. Build and tooling edits require confirmation under repository guidance when implementation begins.

Do not implicitly expand this concept into streaming, durable conversation storage, new authentication, enhanced agent recovery, automatic publication, or arbitrary agent access. The existing controller's recovery remains available. New foodstuff creation by the agent and partial proposal acceptance are not assumed.

Implementation changes are limited to this repository. Manual chat scrolling is accepted; automatic scrolling is deferred to future chat-library iterations. Do not add a Kochwiki workaround that reaches into library DOM. Reuse the existing tested recipe presentation as-is initially; make narrow-width adjustments only if concrete layout issues arise during integration.

## Open Questions

The pressure-test decisions are resolved below. No outstanding product decisions are currently identified; release, connectivity, and implementation verification remain. Draft saving remains secondary in priority.

## Pressure Test

Static review of the current Kochwiki and sibling AI Service source supports the overall architecture. The existing proposal presentation contains the ingredient IDs and recipe content needed by `createRecipeDraft`; source attribution can be copied separately. The host renderer supports the save button without a recipe-specific library extension. This review did not install or execute the released `0.1.0` package, test live gateway connectivity, or verify the layout in a browser.

### Conversation replacement can bypass leave protection

The controller's `new-session` recovery action calls `start()`, which clears conversation content after successful creation. This happens without route navigation, so a leave guard cannot protect existing proposals. Agent-unavailable recovery can label this action "Erneut versuchen" even though it starts a replacement session. Agreed: require host confirmation before forwarding `new-session` when the chat has submitted content, explaining that the old conversation will be replaced. Initial creation retries need no such confirmation. Keep the controller's recovery logic unchanged.

### Page destruction does not stop pending work

The controller has no disposal/cancellation API. After message acceptance it invokes the acknowledgement callback and then executes the turn; the UI acknowledgement focuses its composer. These callbacks may arrive after navigation has destroyed the page. The host needs a page-lifetime boundary around view updates, acknowledgement, and save notifications so old work cannot touch a destroyed view or a newly opened chat. Remote work may still complete, consistent with deferred cancellation. Saving during navigation also needs explicit verification: a draft may be created even after the user leaves, and leaving must not be described as cancelling that save.

### Automatic scrolling is absent from the inspected library

The chat component provides an internal history scroller but no automatic scroll-to-new-content behavior or public scroll control. With long recipe artifacts, a user can submit text and remain above the resulting reply. Manual scrolling is explicitly accepted for this integration. Automatic scrolling belongs to future library iterations, with no library change or host DOM workaround in this scope.

### Shared rendering needs width and height verification

The shared recipe component is already implemented and tested. Reuse it without proactive layout optimization. Chat history padding, artifact padding, and nested Material cards reduce its available width; address concrete narrow-width issues only if encountered during integration. The chat page still needs the agreed bounded viewport below the header, avoiding competing page scrolling. The save button belongs first in the renderer as agreed. Artifact collapse currently clips content by height, and only overflowing recipes receive an expand control; it does not hide every recipe behind a title-only disclosure.

### Small host extensions are required

PageHeaderService currently exposes a headline but no subheader. SnackBarService only supports text with a two-second duration and returns no action handle. Agreed: extend them with an optional header subheader, reset when leaving the page, and an actionable snackbar with enough time to activate it. The header's user-switch action currently clears the selected user before navigating; this temporary flow is explicitly allowed to discard the chat without confirmation. Do not redesign it to defer that mutation. These are bounded host integration changes, not a new authentication feature.

### Artifact mapping is a runtime contract boundary

The package exposes artifact payloads as `unknown`; TypeScript interfaces alone do not establish that a payload matches Kochwiki's RecipePresentation. Validate the recognized recipe proposal shape before rendering or enabling saving. Unknown or malformed artifacts must not break the complete conversation or become saveable recipes. A mapper exception is handled by the controller as a turn failure, even when the server turn succeeded, so mapping failures should remain local to artifact presentation. The exact fallback is an implementation detail; escaped JSON or a non-actionable error card are viable.

### Deployment and release checks remain necessary

The separately deployed AI Service must be compatible with the package contract and reachable in both directions: gateway to session endpoints and AI Service to Kochwiki's resolver. Test long turns through the actual proxy chain, not only direct service calls, and keep Kochwiki usable when the AI upstream is unavailable. A literal unavailable Nginx upstream hostname can affect gateway startup depending on the chosen configuration. The published package must be checked independently of any local linked build. None of these checks requires catalog filtering, new session persistence, or security work beyond the agreed private-network boundary.

## Risks

A long chat with full recipe cards can be cumbersome on a phone; the shared presentation must fit the artifact width and expand/collapse behavior. The supplied catalog limits the agent's available substitutions. Leaving the chat loses access to unsaved proposals, including when using "Entwurf öffnen"; saved drafts remain available. Publishing a saved draft can supersede changes made since the conversation began; this is accepted existing behavior, with no source-change checks added by this integration.
