---
name: sync-static-i18n-de
description: Sync German Angular static-content translations from messages.xlf to messages.de.xlf, preserving reusable translations and validating XLF structure and placeholders. Use for apps with the source-element translation convention described below; excludes dynamic ngx-translate translations.
---

# Sync Static i18n DE

## Scope

- `src/locales/static-content/messages.xlf`
- `src/locales/static-content/messages.de.xlf`

Resolve these paths from the target Angular app root. Confirm the app uses the conventions below before applying the helpers; this skill repository need not be the app repository.

## Repo-Specific Rules

- Treat `messages.xlf` as the source of truth for `trans-unit` IDs, order, datatype, and context metadata.
- The supported app convention stores German translations inside the `<source>` element of `messages.de.xlf`. Do not add `<target>` nodes.

## Workflow

Prerequisites: Node.js, installed app dependencies, and the app's existing `extract-i18n` npm script. Run commands from the Angular app root. Resolve helper paths from this skill's directory, not the app's `.agents/skills/` directory.

1. Run `npm run extract-i18n` and inspect the result before syncing.
2. Run `node "<skill-directory>/scripts/sync-static-i18n-de.mjs" --write`.
   - Read the report for any non-zero exit. Translation or duplicate review can require manual work; do not assume every failure is an expected review condition.
3. Review the sync report:
   - Translate every unit that fell back to English because the ID is new or changed.
   - For changed IDs, reuse the previous German wording when the old and new source are clearly equivalent in meaning, placeholders, and tone.
   - If equivalence is not clear, retranslate from the current English source.
4. Keep English context groups mirrored into the German file.
5. Run `node "<skill-directory>/scripts/check-static-i18n-de.mjs"` and resolve reported structural failures.
6. Report translated or reused units, structural fixes, validation results, and any translation uncertainty.

Both helpers accept `--en <path>` and `--de <path>` when the app uses different file locations. Preserve access to the pre-sync German content until changed-ID reuse has been reviewed.

## Translation Rules

- Preserve placeholder names, XML tags and entities, ICU selectors and branch structure, and significant whitespace. Translate human-readable text within that structure.
- Keep product names and code-like tokens unchanged unless the source already localizes them.
- Prefer concise, natural German that matches the source meaning and UI tone.
- If a translation is uncertain, write the best-effort German translation into the file and flag that unit in the final report for human review.

## Quality Control

Check the result against these requirements:

- Both files have identical `trans-unit` IDs in identical order, with no duplicates.
- Every `trans-unit` contains exactly one `<source>` node.
- Context metadata in German matches English for every unit.
- Placeholder tags and ICU headers still match the English source.
- Newly touched units are not accidentally left in English unless that is intentionally correct.

Helper checks cover the structures and patterns they inspect; they do not prove complete XML/ICU validity or translation quality. Review touched translations and syntax directly.
