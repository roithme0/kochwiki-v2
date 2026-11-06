"""Static workflow guidance exposed as MCP resources."""

from mcp.server import MCPServer


def register_workflow_resources(server: MCPServer) -> None:
    def register(uri: str, name: str, description: str, content: str) -> None:
        def read() -> str:
            return content

        server.resource(
            uri, name=name, description=description, mime_type="text/plain"
        )(read)

    register(
        "kochwiki://reference/nutrition",
        "Nutrition",
        "Interpret nutrient statuses, bases, scaling and incomplete nutrition.",
        NUTRITION,
    )
    register(
        "kochwiki://reference/presentation",
        "Presentation",
        "Present Kochwiki sources, saved results and proposal actions through artifacts.",
        PRESENTATION,
    )
    register(
        "kochwiki://workflows/foodstuff-creation",
        "Foodstuff creation",
        "Create a catalogue foodstuff after duplicate checks and research.",
        FOODSTUFF_CREATION,
    )
    register(
        "kochwiki://workflows/foodstuff-updates",
        "Foodstuff updates",
        "Update or enrich a catalogue foodstuff safely.",
        FOODSTUFF_UPDATES,
    )
    register(
        "kochwiki://workflows/nutrition-research",
        "Nutrition research",
        "Find, reconcile and disclose nutrition evidence.",
        NUTRITION_RESEARCH,
    )
    register(
        "kochwiki://reference/foodstuff-units",
        "Foodstuff units",
        "Select a storage unit and convert supported nutrition values.",
        FOODSTUFF_UNITS,
    )
    register(
        "kochwiki://reference/foodstuff-naming",
        "Foodstuff naming",
        "Name and distinguish catalogue foodstuffs.",
        FOODSTUFF_NAMING,
    )
    register(
        "kochwiki://workflows/recipe-updates",
        "Recipe updates",
        "Propose, refine and explicitly save updates to an owned recipe.",
        RECIPE_UPDATES,
    )


NUTRITION = """For nutrition questions, including calories, macros and fiber, clarify ambiguous
targets or bases. Preserve the foodstuff's catalogue basis; recipes default to per
serving. For whole-recipe requests, multiply known per-serving values by servings,
preserving nutrient statuses. Follow kochwiki://reference/presentation for artifact
selection and where scaled values may be displayed.

Recipe nutrients are value/status objects: exact, minimum (a lower bound), or unknown
(null value). Preserve statuses when scaling. Nutrient completeness is independent,
including fiber; never infer one nutrient from another or invent unspecified values.
Support fiber goals with these same rules.
Do not claim exact improvements, rankings or satisfied upper targets from incomplete
values. A minimum establishes a lower target only if its bound meets the target;
explain incompleteness.
"""


PRESENTATION = """Use supplied/returned IDs only in tool arguments, artifact metadata and supported
imageId fields; never invent IDs or expose internal IDs in user-facing text,
titles, subtitles or display payloads. Refer to items by meaningful details.
Relay ingredient imageId unchanged, or null if unavailable, including temporary
foodstuffs; never substitute image URLs.

Present retrieved recipes/foodstuffs relied on for facts, explanations or comparisons
as full kochwiki-recipe/kochwiki-foodstuff source artifacts. Explicit display requests
also require full artifacts. Omit unused candidates and sources already visible in
context or successful artifacts unless changed or requested again. Identification
or retrieval solely for an update requires only the saved result artifact.
Summaries and modified proposals do not replace source artifacts. Never create
records merely to display data.

Present each foodstuff or recipe with net updates this turn exactly once as a final
result artifact, including supporting nutrition fills. Consolidate multiple writes
regardless of tool; wait until updates are complete and use the final saved state.
That result satisfies source and nutrition presentation for the same item and basis;
do not also present intermediate states or duplicate artifacts unless requested.
Present directly requested creations too; temporary foodstuffs created by proposal
saving need no separate artifacts unless requested or required as sources.
Only stored proposals may enable saving, for that exact proposal under the host's
metadata contract; persisted recipe references have no proposal save action.

For nutrition questions, use a kochwiki-nutrition artifact only when no source or
result artifact already covers the requested values and basis. Read and follow
kochwiki://reference/nutrition for interpreting and scaling values. Show whole-recipe
scaled values only in the nutrition artifact; full recipe artifacts retain per-serving
values. Preserve nutrient statuses in recipe/nutrition artifacts. Full foodstuff
artifacts retain numbers/null; nutrition artifacts wrap known values, including zero,
as exact and missing values as unknown/null.

Present required artifacts through the host's presentation tool before the final
response, following its payload/title/subtitle/metadata contracts. Text and Markdown
tables do not replace artifacts. If presentation fails or is unavailable, explain
the failure and distinguish retrieval/write success from display success. Retry
retrieval or presentation, never a successful write merely to repair display.
"""


