# Kochwiki contract

Shared Pydantic models for Kochwiki's recipe-presentation resolver. The backend
imports these same definitions. The package has no dependency on FastAPI,
database models, or service code, and does not provide an HTTP client.

The public imports are `RecipePresentationResolve`, `RecipePresentationOut`,
their ingredient/step models, `FoodstuffSummaryOut`, and `Unit`, all available
from `kochwiki_contract`. Endpoint paths and status handling remain the
consumer's responsibility.

From the repository root, after installing the backend requirements:

```powershell
backend/.venv/Scripts/python.exe -m pip install -e ./backend/contract
```

On other platforms, use the corresponding virtual-environment Python. Install
this package before running the backend, tests, migrations, or the frontend's
OpenAPI export/check commands. CI and the backend Dockerfile install it directly
from this checkout.

Build a local wheel and verify it independently of the backend:

```powershell
uv build --wheel backend/contract
uv venv backend/contract/.venv
uv pip install --python backend/contract/.venv/Scripts/python.exe backend/contract/dist/kochwiki_contract-0.0.0-py3-none-any.whl
backend/contract/.venv/Scripts/python.exe -I -m unittest discover -s backend/contract/tests
```

The initial version `0.0.0` is for local extraction verification, not a published
release. Python 3.13 and Pydantic 2.13 are the initial baseline; the supported
version matrix and release versioning will be established before distribution.
`py.typed` is included for consumer type checkers.

This extraction preserves existing validation, including decimal-string
coercion and backend `Decimal` construction. JSON output still contains numeric
decimals. Stricter consumer parsing and GitHub Release distribution are separate
follow-up slices.
