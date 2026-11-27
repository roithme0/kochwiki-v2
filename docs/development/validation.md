# Validation

Run commands from the **repository root** unless a different directory is specified. See the [development prerequisites](general.md#prerequisites) for tool versions.

## Formatting and linting only

Run either command on its own or run formatting before linting. Formatting updates changed files in place. Review the diff afterward.

| Scope | Format changed files | Lint |
| --- | --- | --- |
| [Frontend](frontend-testing.md#frontend-checks), from `frontend/` after `npm ci` | `npm run format:changed` | `npm run lint` |
| Backend, from the repository root with [backend development dependencies](general.md#update-the-api-contract) installed | `node .agents/validation/backend.mts --format` | `node .agents/validation/backend.mts --lint` |

## Tests only

List groups with `node .agents/validation/test.mts --list`. To filter by file or case, select one concrete group and pass its runner arguments after `--`. Without a filter, each selected group runs in full.

```sh
node .agents/validation/test.mts --group frontend-app -- --include 'src/**/example.component.spec.ts'
node .agents/validation/test.mts --group backend -- tests/path/test_example.py::test_case
node --test .agents/validation/shared.test.mts
```

Install [frontend dependencies](frontend-testing.md#frontend-checks) for frontend tests. For browser component tests, also install Chromium and use `frontend-browser` with the same `--include` flag. For pytest, follow the [backend setup](backend-testing.md), including starting the dedicated test database. See [end-to-end tests](end-to-end-tests.md) for isolated E2E setup and filters.

## Combined validation

Run `node .agents/validation/run.mts` to format changed files, lint, check generated API contract freshness, and run all non-E2E test groups. For the default run, install [frontend dependencies and Chromium](frontend-testing.md#frontend-checks), install [backend development dependencies](general.md#update-the-api-contract), and start the [dedicated backend test database](backend-testing.md).

| Option | Effect |
| --- | --- |
| `--scope frontend` or `--scope backend` | Limits formatting and linting. Contract freshness and test selection are independent of scope. |
| `--no-format` | Skips formatting. Lint, contract freshness, and selected tests still run. |
| `--group NAME` | Selects a full test group or alias. Repeat to combine groups. Use `--group all` to include [E2E](end-to-end-tests.md). |

For example, this lints the frontend, checks contract freshness, and runs the full frontend app test group without formatting.

```sh
node .agents/validation/run.mts --scope frontend --no-format --group frontend-app
```
