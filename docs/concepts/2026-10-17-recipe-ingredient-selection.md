# Recipe Ingredient Selection

## Status

Concept direction agreed. The selection-first workflow, fixed foodstuff per ingredient row, amount entry exclusively in rows, single and multiple additions, plain string search, basket confirmation and cancellation, duplicate prevention and cleanup, placeholder images, and creation handoff are settled. The supplied visualizations guide the interaction design. This document does not authorize implementation or execution of a data migration.

## Context

Recipe creation, active-version editing, and draft editing share the ingredient form. Confirming the picker now appends fixed foodstuff rows with empty amounts in selection order. Empty recipes start without ingredient rows. A separate action still opens foodstuff creation until the creation handoff slice.

This concept revises the ingredient interaction recommended in `2026-09-12-recipe-editor-ux.md`, which retained an inline foodstuff select. Other editor directions remain outside this concept.

## Problem

Empty rows require users to configure an ingredient after adding it. The unsearchable dropdown makes finding foodstuffs cumbersome, and a separate creation action sits outside the selection flow.

## Proposed Direction

Keep only the “Zutaten hinzufügen” action in the ingredient section. It opens a searchable foodstuff selection dialog and does not insert an empty row. Rows are created only when the user confirms the pending foodstuff selections with “Übernehmen”. Cancelling selection leaves the ingredient list unchanged.

Once added, a row displays a fixed foodstuff. Its only ingredient actions are changing the amount and removing the row. Existing ingredients loaded for editing follow the same rule. Replacing a foodstuff requires removing its row and adding another ingredient.

Move “Lebensmittel erstellen” into the selection dialog as an always-available plus action so users can create a foodstuff they cannot find. Successful creation returns to selection with the new foodstuff in the pending basket.

## Interaction Details

### Amount Entry

The selection dialog contains no amount input. Users enter and edit amounts only in ingredient rows. Both workflows must be supported: add one foodstuff, enter its amount, then reopen selection; or select several foodstuffs first and enter their amounts afterward. Newly added rows therefore have selected foodstuffs but initially missing amounts. Do not invent default quantities; existing save validation and nutrition handling still apply.

### Selection Basket and Confirmation

Use a Material action list with one native toggle button per foodstuff and selection state owned by the dialog. Do not show checkboxes or override Material internals to hide them. Expose pending selection through `aria-pressed`, a checkmark, and “Im Korb”. Standard button keyboard navigation is accepted for the current mobile scope. The current slice includes pending selection, a count, disabled existing ingredients, and a confirmation button disabled for an empty basket. Confirmation appends rows in selection order; cancellation leaves existing rows and amounts intact. The basket now includes a read-only, horizontally scrollable image preview in selection order. Basket items have no tap actions; deselection stays in the results list. The creation handoff follows separately.

Use a temporary selection basket, as shown in the supplied picker visualization: users choose one or several foodstuffs across searches, then press “Übernehmen” once to append their ingredient rows, close the picker, and return to the editor. Pending items are marked “Im Korb”; the basket shows a count and image preview. This supports both workflows without separate single-selection and multi-selection modes.

Pending basket selections survive changes to the search query. Selecting a pending item again removes it from the basket. Closing with × discards pending selections without changing the recipe.

Prevent duplicate additions by foodstuff identity. Foodstuffs already present in the recipe remain visible, are marked “Bereits hinzugefügt”, and cannot be selected again. Each foodstuff can appear only once in the pending basket. Similar names or brands do not by themselves establish duplicate identity.

Clean up any pre-existing duplicate ingredient rows through a migration during future implementation. Within each recipe version, keep the first occurrence of each foodstuff in stored ingredient order and remove subsequent occurrences. Retain the first row's amount without combining quantities. This concerns duplicate ingredient rows within a version, not separate recipe versions or catalogue records. The user accepts removal of later rows and their amounts because the application currently has only staging data, with no production-grade data to preserve.

### Visual Reference

The user supplied two visualizations in the concept discussion: an ingredient section with fixed foodstuff names, amount fields with unit suffixes, remove controls and one add action; and a picker with selectable foodstuffs, basket feedback, confirmation, and a bottom search field with a plus action. Foodstuff images are an essential semantic element in both the recipe editor and picker, including the basket preview. Exact styling and decorative artwork remain outside the agreed scope.

