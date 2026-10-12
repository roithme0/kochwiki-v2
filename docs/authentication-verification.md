# KochWiki OIDC login verification

This slice connects FastAPI to the managed Keycloak `kochwiki` client. Enter
`http://localhost:8000/api/auth/login` directly in a browser. Keycloak handles
login or registration and redirects to `/api/auth/callback`. The backend validates
the identity, creates or reuses a local KochWiki user, and displays a minimal
confirmation with the local user number or an error page.

This does not create an application session, replace the user
selector, or protect existing APIs. The frontend has no login integration yet.
Authorization, AI Service authentication and inter-service authentication remain
outside this slice.

## Configuration

Configure these variables in `deployment/.env` for Compose, or `backend/.env`
when running FastAPI on the host:

| Variable | Local value / purpose |
| --- | --- |
| `OIDC_ISSUER` | `http://localhost:8006/realms/services` |
| `OIDC_CLIENT_ID` | `kochwiki` |
| `OIDC_CLIENT_SECRET` | The identity provider's `KOCHWIKI_CLIENT_SECRET` |
| `OIDC_CALLBACK_URL` | `http://localhost:8000/api/auth/callback` |
| `OIDC_BACKCHANNEL_URL` | Docker only: `http://host.docker.internal:8006/realms/services` |

Issuer, secret and callback must be configured together. Leave them blank to
disable verification; both endpoints then return 503. Partial or unsafe
configuration prevents startup. Secrets belong only in ignored `.env` files.
The client secret must match the provider configuration; changing it on just
one side breaks the code exchange.

The issuer is the canonical browser-facing realm URL and must match discovery
and ID tokens exactly. The callback must be registered in the provider's exact
redirect allowlist. Neither value is derived from request headers. Use
`localhost`, consistently with the configured provider and callback.

The optional backchannel URL changes where the backend fetches discovery,
exchanges codes and obtains signing keys. It does not change the issuer,
browser destination or callback. Docker's `localhost` refers to its own
container, hence the separate local connection address. A host-run backend
should leave the override blank. The local Windows Docker Desktop setup must
be able to reach the provider's published port through `host.docker.internal`.

Public URLs require HTTPS. HTTP is accepted only for loopback development URLs
and the explicitly configured `host.docker.internal` backchannel. This slice's
local HTTP setup is not a public production deployment.

## Run locally

Start the identity-provider local stack and apply its configuration first.
Set the variables above, then run from the KochWiki root:

```powershell
docker compose -f deployment/docker-compose-local.yml up -d --build
```

The backend applies Alembic migrations creating `login_transaction` and mapping
provider identities on `custom_user`. The single user mapping migration requires
an empty user table, renames `username` to non-unique `display_name`, and adds
required email, issuer and subject fields with a unique issuer/subject pair.
If users already exist, migration stops with an explicit operator-reset error;
it does not delete users, link accounts, assign fake identities or backfill values.
The agreed deployment starts with fresh KochWiki databases reset separately by
the operator; no reset is performed by the application or migration. Keycloak
accounts remain unchanged.
Updating Compose environment values
requires recreating the backend container, rather than merely restarting it.

Open `http://localhost:8000/api/auth/login`. Successful login ends on
“Identity successfully verified.” The result deliberately shows no tokens or
personal profile data. Provider errors, invalid/expired transactions and cancelled
login show generic errors. Start a new login explicitly; there is no automatic
request replay or redirect loop. The confirmation includes only the local numeric
user ID. Repeat login should show the same ID. A separate provider account should
show a different ID even when its display name or previously used email matches.
Inspect `/api/users` to verify the name; the public user contract contains only
`id` and `display_name`, without email or provider identity.

The database uniquely maps `(issuer, subject)` and requires both identity fields
and a non-null email snapshot on every user. Email is not unique. An atomic
PostgreSQL upsert handles concurrent first logins and refreshes email and display
name on every validated login. Email never
links accounts and remains unverified profile data in the current provider setup.
Display names are trimmed, allow duplicates, and require 1-50 characters without
control characters. Manual user creation and profile editing are removed from
the API and frontend; `POST /users` and `PATCH /users/{id}` return 405. The temporary
selector remains for existing provider-linked users. Keycloak owns profile fields.
Domain APIs
remain unauthenticated in this slice. Migration downgrade requires display names
to be unique again and will fail if duplicates exist; resolve that separately
before attempting a rollback.

If `GATEWAY_PORT` differs from `8000`, use that port in both the browser URL
and `OIDC_CALLBACK_URL`, and add the exact callback to the identity provider's
`KOCHWIKI_REDIRECT_URIS` before applying its configuration. This workspace's
current local gateway uses `8002` and its ignored environment is aligned with it.

