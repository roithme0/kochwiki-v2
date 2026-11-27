# Agents Guide

## Coding Rules

- No destructive commands.
- Strict typing is required. Avoid `Any` and untyped parameters/returns.
- Keep code comments to a minimum; avoid commenting the obvious.

## AI Workflow

- If a user message is phrased as a question, answer it in chat first and ask for explicit confirmation before making code or file changes.
- Confirm before touching build or tooling config.
- Summarize changes and call out risks.
- Treat backend API as an internal contract for this repo's frontend by default: ship backend/frontend contract changes together, and do not preserve legacy compatibility unless explicitly required for a feature or an external consumer.

### Testing

- Add unit, component, integration, or contract tests where they provide meaningful regression protection. Choose the smallest scope that verifies the behavior. Use a real browser when the behavior depends on layout or native browser interactions. Avoid tests that merely restate implementation details.
- Follow the [frontend test guidance](docs/development/frontend-testing.md#frontend-test-guidance) for required frontend coverage, layers, and conventions.
- Create new end-to-end tests only when explicitly requested. Maintain and repair existing end-to-end tests as needed, preserving their regression coverage.
- Remove existing tests only when redundant, obsolete, flaky, or blocking legitimate refactoring; explain the reason.

## Temporary AI Artifacts

- Store implementation-specific concepts, plans, and specs in `concepts/`, `plans/`, and `specs/`, respectively, relative to the target repository root. Use these locations even when older artifacts live elsewhere.
- Generated files in these folders are temporary and gitignored. Never commit or force-add them.
- Keep artifacts available through implementation and final review. Leave cleanup to the human; do not delete them automatically.
- Permanent documentation must never link to, cite, or depend on these temporary files. Document lasting behavior and contracts directly in maintained documentation, grounded in the implementation.

## Validation

After edits, run applicable formatting and lint checks, then run only tests that directly cover this turn's changes. Skip tests if none are relevant. Select specific test files or cases. Leave full test groups and the full non-E2E suite to the Codex stop hook unless the user requests a broader run. See [validation commands and prerequisites](docs/development/validation.md).

- Format changed staged, unstaged, and untracked files within scope. Respect exclusions, leave the Git index unchanged, coordinate before formatting unrelated user edits, and review the diff. Full-backend formatting requires an explicit request.
- Treat lint warnings as failures. Use `lint:fix` deliberately and review its diff.
- Run the relevant [isolated E2E tests](docs/development/end-to-end-tests.md) for changes to browser flows, frontend/backend integration, or deployment behavior.
- Review and trust the Codex hooks before relying on them. Fix findings introduced by your work and get authorization for broader cleanup. Report incomplete validation and its cause.

## Communication Preferences

- Keep responses concise.
- Be critical; Be a collaborator; point out potential issues and missed details.
- Ask clarifying questions when necessary.
- Clearly communicate uncertainties; minimize false statements.

## Secrets

- Never commit API keys or tokens.
- Use `.env` files for local secrets.
