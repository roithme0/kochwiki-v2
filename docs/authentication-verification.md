# KochWiki OIDC login verification

This slice connects FastAPI to the managed Keycloak `kochwiki` client. Enter
`http://localhost:8000/api/auth/login` directly in a browser. Keycloak handles
login or registration and redirects to `/api/auth/callback`. The backend validates
the identity and displays a minimal confirmation or error page.

This does not create a KochWiki user or application session, replace the user
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

The backend applies the additive Alembic migration creating `login_transaction`.
Existing users and domain data are preserved. Updating Compose environment values
requires recreating the backend container, rather than merely restarting it.

Open `http://localhost:8000/api/auth/login`. Successful login ends on
“Identity successfully verified.” The result deliberately shows no tokens or
personal profile data. Provider errors, invalid/expired transactions and cancelled
login show generic errors. Start a new login explicitly; there is no automatic
request replay or redirect loop.

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
- Tokens are discarded after validation. No refresh, revocation checks,
  application session, logout endpoint or local identity mapping is implemented.

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
and access-log redaction. The normal backend suite checks existing behavior.

With both local stacks running, from the KochWiki root:

```powershell
backend/.venv/Scripts/python.exe backend/tests/verify_oidc_login.py --allow-user-creation
```

For this workspace's current gateway, add `--base-url http://localhost:8002`.

This HTTP/form verification creates one disposable provider account and retains
it; credentials and tokens are never printed. It exercises registration,
email/password login in a fresh browser cookie jar, reuse of an existing provider
browser session and rejection of an unbound callback through the real gateway.
It permits only local HTTP `localhost` addresses. The verifier emulates the
browser's local Secure-cookie exception for Keycloak; it does not verify page
rendering or replace a manual browser check.

Persistent KochWiki sessions, local user mapping, frontend login wiring and API
authentication are the subsequent implementation slices. Provider revocation,
session renewal and CSRF policies still need their agreed details resolved.