For a backend on the host with Angular's existing development proxy, use
`http://localhost:4200/api/auth/login` and set the callback to
`http://localhost:4200/api/auth/callback`, which is already allowlisted locally.
No frontend source change is needed for this manual navigation.

## Transaction and token safeguards

- Authorization Code flow uses mandatory PKCE S256, random state and nonce.
- A ten-minute transaction resides in PostgreSQL, holding a hashed state,
  hashed browser binding, nonce, verifier and expiry. Provider tokens are not
  stored. Expired transactions are cleaned on subsequent login initiation.
- The browser receives only an opaque `kochwiki_login` cookie: HttpOnly,
  SameSite=Lax, path `/api/auth`, ten-minute lifetime and Secure for HTTPS
  callbacks. Local HTTP callbacks use a development cookie without Secure.
- An atomic database operation consumes the transaction only when both state
  and browser binding match and it has not expired. Consumption commits before
  provider requests, so replay and concurrent callbacks cannot reuse it.
  Transactions survive backend restarts and work across backend instances.
- Starting another login in the same browser replaces the binding cookie;
  an older pending flow will fail. Simultaneous login tabs are not supported
  in this verification slice.
- Discovery must report the configured issuer. Provider endpoints must belong
  beneath that issuer URL. Backend HTTP requests have a ten-second timeout,
  bounded response sizes and do not follow redirects.
- ID tokens require an RS256 signature from the provider's current signing keys,
  the configured issuer and client audience, expiry, issued-at time, nonempty
  subject, matching nonce and correct authorized-party claim when applicable.
  Email, boolean `email_verified` and display name claims must also be present.
  Unverified email is accepted under the agreed initial provider setup.
- Codes and tokens never appear in result pages. The gateway disables access
  logs on `/api/auth/`; the backend redacts query strings across authentication paths
  in Uvicorn access logs. Preserve equivalent redaction if adding other proxies
  or request logging. Result pages disable caching, framing and referrer sharing.
- Tokens are discarded after validation and local profile mapping. No token
  refresh, revocation checks, application session or logout endpoint is implemented.

Validation follows [OIDC ID-token validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)
using [PyJWT verification](https://pyjwt.readthedocs.io/en/stable/usage.html).

## Verification

With backend development dependencies installed and the isolated test database
running:

```powershell
docker compose -f deployment/docker-compose-test.yml up -d db
cd backend
.venv/Scripts/python.exe -m pytest -q
```

The OIDC tests cover identity validation, PKCE, browser binding, expiry,
cancellation, replay, concurrent consumption, provider outages, configuration
and access-log redaction. Identity mapping tests cover stable reuse, email/name
refresh, separate subjects and issuers, reused emails, duplicate names, concurrent
first logins, private response fields, database rejection of missing identities
and email snapshots, missing/null/empty email-claim rejection, non-destructive
migration guards, and removal of manual user creation/profile-edit routes.
The normal backend suite checks existing behavior.

End-to-end verification uses disposable Keycloak and KochWiki stacks. From the
KochWiki root, with PyJWT/cryptography available in the backend environment:

```powershell
../identity-provider/scripts/Verify-Disposable.ps1 -Python "$PWD/backend/.venv/Scripts/python.exe" -KochwikiRepository "$PWD"
```

The runner starts an isolated provider on localhost port 8016, applies the same
realm/profile/client configuration as the regular provider, runs its registration,
OIDC and persistence verifiers, then builds an isolated KochWiki backend/database
and gateway on localhost port 8012. The gateway uses the normal Nginx configuration
with a static Nginx placeholder for the frontend; no frontend build is needed.
The KochWiki verifier exercises registration, email/password login in a fresh
cookie jar, reuse of a provider browser session and rejection of an unbound
callback. It verifies local user creation and reuse, the public user contract and
separate accounts sharing a display name. All scripts reject regular local deployment targets.

Test credentials are fixed public fixtures in the test Compose files. No regular
local environment files or running application containers are changed. Temporary
accounts and database state are removed with the dedicated test resources in
`finally`, including on verification failure. Existing demo accounts in the
persistent realm remain untouched. Ports 8012, 8016 and 8766 must be free, and
concurrent runs are not supported. A killed runner or Docker outage can prevent
cleanup; the identity-provider README documents scoped cleanup commands.

These HTTP/form checks emulate the browser's local Secure-cookie exception;
they do not verify page rendering or replace a manual browser check.

Persistent KochWiki sessions, frontend login wiring and API
authentication are the subsequent implementation slices. Provider revocation,
session renewal and CSRF policies still need their agreed details resolved.
