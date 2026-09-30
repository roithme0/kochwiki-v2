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

The checkout uses `0.0.0` for local development. Python 3.13 is the supported
runtime; CI derives its minimum and latest allowed Pydantic test constraints
from `pyproject.toml`. The helper supports a `pydantic>=X,<Y` declaration and
fails clearly for unsupported constraint forms.
`py.typed` is included for consumer type checkers.

The shared models validate both JSON and decoded dictionaries without coercing
numeric strings or booleans into numbers. Integer fields require integers;
collections require lists. Decimal fields accept finite JSON numbers and Python
`Decimal` values, and serialize as JSON numbers in both requests and responses.
Values that would serialize as infinity or turn a nonzero decimal into zero are
rejected. Serialization may otherwise round to floating-point precision.
JSON parsers can lose precision or underflow before field validation; consumers
that need to retain decimal values should decode with
`json.loads(payload, parse_float=Decimal)` before calling `model_validate`.
Units accept their documented string values and Python `Unit` instances;
backend attribute-based foodstuff construction remains supported. Nullable
fields remain required where declared, and resolver objects reject extra fields.
Responses require positive IDs, indexes, servings, preparation times and amounts,
nonnegative nutrition, and step descriptions of 1–200 characters. Nullable
preparation times and nutrition remain supported. Request upper limits do not
apply to responses or calculated nutrition.

Ingredient amounts in resolver requests and recipe writes now require numbers;
previously accepted decimal strings return HTTP 422. Their shared index and
foodstuff ID fields also reject coercion. OpenAPI and Angular's generated
contract reflect numeric amount acceptance.

## Releases and installation

The app's existing `v*` tag workflow publishes a contract wheel on the same
GitHub Release after contract checks and both image builds succeed. Every app
release gets a wheel, even if the models did not change. Patch versions cover
fixes and small changes, minor versions noticeable improvements/features, and
major versions substantial changes. These numbers do not promise wire compatibility.

The tag controls the package version: `v1.2.3` becomes `1.2.3`,
`v1.2.3-alpha` becomes `1.2.3a0`, and `v1.2.3-alpha.4` becomes `1.2.3a4`.
The release builder sets `pyproject.toml` in a temporary package copy and checks
the resulting wheel filename and metadata; the checkout stays at `0.0.0`.
Alpha releases are marked as GitHub prereleases. Pull requests build and test
a `0.0.0` wheel without publishing a release.

Each release includes the wheel, `SHA256SUMS`, and `contract-provenance.json`
recording repository, source commit, tag, package version, filename, and hash.
The manifest is build traceability, not a signed attestation. Assets are not
overwritten on reruns; an existing asset causes publication to fail.

Once the corresponding release exists, installation looks like:

```powershell
python -m pip install "kochwiki-contract @ https://github.com/roithme0/Kochwiki-v2/releases/download/v1.2.3/kochwiki_contract-1.2.3-py3-none-any.whl#sha256=<hash-from-SHA256SUMS>"
```

Replace the example tag/version and hash with the selected release values.
Consumers should pin that URL and hash in their dependency configuration and
test upgrades. Installing the wheel does not verify the deployed API version.

To trial a release build locally, use a new empty output directory and the
checkout's full commit SHA:

```powershell
backend/.venv/Scripts/python.exe backend/contract/tools/build_release.py --tag v1.2.3 --commit <full-commit-SHA> --repository roithme0/Kochwiki-v2 --output backend/contract/dist/release-trial
backend/.venv/Scripts/python.exe -m unittest discover -s backend/contract/tools
```

The script builds artifacts only; it does not create tags or publish releases.
