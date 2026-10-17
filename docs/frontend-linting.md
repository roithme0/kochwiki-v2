# Frontend linting

Run commands from `frontend` using the locked npm installation:

```powershell
npm.cmd run format:changed
npm.cmd run lint
```

`npm run lint` checks the whole frontend without changing files. Errors and warnings both fail the command. `ng lint` provides the same scope and warning policy through Angular CLI. `npm run lint:fix` is an explicit local fixing command; review its diff before accepting fixes. Neither the Codex hook nor CI runs ESLint fixes. CI does not run formatting.

## Coverage

The flat configuration combines ESLint recommended rules, TypeScript ESLint `recommendedTypeChecked`, Angular recommended rules, and recommended template accessibility rules. It covers application and test TypeScript, external and inline Angular templates, and handwritten JavaScript scripts. A dedicated `tsconfig.eslint.json` supplies type information for application code, tests, and tooling without changing their build configurations.

Generated API contracts, generated `src/version.ts`, dependencies, Angular caches, build output, and coverage output are excluded. Generated contracts retain the existing drift check. Prettier owns formatting; linting does not replace compilation or tests.

## Codex integration

Review and trust the updated `.codex/hooks.json` definitions in Codex. `UserPromptSubmit` records frontend content before a turn. `Stop` compares that content, formats changed files, then checks the whole frontend. Unchanged discussion turns skip validation. Successful lint results are reused only for identical input content, including the lockfile, installed dependency lock, lint configuration, and scripts. Edits during linting invalidate the result.

Session state and full lint diagnostics are stored under the ignored `frontend/.angular/cache/codex-validation/` directory. First-run fallback checks an already-dirty frontend if no prompt snapshot exists. This uses Git's worktree rather than per-agent ownership, so existing user edits are also part of the checked state. Formatting retains its existing whole-changed-file scope.

Failures request one Codex continuation. A subsequent stop reports persistent failures without requesting another continuation, preventing an automatic loop. This permits an honest blocked handoff; it is not an unconditional guarantee that every completed turn passes lint. Missing dependencies and existing lint debt must be reported as incomplete validation. Tests are not yet automated by these hooks.

The CI workflow runs `npm run lint` after dependency installation. Findings fail the job and prevent the downstream image builds from proceeding.

## Initial debt assessment — 2026-10-17

The initial scan found **235 errors and 12 warnings across 50 files**, with no configuration or parser failures. Of the 247 findings, 216 were in tests (including formatter tests) and 31 in application TypeScript or templates. Existing source and test remediation is intentionally deferred to a separate change; the new gate fails until these findings are addressed.

| Rule or category | Findings |
| --- | ---: |
| Unsafe member access, calls, assignments, returns, arguments | 179 |
| Unbound methods | 19 |
| Missing Angular lifecycle interfaces (warnings) | 12 |
| Async functions without `await` | 9 |
| Unhandled promises | 8 |
| Template equality comparisons | 8 |
| Base object string conversion | 3 |
| Unnecessary type assertions | 3 |
| Unused variables | 3 |
| Unsafe enum comparisons | 2 |
| Invalid ARIA value | 1 |

Counts are diagnostics, not independent bugs. For example, one untyped DOM value can produce several unsafe-access findings. Some rules need contextual review: template null comparisons may intentionally cover both `null` and `undefined`, and assertions on mocked methods can require a test-specific lint policy. Do not apply broad fixes or suppressions without reviewing their meaning.

Reproduce a machine-readable report without modifying source:

```powershell
npm.cmd run lint -- --format json --output-file .angular/cache/lint-report.json
```

The full frontend suite currently has two existing recipe-editor failures (596 passing, 2 failing), both expecting an initial preparation row where none exists. They remain separate from lint adoption.

Tooling verification passes 12 regression tests and a strict TypeScript check. The new configuration, validator, and validator tests have no lint findings. Both ESLint CLI and Angular CLI report the same existing debt. Re-run the tooling tests with `node --test scripts/format-changed.test.mts scripts/validate-frontend.test.mts` from `frontend`. Local PowerShell checks cover unchanged-turn skipping, failure feedback, and bounded continuation; the changed hook definitions still need live-client review and trust.
