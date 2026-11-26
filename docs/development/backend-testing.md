# Backend testing

## Backend test guidance

Cover new or changed behavior in any of these areas.

| Area | Outcomes to verify |
| --- | --- |
| Data integrity | What is persisted, which record or version changes, and what commits or rolls back together. |
| Identity and access | How the caller is identified and what they can read or change. |
| Contracts and domain rules | Accepted inputs, returned or outbound data, error mapping, and domain results such as zero versus unknown nutrition values. |
| Failure and overlapping work | State after a dependency failure, partial success, retry, or concurrent operation, including cleanup and retryability. |

Assert success and the rejection or recovery paths the change handles. Check relevant side effects, such as stored state after a rejected write. When testing concurrency, overlap work through independent sessions or requests and check both caller outcomes and final state. For a behavior-preserving refactor, run the relevant tests and add coverage where an outcome above lacks an assertion. Use line coverage as a diagnostic.

### Choose the test layer

Use the smallest layer that exercises the code enforcing the outcome.

| What enforces the outcome | Where to test |
| --- | --- |
| A calculation, schema, or policy | Call the function, schema, or public service method directly. |
| A service or outbound adapter | Exercise its public entry point with controlled dependency responses. Use a test transport to inspect outbound HTTP when the request is part of the contract. |
| SQL, a constraint, a transaction, locking, a migration, or pgvector | Use the dedicated PostgreSQL test database. Use representative prior data for migrations and independent sessions for locking or commit visibility. |
| HTTP or MCP routing, validation, identity, or error mapping | Exercise the real FastAPI endpoint or MCP tool with an in-process client. |
| Deployed infrastructure, such as gateway forwarding or object-store signatures | Use the existing [deployment checks](../../deployment/tests/). |

Cover each outcome under its relevant condition once. An existing test, including one at a higher layer, counts if it exercises the real behavior, would fail on the same regression, and runs during relevant validation. Add another assertion for a distinct outcome, such as the HTTP status and body for a rollback already tested against PostgreSQL.

### Cover HTTP endpoints and MCP tools

- Assert that every guarded entry point rejects an unauthenticated caller. A parameterized test can cover multiple entry points. Cover expired or invalid credentials in shared authentication tests.
- Where ownership is enforced, also exercise access to another owner's resource with an authenticated caller. Assert the expected denial or filtering for a read and verify stored state is unchanged after a rejected write.
- Test new or changed caller-visible behavior at the entry point, including request handling, response shape, and error mapping as applicable. Use schema tests for individual field rules and OpenAPI assertions for declared requirements. Verify runtime enforcement through a request and follow the [API contract update process](general.md#update-the-api-contract) when the shared HTTP contract changes.

### Name tests and set up data

Place `test_<behavior_or_contract>.py` in the owning area under `backend/tests/`. Name cases for the expected outcome and condition. Reuse typed fixtures for defaults and keep inputs that determine the outcome visible in the case. Run the real code responsible for the behavior and control external dependencies at their boundary.

## Format and run tests

Install the [backend development dependencies](general.md#update-the-api-contract). Format changed Python files from the **repository root**.

```sh
node .agents/validation/backend.mts --format
```

Use the backend virtual environment's Black in your editor to match the pinned version and Python 3.13 settings in `backend/pyproject.toml`. The command formats staged, unstaged, and untracked changed Python files and leaves the Git index unchanged.

The current pytest fixtures require PostgreSQL even for individual unit tests. Use a dedicated test database because the fixtures migrate and clear it. Start the database with Docker Compose from the **repository root**.

```sh
docker compose -f deployment/tests/docker-compose-test.yml up -d --wait db
```

Run pytest from **backend/**. The command below runs the full suite. Pass a test file or case to run a [targeted check](general.md#validate-changes).

```powershell
.venv/Scripts/python.exe -m pytest
```

On Unix use `.venv/bin/python -m pytest`. The default test database is `postgresql+psycopg://test:test@localhost:5433/kochwiki_test`. Set `TEST_DATABASE_URL` to use another dedicated test database.

To build and run the test image with its dedicated database, run this from the **repository root**.

```sh
docker compose -f deployment/tests/docker-compose-test.yml run --build --rm backend-tests
```