FOODSTUFF_CREATION = """Create a catalogue entry only on an explicit creation request.

First check duplicates, clarifying identity only as needed for meaningful search.
Follow shared retrieval guidance when assessing matches. Consult the user about reuse
versus creation for every plausible duplicate, even a clear match. If search is
unavailable, explain the unknown duplicate risk and ask whether to proceed.

Apply the foodstuff naming and unit resources, and always use the nutrition research
resource before creation, including its conflict policy. Create with all supported values found; unsuccessful or incomplete
research can leave unknowns, which must be disclosed. Use returned saved data and
follow the presentation resource's final-result policy.
"""

FOODSTUFF_UPDATES = """Identify the target and intended fields unambiguously and send only intended
changes. Use fill_foodstuff_nutrition for missing-value enrichment, preserving known
values including zero; use update_foodstuff for explicit replacements and other edits.
Explicit clearing uses the tool's optional-field semantics. Updates change the existing
entry without a version and can affect all referencing recipes.

For name, brand or details edits, apply the foodstuff naming resource and search the
resulting identity for duplicates, excluding the target. Consult about plausible
matches or unavailable required search. Nutrition-only edits need target identification,
not another duplicate search.

For an identity change affecting nutrition interpretation, such as raw to cooked,
drained to undrained or a different product, resolve duplicate checks first and use
the nutrition research resource for the resulting identity. Cosmetic corrections need
no research. Consult before any meaning change, even if numbers are unchanged. Present
relevant findings, sources, estimates and gaps and obtain approval for the resulting
identity and nutrition together. An identity edit alone does not authorize replacing
nutrition. If suitable replacement values cannot be established, offer clearing
affected values to unknown or cancelling; never silently retain potentially invalid
values. Apply confirmed identity and nutrition changes together where supported.

Unit changes follow the same meaning-change gate. Use the foodstuff unit resource,
show converted values and confirm before saving; do not relabel numbers. Compare
research with retained fields, including concurrently populated values. If identity or
unit changed, retrieve and reassess before retrying. Report actual additions, not
attempted fills. Consolidate writes under the presentation resource's final-result
policy; before/after comparison is needed only when requested.
"""

NUTRITION_RESEARCH = """Identify the food, concrete branded product, preparation state and nutrition
basis; clarify ambiguity. Research calories, carbs, protein, fat and fiber. Standalone
research reports findings, evidence, estimates and gaps without catalogue writes or a
duplicate-creation gate. A later mutation follows the creation or update workflow.

For branded foods, prefer matching manufacturer information. If unavailable or
incomplete, check an exact-product retailer without additional confirmation and
supplement only missing values. Match overlapping values on the same basis, allowing
ordinary rounding; material discrepancies block merging. Manufacturer evidence takes
priority between sources in doubt; never average conflicts.

If fiber remains missing after retailer research, BLS (https://blsdb.de/search) may
supply fiber without confirmation as a labeled generic estimate, with plausible
composition and preparation state and the chosen basis. This automatic branded
fallback supplies fiber only; other nutrients need not match exactly. If matching
manufacturer or retailer information cannot be found, consult before another
fallback except this fiber fallback. For unbranded foods, use a suitable BLS food and
preparation match. If BLS lacks a suitable match or values, stop and report gaps
rather than searching additional sources.

Missing values, source failures and unsupported conversions remain unknown; labeling
rules and database completeness are not evidence. Declining further research still
permits creation with disclosed unknowns under the creation workflow. After checking
identity, state, basis and rounding, consult before saving values conflicting with
user-supplied or recorded data. Manufacturer priority does not override those data.
Preserve recorded values pending explicit replacement; temporary copies must not
bypass conflicts.

Cite actual evidence pages accurately. Disclose source merging, retailer supplementation,
fiber estimates, material discrepancies and gaps once in concise chat without repeating
an artifact nutrition table. Do not store provenance or estimate notes in names,
details or other substitute fields.
"""

