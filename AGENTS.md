# Agents Guide

## Mandatory Context Docs

- Before non-trivial work, read `README.md`.

## Plans and Specifications

Plans and specification files are gitignored. Treat the current code and tracked documentation as the source of truth; do not rely on uncommitted plans or specs being available to other agents.

## Coding Rules

- No destructive commands.
- Avoid wide refactors without explicit confirmation.
- Strict typing is required. Avoid `Any` and untyped parameters/returns.
- Keep code comments to a minimum; avoid commenting the obvious.

## AI Workflow

- Ask before large refactors.
- If a user message is phrased as a question, answer it in chat first and ask for explicit confirmation before making code or file changes.
- Confirm before touching build or tooling config.
- Summarize changes and call out risks.
- Treat backend API as an internal contract for this repo's frontend by default: ship backend/frontend contract changes together, and do not preserve legacy compatibility unless explicitly required for a feature or an external consumer.
- Write tests where they provide meaningful regression protection: critical user flows, branching logic, stateful behavior, contract boundaries, and bug-prone edge cases. Avoid low-signal tests that only restate implementation details. Do not remove existing tests unless they are redundant, obsolete, flaky, or block legitimate refactoring, and explain the reason when removing them.

## Frontend Formatting

- Run `npm run format:changed` from `frontend` after editing frontend files and before completing coding work. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.
- The Codex Stop hook runs the same formatter automatically. Review formatting changes before reporting completion; rerun relevant validation if formatting changed files after validation.
- Formatting covers whole staged, unstaged, and untracked frontend files, without updating the Git index. Check the existing worktree before editing; avoid formatting a file containing unrelated user changes without coordinating ownership.
- Generated contracts, generated version output, lockfiles, dependencies, and build output are excluded. Do not hand-format generated output or claim successful formatting when the command failed.

## Frontend Linting

- After frontend edits, run `npm run format:changed`, then `npm run lint` from `frontend` before completing coding work. On Windows, use `npm.cmd` if necessary.
- Lint covers the whole frontend, including tests, handwritten scripts, and Angular templates. Both errors and warnings fail validation. Generated contracts and version output are excluded.
- The Codex hooks record frontend content before each prompt and run formatting followed by linting when it changes. Successful validation is reused only for identical content. Review and trust changed hook definitions in Codex before relying on them.
- Use `npm run lint:fix` only deliberately and review its diff; the hook and CI never apply ESLint fixes. CI runs read-only linting and fails on findings; it does not run formatting.
- Address findings introduced by your work. Existing lint debt needs separate authorization for broad cleanup. If findings or missing dependencies prevent validation, report the failure and do not claim completion with passing validation.
- Lint does not replace compilation or tests. Run the full frontend suite with `npm run test -- --watch=false` for frontend coding changes; test automation in the hook is a separate step.

## Communication Preferences

- Keep responses concise.
- Be critical; Be a collaborator; point out potential issues and missed details.
- Ask clarifying questions when necessary.
- Clearly communicate uncertainties; minimize false statements.

## Secrets

- Never commit API keys or tokens.
- Use `.env` files for local secrets.
