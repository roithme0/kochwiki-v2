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

The shared models validate both JSON and decoded dictionaries without coercing
numeric strings or booleans into numbers. Integer fields require integers;
collections require lists. Decimal fields accept finite JSON numbers and Python
`Decimal` values, and serialize as JSON numbers in both requests and responses.
Units accept their documented string values and Python `Unit` instances;
backend attribute-based foodstuff construction remains supported. Nullable
fields remain required where declared, and resolver objects reject extra fields.

Ingredient amounts in resolver requests and recipe writes now require numbers;
previously accepted decimal strings return HTTP 422. Their shared index and
foodstuff ID fields also reject coercion. OpenAPI and Angular's generated
contract reflect numeric amount acceptance. GitHub Release distribution remains
a follow-up slice.
