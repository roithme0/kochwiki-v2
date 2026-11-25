# Backend testing

From the **repository root**, format changed Python files:

```sh
node .agents/validation/backend.mts --format
```

Install the backend development dependencies as described [in the development guide](general.md#update-the-api-contract). Use the backend virtual environment's Black in your editor to match the pinned version and Python 3.13 settings in `backend/pyproject.toml`. Formatting includes staged, unstaged, and untracked changed files and leaves the Git index unchanged.

Start the dedicated test database from the **repository root**:

```sh
docker compose -f deployment/tests/docker-compose-test.yml up -d --wait db
```

Then run the full suite from **backend/**:

```powershell
.venv/Scripts/python.exe -m pytest
```

On Unix use `.venv/bin/python -m pytest`. The default test database is `postgresql+psycopg://test:test@localhost:5433/kochwiki_test`; set `TEST_DATABASE_URL` if using another dedicated test database.

Alternatively, backend tests can build their own image and use the test database:

```sh
docker compose -f deployment/tests/docker-compose-test.yml run --build --rm backend-tests
```

Tests migrate and clear the database selected by `TEST_DATABASE_URL`; use a dedicated test database only. Additional gateway, storage, and authentication checks live in [deployment/tests/](../../deployment/tests/).
