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
- Create new end-to-end tests only when explicitly requested. Maintain and repair existing end-to-end tests as needed, preserving their regression coverage.
- Remove existing tests only when redundant, obsolete, flaky, or blocking legitimate refactoring; explain the reason.

## Temporary AI Artifacts

- Store implementation-specific concepts, plans, and specs in `.agents/concepts/`, `.agents/plans/`, and `.agents/specs/`, respectively, relative to the target repository root. Use these locations even when older artifacts live elsewhere.
- Generated files in these folders are temporary and gitignored. Never commit or force-add them.
- Keep artifacts available through implementation and final review. Leave cleanup to the human; do not delete them automatically.
- Permanent documentation must never link to, cite, or depend on these temporary files. Document lasting behavior and contracts directly in maintained documentation, grounded in the implementation.

## Validation

After edits, run the applicable commands in order:

| Scope    | Working directory | Commands                                                                                                                             |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend | `frontend`        | `npm run format:changed`, `npm run lint`, `npm run test:tooling`, `npm run test -- --watch=false`, `npm run test:browser`             |
| Backend  | Repository root   | `node .agents/validation/backend.mts --format`, `node --test .agents/validation/shared.test.mts .agents/validation/backend.test.mts` |
| Backend  | `backend`         | `.venv/Scripts/python.exe -m pytest` (`.venv/bin/python` on Unix)                                                                    |

Backend pytest requires the dedicated PostgreSQL test database. See [development setup](docs/development.md#validate-changes) for the database command.

Use `npm.cmd` if PowerShell blocks `npm.ps1`. See [development setup and contract validation](docs/development.md) for dependencies, editor configuration, and generated API contracts.

- Format only changed staged, unstaged, and untracked files, respecting configured exclusions and leaving the Git index unchanged. Coordinate before formatting unrelated user edits and review the resulting diff. Full-backend formatting requires an explicit request.
- Lint errors and warnings fail validation. Run `lint:fix` only deliberately and review its diff; hooks and CI never apply lint fixes.
- Review and trust hooks before relying on them. They validate changed scopes automatically with app, tooling, and shared tooling checks enabled, and skip isolated E2E. They reuse success only for identical content and selected checks after all checks pass. Shared hook changes validate both scopes; persistent failures request at most one continuation.
- Run isolated E2E explicitly for changes to browser flows, frontend/backend integration, or deployment behavior: `node .agents/validation/e2e.mts` or `node .agents/validation/run.mts --e2e` from the root. The runner rebuilds the isolated disposable Docker stack and runs Playwright; see the development guide for prerequisites. E2E success is not reused across changed turns.
- Fix findings introduced by your work; broader cleanup requires authorization. Report missing dependencies or failed checks as incomplete validation. Hooks never install dependencies automatically.

## Communication Preferences

- Keep responses concise.
- Be critical; Be a collaborator; point out potential issues and missed details.
- Ask clarifying questions when necessary.
- Clearly communicate uncertainties; minimize false statements.

## Secrets

- Never commit API keys or tokens.
- Use `.env` files for local secrets.