Per-foodstuff image support is deferred to a follow-up. For this iteration, use the existing `frontend/src/assets/images/question-mark.png` placeholder for every foodstuff in ingredient rows, picker results, and basket previews. The repeated placeholder cannot identify basket contents visually; this temporary limitation is accepted. Keep text names and selection status available independently of images, and retain the basket count.

Initially keep the basket expanded even while the on-screen keyboard is visible. Accept the limited vertical space and assess it in use. If insufficient, the agreed fallback direction is a basket that collapses to a small icon button on either side and lets users expand or collapse it while the keyboard is visible. It automatically expands when the keyboard goes away. This fallback is deferred unless testing demonstrates the need; placement remains undecided.

Long names and identifying brand/unit information need space. A plus icon for foodstuff creation needs an accessible name and a discoverable meaning.

### Search

Use plain string matching only. Do not change the search algorithm or integrate semantic search in this work. The proposed matching fields are name and brand, consistent with the visualization's search placeholder; the existing catalogue path can supply the data. Synonyms and related-term discovery are a separate topic.

Before a query is entered, show all available foodstuffs. Clearing the query restores this unfiltered list. Catalogue loading and rendering performance optimization are explicitly deferred; the potential performance cost of showing the full catalogue is accepted for this iteration. Existing recipe ingredients remain visible with their unavailable selection state.

Show the name and the brand when present, aligned on the left. Do not display the unit in the results. Use a regular search input without autocomplete suggestions. Center the no-results hint vertically and horizontally, with a search-reset button underneath.

### Creating a Missing Foodstuff

Keep the plus action available regardless of whether the search has results. Opening foodstuff creation preserves the search query, pending basket, and recipe draft. Successful creation returns to the picker and automatically places the new foodstuff in the pending basket without requiring another search. Cancelling creation returns to selection with the existing basket intact. “Übernehmen” still confirms all pending additions; creating a foodstuff does not itself insert a recipe row.

Do not couple creation to the search text: do not introduce search-based name prefilling, clear or replace the query, or otherwise change the selection context. Successful creation adds the new item to the pending basket while preserving other state. If the new foodstuff does not match the current query, it may remain absent from the filtered results. Limited feedback, especially with repeated placeholder images in the basket, is an accepted temporary UX shortcoming.

## Scope Boundaries

This concept concerns manual ingredient selection in the shared recipe editor and cleanup of existing duplicate ingredient rows. It does not change recipe versioning, AI proposal workflows, global foodstuff editing, or nutrition calculation rules. Fixed selection is a row interaction rule, not a promise that the underlying catalogue record can never change. Per-foodstuff image support, search enhancement, and catalogue performance work are follow-ups.

## Integration Impact

The ingredient form supports an empty ingredient section without adding a placeholder row. Selected rows retain the existing required-amount validation and nutrition handling.

The foodstuff creation dialog currently saves the catalogue entry and closes without returning the created record to its caller. Adding the created foodstuff to the pending basket requires an explicit result handoff.

Existing backend semantic search remains outside this scope. The picker uses ordinary string comparison without additional semantic API integration.

The editor's live nutrition preview already handles invalid amounts as unknown contributions. Amount entry in rows retains that intermediate state, including when adding several foodstuffs together. Recipe data still needs the selected foodstuff identity even though it is no longer editable in the row.

## Remaining Verification

No blocking product questions remain. During future implementation, verify stored ingredient ordering and maintain valid contiguous indexes after duplicate cleanup. Assess result labels at narrow widths and the available result space while the keyboard is open. These checks do not authorize broader performance work or automatic basket collapsing up front.

## Risks

A stack of recipe, selection, and creation dialogs can make mobile navigation and focus restoration awkward. A staged flow within the selection dialog may be easier to navigate; its exact presentation remains open.

Text search may miss synonyms and encourage duplicate catalogue entries. This limitation is accepted for this scope; search enhancement is deferred. Creation must remain an explicit user decision.

The unfiltered full catalogue may be slow to load or render as it grows. This accepted limitation is deferred to later performance work. Duplicate cleanup intentionally discards later ingredient amounts rather than summing them; it can change affected recipes' nutrition totals.

Foodstuff creation persists independently of saving the recipe today. Unless deliberately changed, abandoning the recipe would leave a newly created foodstuff in the catalogue. Recipe cancellation must not imply that this catalogue write was undone.
