# Angular Development Tooling

## Status

Draft under discussion. The agreed direction is to use ESLint, Prettier, and the existing Angular tooling instead of adopting Vite+. The user authorized implementing changed-file formatting first. ESLint, test automation, and CI changes remain subsequent steps.

## Goal

Make formatting, linting, and tests a reliable part of Codex coding work through deterministic lifecycle automation reinforced by repository instructions. Target Codex only. Use repository-owned commands and documented requirements so validation does not depend on an agent remembering to discover and run tools.

## Current Setup

The frontend uses Angular 22, npm with a lockfile, Angular CLI application and development-server builders, and Vitest through Angular's unit-test builder. TypeScript strict mode and Angular strict template checking are enabled. The frontend has no lint or formatting scripts in its package manifest. A dedicated script checks generated backend/frontend contract drift, and CI runs that check before building images. Python backend tests remain a separate pytest workflow.

## Proposed Direction

Retain Angular CLI ownership of development, compilation, template type checking, and unit-test integration. Add ESLint through angular-eslint for TypeScript and Angular template linting. Use Prettier for formatting, with a clear boundary between formatting and lint rules. These additions are the selected tools; their detailed policies remain open.

Define the Codex lifecycle integration first, then decide ESLint, Prettier, and test policies one by one. Git commit hooks are outside scope: the user normally commits, while Codex edits and validates code.

### Codex Lifecycle

The agreed behavior is automatic local formatting of files changed by Codex, lint checks before Codex completes coding work, and test execution before completion. Repository instructions reinforce tool use and require Codex to address findings in its changes and accurately report validation results. CI does not run formatting. CI lint findings fail the pipeline; fixes occur outside the pipeline and CI must not rewrite source files. The exact treatment of lint warning severity remains to be configured.

The proposed mechanism is a repository-local Codex Stop hook backed by a shared validation command. Format eligible changed files first, then run linting and the selected non-watch test suites against that resulting state. A Stop hook fires at a turn boundary, not at a semantic task-complete event, so it must skip discussion-only turns and avoid rerunning checks when relevant inputs have not changed. Record successful validation against current input contents; later edits invalidate that result. Do not infer success merely because a test command appeared in a transcript.

On actionable failures, return diagnostics and request a Codex continuation to fix and revalidate. Bound retries and allow an explicit blocked handoff for missing dependencies, unavailable services, or failures requiring user decisions. A blocked handoff must not claim successful validation. Formatting must preserve unrelated user work; changed-file ownership needs particular care when a file already contained user edits.

Official Codex documentation describes project-local hooks in `.codex/hooks.json` or `.codex/config.toml`, including Stop hooks that can request continuation. Non-managed hook definitions require user review and trust. Availability and behavior must be verified in the user's actual Codex client on Windows before promising enforcement; repository instructions alone are not a deterministic fallback. See [Codex hooks](https://learn.chatgpt.com/docs/hooks).

Verification on 2026-10-17 found the installed VS Code extension `openai.chatgpt` version `26.1007.21434`. Its bundled Windows executable reports `codex-cli 0.162.0-alpha.17.2` and `hooks stable true` in `features list` from this workspace. The user verified Stop-hook command execution, then bounded continuation after a simulated failure using a PowerShell script. The inline PowerShell variant failed in the client; its exact failure cause was not established. A script-based hook successfully requested continuation, Codex replied as instructed, and the next stop completed. The probe was then disabled by the user.

### Formatting: First Implementation

Prettier `3.9.10` is pinned in the frontend manifest and lockfile. `npm run format:changed` formats whole changed frontend files: staged and unstaged differences against HEAD, plus untracked files not ignored by Git. It does not update the Git index. Unchanged files, generated API contracts, generated `src/version.ts`, lockfiles, dependencies, and build output are excluded. Unsupported file types and symlinks are skipped. Angular HTML uses the Angular parser; single quotes follow the existing TypeScript convention, with other layout options using Prettier defaults and supported EditorConfig settings.

