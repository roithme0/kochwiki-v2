# Frontend linting

Run commands from `frontend` using the locked npm installation:

```powershell
npm.cmd run format:changed
npm.cmd run lint
npm.cmd run test:tooling
npm.cmd run test -- --watch=false
```

`npm run lint` checks the whole frontend without changing files. Errors and warnings both fail the command. `ng lint` provides the same scope and warning policy through Angular CLI. `npm run lint:fix` is an explicit local fixing command; review its diff before accepting fixes. Neither the Codex hook nor CI runs ESLint fixes. CI does not run formatting.

## Coverage

The flat configuration combines ESLint recommended rules, TypeScript ESLint `recommendedTypeChecked`, Angular recommended rules, and recommended template accessibility rules. It covers application and test TypeScript, external and inline Angular templates, and handwritten JavaScript scripts. A dedicated `tsconfig.eslint.json` supplies type information for application code, tests, and tooling without changing their build configurations.

Generated API contracts, generated `src/version.ts`, dependencies, Angular caches, build output, and coverage output are excluded. Generated contracts retain the existing drift check. Prettier owns formatting; linting does not replace compilation or tests.

## Codex integration

The hook definitions were reviewed and trusted in Codex. Live-client checks confirmed unchanged-turn skipping, changed-file lint failure feedback, full-suite execution, and actionable test failure feedback using a temporary failing assertion that was subsequently restored. `UserPromptSubmit` records frontend content before a turn. `Stop` compares that content, formats changed files, runs whole-frontend lint, runs the tooling regression tests, then runs the full Angular test suite in non-watch mode. Unchanged discussion turns skip validation. Successful results are reused only after every check passes for identical input content, including the lockfile, installed dependency lock, configuration, and scripts. Edits during validation invalidate the result. A lint or tooling-test failure stops the sequence before later checks.

Session state and full diagnostics (`lint.log`, `tooling-tests.log`, and `tests.log`) are stored under the ignored `frontend/.codex-validation/` directory. The Angular suite has a ten-minute timeout; lint and tooling tests each have two minutes, within a fifteen-minute hook timeout. Timeouts fail validation. First-run fallback checks an already-dirty frontend if no prompt snapshot exists. This uses Git's worktree rather than per-agent ownership, so existing user edits are also part of the checked state. Formatting retains its existing whole-changed-file scope.

Failures request one Codex continuation. A subsequent stop reports persistent failures without requesting another continuation, preventing an automatic loop. This permits an honest blocked handoff; it is not an unconditional guarantee that every completed turn passes validation. Missing dependencies, failing tests, and existing lint debt must be reported as incomplete validation. Failed checks are never cached as successes.

The CI workflow runs `npm run lint` after dependency installation. Findings fail the job and prevent the downstream image builds from proceeding.

## Initial debt assessment — 2026-10-17

The initial scan found **235 errors and 12 warnings across 50 files**, with no configuration or parser failures. Of the 247 findings, 216 were in tests (including formatter tests) and 31 in application TypeScript or templates. The separately authorized source and test cleanup has now addressed all 247 findings. The whole frontend passes `npm run lint` with zero errors and warnings, without rule suppressions or configuration exceptions.

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

The initial full-suite run had two stale recipe-editor tests expecting an initial preparation row. Commit `8265065` intentionally removed that placeholder and updated the preparation-form tests, while leaving the editor assertions behind. The follow-up correction aligns the integration tests with that behavior and covers adding, validating, removing and saving steps, including empty active and draft recipes. The full frontend suite now passes all 599 tests across 49 files.

Verification after cleanup passes 13 formatter/validator regression tests and strict TypeScript checking with `node node_modules/typescript/bin/tsc -p tsconfig.eslint.json --noEmit`. The full Angular suite passes all 599 tests after the stale integration tests were corrected. Re-run the tooling tests with `npm run test:tooling` from `frontend`. Local PowerShell checks cover unchanged-turn skipping, failure feedback, and bounded continuation. Live Codex checks additionally verified full-suite execution and test failure feedback.
