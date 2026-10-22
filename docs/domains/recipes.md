# Recipes

A recipe has a stable identity across versions. Each version contains ingredients, preparation steps, a serving count, and optionally a preparation time and image.

## Glossary

| Term | Meaning |
| --- | --- |
| Recipe lineage (`RecipeLineage`) | The stable identity grouping all versions of one recipe. |
| Recipe version (`RecipeVersion`, Rezeptversion) | A persisted recipe with its own content, identity, and state: `active`, `draft`, or `historical`. |
| Active version (`active`) | The currently published version of a lineage. |
| Draft (`draft`, Entwurf) | A persisted alternative within a lineage. It can be edited, published, or discarded. Multiple drafts may coexist. |
| Historical version (`historical`) | A formerly active version retained after another version replaces it. Its recipe content cannot be edited. |
| Ingredient (`Ingredient`, Zutat) | An ordered entry referencing a [foodstuff](foodstuffs.md) with a positive amount in that foodstuff's unit. A foodstuff occurs at most once per version. |
| Step (`Step`, Zubereitungsschritt) | An ordered preparation instruction belonging to a version. |
| Servings (`servings`, Portionen) | The positive number of portions produced by the ingredient amounts. |
| Preparation time (`preptime`) | Optional preparation duration in minutes. |
| Proposal (`RecipeProposal`, Vorschlag) | An unsaved recipe suggestion tied to a source version. It may reference existing foodstuffs or define temporary ones. |
| Presentation | A view of recipe content enriched with resolved foodstuffs and calculated nutrition. Resolving it does not save a recipe. |

## Version lifecycle

- Creating a recipe creates a lineage and its active version.
- Publishing an edit to the active version creates a new active version; the previous one becomes historical.
- Publishing a draft makes that same version active; the previous active version becomes historical. Other drafts remain drafts.
- Saving a proposal creates a draft in the source version's lineage and creates any temporary foodstuffs in the catalogue. Saving does not publish it.
- Proposals are held in memory and do not survive a backend restart. Persisted drafts do.

## Nutrition per serving

Ingredient contributions use the [foodstuff nutrition basis](foodstuffs.md#glossary), are summed, then divided by servings. Each nutrition field has its own completeness status:

| Status | Meaning |
| --- | --- |
| `exact` | Every ingredient has a known value for this field. |
| `minimum` | Only some ingredients have known values; the result is their subtotal per serving. |
| `unknown` | No ingredient has a known value, or there are no ingredients. |

`exact` describes completeness of the recorded data, not measurement accuracy. Calculations use current shared foodstuffs, including for historical versions.