The Stop hook invokes the same formatter through a PowerShell wrapper. If formatting changes files, it requests one continuation to review the diff. A subsequent stop can format further edits but does not request another continuation. Formatting failures request one corrective continuation, then surface an incomplete-formatting diagnostic if they persist. The changed hook definition requires review and trust in Codex before it runs. The new hook has been exercised locally; live-client execution remains to be confirmed after trust.

This first implementation uses Git's changed-file set, not per-agent edit attribution. It also includes files already modified by the user. Whole-file formatting can therefore touch pre-existing edits in the same file; repository instructions require checking and coordinating ownership. No CI formatting, linting, or automated test gate is introduced in this step.

Local validation passed four formatter regression tests and a strict TypeScript check. Tests cover staged/unstaged/untracked selection, unchanged-file and index preservation, ignore boundaries, Angular control flow, repeat-run stability, and parse failures without partial formatting writes. The configured PowerShell command was exercised with hook input. The full Angular suite ran with 596 tests passing and two failures in untouched recipe-editor tests: both expected one initial preparation row and received zero. Those application/test failures remain outside this formatting change.

### ESLint

The initial recommendation is a flat configuration using the Angular CLI-compatible angular-eslint release line. Cover application and test TypeScript plus external and inline Angular templates. Start from maintained recommended configurations rather than enabling every available rule. Exclude generated contract output and build artifacts from handwritten-code policies; retain the existing generation drift check.

Decide explicitly whether to enable type-aware TypeScript linting initially. It can detect issues beyond compiler checks, including unhandled promises, but adds setup and runtime cost and may reveal existing violations. Additional rules should protect meaningful behavior or agreed repository conventions. Accessibility template checks are recommended for discussion.

Prettier should own layout. Avoid lint rules that duplicate or conflict with its formatting. Existing typing requirements should inform the lint policy, while exceptions for test code require an explicit rationale.

### Tests

Favor reliability over latency. Frontend changes require the full frontend unit-test suite through Angular CLI in non-watch mode. Backend changes require the full backend pytest suite. Changes affecting both sides require both full suites. Focused tests can support development but cannot replace the required full-suite completion checks. Backend/frontend contract changes additionally require the existing generated-contract drift check.

Do not introduce affected-test selection or latency-driven suite reductions. Missing dependencies or test services are validation blockers to report explicitly, not passing or skipped validation. The precise mapping from shared files and tooling changes to required suites remains to be defined conservatively.

## Integration Impact

Local automation owns source formatting and agent feedback. CI runs only the agreed read-only validation; formatting is excluded. Coding-agent instructions should name the working directory, non-interactive validation commands, relevant focused checks, and commands that modify files. Automatic fixes and read-only checks should have distinct entry points.

Backend tests and the OpenAPI contract check remain part of repository validation even though ESLint and Prettier do not replace them. The frontend tooling discussion does not select new Python tools.

## Open Questions

- ESLint: adopt recommended rules first, or include type-aware checks immediately?
- ESLint: include recommended template accessibility rules initially?
- ESLint: which explicit typing rules should supplement the existing strict compiler settings?
- Prettier: file scope, formatting options, and treatment of existing formatting differences?
- Tests: which shared files and tooling changes should trigger both full suites?
- Codex: verify the real formatting hook after reviewing and trusting its changed definition; refine blocked-handoff behavior as lint and test gates are added.
- Formatting: how should automation handle files that already contain unrelated user edits?
- CI: test enforcement in CI remains undecided; CI linting is a required failing gate.
- Rollout: how much existing lint remediation is acceptable in the first tooling change?

## Risks

Recommended rule sets can still require source changes; adoption must not become an implicit broad refactor. TypeScript checks do not replace Angular template compilation. Formatting an entire existing codebase can obscure behavioral changes and should be scoped separately. Generated files need reproducible generator behavior rather than manual fixes. Dependency versions must be checked against Angular and TypeScript compatibility when implementation is approved.