FOODSTUFF_UNITS = """Honor explicit storage-unit preferences. Otherwise use ML for liquids (per 100 ml),
PIECE for explicitly packaged pieces or portions such as bread slices (per piece), and
G otherwise (per 100 g). Being countable alone does not justify PIECE.

Research the concrete portion weight where required. A matching package weight and
piece count can establish it. Convert mass-based values using
per_piece = per_100_g * piece_weight_g / 100. Distinguish one piece from a serving
containing several. Other conversions require reliable weight or density evidence.
Do not assume mass equals volume or invent weights; disclose unsupported values as
unknown.

Storage choice does not establish the basis of ambiguous supplied numbers. Clarify
that basis or use independently researched values. Per 100 g describes input basis,
not necessarily a preference for G storage.
"""

FOODSTUFF_NAMING = """Use a concise packaging-based product name, brand separately and details for
meaningful selection, research and amount distinctions. Preserve product identity
without inventing an unstated preparation state. Recipe-specific actions belong in steps.

Case | Name | Details
Raw potatoes | Kartoffeln | roh
Cooked potatoes | Kartoffeln | gekocht
Drained kidney beans | Kidneybohnen | abgetropft
Undrained kidney beans | Kidneybohnen | nicht abgetropft
Hirtenkäse 45% Fett i.Tr. | Hirtenkäse | 45 % Fett i. Tr.

Fat in dry matter is descriptive information, not a structured fat nutrient value.
"""

RECIPE_UPDATES = """Use an explicitly selected existing source recipe and preserve selection through
lineage retrieval. Use supplied context; do not infer draft ancestry from shared
lineage. Recipe creation and fabricated source versions are unsupported. Proposals
require a caller-owned source lineage. Other users' recipes remain readable but cannot
be update-proposal sources; ingredient remapping cannot bypass ownership.

An update request authorizes a proposal, not persisting a draft. Create the complete
candidate with create_recipe_proposal, resolve it with get_recipe_proposal, then
present the resolved artifact with the host's save action. Save only the explicitly
identified proposal on explicit save intent, and present the saved version without the
proposal action. Refinement creates a new proposal using baseProposalId while retaining
the original sourceRecipeVersionId; retrieve the prior proposal when needed. Keep the
original source as comparison baseline unless the user explicitly selects a different
update task. Unsaved proposals are not persisted drafts.

Reuse suitable caller-owned catalogue entries. For missing ingredients, check for
foodstuff duplicates before introducing inline temporary definitions; consult about
plausible duplicates or unavailable search. Apply the foodstuff naming and unit
resources and, where applicable, nutrition research. No separate recipe-duplicate
search is needed to revise the selected source. Do not modify or clone another user's
catalogue entries. Do not create catalogue entries merely to propose ingredients. For existing entries,
follow the nutrition research conflict policy. Temporary definitions become catalogue entries only when the identified
proposal is explicitly saved.

Before nutrition optimization, assess ingredient completeness, summarize gaps and
offer completion through the foodstuff update workflow. The user may proceed with
gaps, including negligible gaps. Apply the same policy to additional ingredients and
follow shared authorization guidance. Taste-only updates do not require nutrition
research, including for new temporary ingredients; unavailable nutrition remains
unknown. Any explicitly requested research follows the nutrition research resource.

Use backend-calculated proposal nutrition from get_recipe_proposal, not submitted
input returned by creation. Do not independently calculate replacement recipe totals.
Existing ingredients resolve against live catalogue values.
After authorized fills, refresh the selected source through get_recipe_lineage and
proposals through get_recipe_proposal before comparison. Read and follow
kochwiki://reference/nutrition for nutrient statuses and limits on comparisons.

Accepting gaps does not authorize guessing. If explicitly pushed to estimate, identify
every estimate and estimate-based conclusion, including assumptions and limits; do not
present them as research, recorded facts or backend results. The separate BLS fiber
policy remains applicable. Explain changes, intended benefits and uncertainties briefly
after the resolved artifact, without repeating its details.
"""
