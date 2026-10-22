# KochWiki OIDC login verification

Angular verifies the current local session through `/api/auth/me` at application
entry to a guarded route. Home and every domain page wait for this result. A 401 starts browser
navigation to `/api/auth/login`; Keycloak handles login or registration and
redirects to `/api/auth/callback`. FastAPI validates identity, creates or reuses
a local user, establishes a session and redirects to the fixed same-origin home
path `/`. Existing valid sessions can open deep links directly; newly authenticated
users always land home. No return URL is accepted.

Temporary backend failures keep application content hidden and show an error,
without automatic login loops or a retry action. Logout uses same-origin
`POST /api/auth/logout`. Success or an already absent session (401) clears the
frontend identity and opens `/signed-out`; other failures retain identity and show
an error. The signed-out page contains only a short hint and explicit sign-in
button, and reloading it does not initiate login. Keycloak sessions remain active,
so the sign-in button may return directly home through the provider.

Existing domain APIs remain unauthenticated. Authorization, provider revocation
checks, AI Service authentication and inter-service authentication remain outside
this slice. The AI identity header now comes from the authenticated local user,
but remains browser-supplied identity rather than a service credential.

Session state is managed by `ActiveUserService`, which neither inspects URLs nor
navigates. Guards request a shared session check and initiate browser login when
a session is absent. The unguarded signed-out page initiates login only through
its button. The header delegates logout to `AuthNavigationService`, which navigates there
only after the session service confirms logout. Merely injecting
the session service does not initiate a request.

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
| `OIDC_ALLOW_INSECURE_HTTP` | Defaults to `false` in the backend; staging Compose temporarily defaults to `true` until TLS is configured. |

The temporary HTTP override permits non-local HTTP issuer, callback and backchannel
URLs while retaining all other URL validation. Staging Compose reads the override
from `deployment/.env`; local and production Compose do not enable it. HTTP exposes
login traffic and session cookies to interception. Once staging TLS is ready, set
`OIDC_ALLOW_INSECURE_HTTP=false` in `deployment/.env`, switch the public issuer and
callback URLs to HTTPS, and register the HTTPS callback with the provider. Set any
backchannel override to HTTPS or remove it. HTTP callbacks produce cookies without
the Secure flag; HTTPS callbacks produce Secure cookies.

Issuer, secret and callback must be configured together. Leave them blank to
disable verification; login and session endpoints then return 503. Partial or unsafe
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

The backend applies Alembic migrations creating `login_transaction` and `application_session`, and mapping
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

Open the frontend on the configured app origin. After login, the callback redirects
home; `/api/auth/me` returns local `id` and `display_name`, without email or provider
identity. Repeat login should return the same ID. A separate provider account
should have a different ID even if its display name or previously used email
matches. Provider errors, invalid/expired transactions and cancelled login show
generic callback error pages. Start a new login explicitly; there is no automatic
request replay or redirect loop.

The database uniquely maps `(issuer, subject)` and requires both identity fields
and a non-null email snapshot on every user. Email is not unique. An atomic
PostgreSQL upsert handles concurrent first logins and refreshes email and display
name on every validated login. Email never
links accounts and remains unverified profile data in the current provider setup.
Display names are trimmed, allow duplicates, and require 1-50 characters without
control characters. Manual user creation and profile editing are removed from
the API and frontend; `POST /users` and `PATCH /users/{id}` return 405. The frontend no longer offers a selector. Keycloak owns profile fields.
Domain APIs
remain unauthenticated in this slice. Migration downgrade requires display names
to be unique again and will fail if duplicates exist; resolve that separately
before attempting a rollback.

If `GATEWAY_PORT` differs from `8000`, use that port in both the browser URL
and `OIDC_CALLBACK_URL`, and add the exact callback to the identity provider's
`KOCHWIKI_REDIRECT_URIS` before applying its configuration. This workspace's
current local gateway uses `8002` and its ignored environment is aligned with it.

For a backend on the host, Angular's development proxy provides the same-origin
API path. The current `npm start` port is `4202`: use
`http://localhost:4202` and configure `OIDC_CALLBACK_URL` as
`http://localhost:4202/api/auth/callback`. The provider's exact redirect allowlist
must contain that callback. Register it before using this port; earlier examples
used `4200`. If serving Angular on another port, align the browser origin, callback
and provider allowlist with that port. The browser app origin must equal the
configured callback origin, including scheme and effective port, because local
logout validates Origin against it. This slice does not change environment values
or provider configuration.

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
  refresh or provider revocation checks are implemented.

Validation follows [OIDC ID-token validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)
using [PyJWT verification](https://pyjwt.readthedocs.io/en/stable/usage.html).

## Local application sessions

A successful callback generates a fresh 256-bit random opaque `kochwiki_session`
cookie and stores only its SHA-256 hash in PostgreSQL. Its host-only scope has no
Domain attribute; its path is `/api`, with HttpOnly, SameSite=Lax and Secure for
HTTPS callback URLs (loopback HTTP development omits Secure). The login callback
maps the validated user and creates the session in one transaction, invalidating
any previous session identified by that browser cookie. Failed logins preserve an
existing application session. No provider credentials or duplicated profile
fields are stored on session records.

`GET /api/auth/me` returns only `id` and `display_name`. It is the qualifying
authenticated endpoint in this slice: an atomic database update checks the
30-day inactivity deadline **before** renewing `last_activity_at`, then refreshes
the browser cookie Max-Age and absolute Expires to another 30 days. Other existing
API usage does not renew a session yet. PostgreSQL time is authoritative. Invalid,
missing or expired session secrets return 401 and clear the cookie; all auth
responses disable caching. Renewals and logout serialize on the session row,
so concurrent renewal cannot recreate a logged-out or expired session. Concurrent
browser responses may set slightly different cookie expiry times; the database
expiry always governs validity.

`POST /api/auth/logout` invalidates only the current local session and clears its
cookie (204); invalid/expired sessions return 401 and clear it. Keycloak sessions
are preserved. Logout requires exactly one Origin matching the configured
`OIDC_CALLBACK_URL` scheme, hostname and effective port (default 80/443 are
normalized). Missing, null, malformed, duplicate and foreign Origin headers
return 403 without modifying the session. This is the configured public app
origin; request Host and forwarded headers never determine trust. Command-line
verification must explicitly send this Origin. No additional configuration is
required; `/auth/me` and `/auth/logout` return 503 when OIDC is disabled.

Session records contain internal id, unique secret hash, local-user foreign key,
creation time, last activity and nullable `last_provider_check_at`. The latter
remains null: no provider session checks or revocation detection run yet. Deleting
a local user cascades to its sessions. Every configured `/auth/login` initiation deletes expired application sessions
across all users in a short committed transaction before provider discovery.
Cleanup uses PostgreSQL time and the same 30-day inactivity boundary as session
validation, including exactly 30 days. Valid sessions and user records are
preserved; concurrent row changes are rechecked before deletion. Cleanup still
commits when provider discovery subsequently fails. There is no background
cleanup: without further login initiations, expired rows remain stored but
unusable. Expired login transactions retain their separate existing cleanup. Session cookies
are bearer secrets: keep cookie headers out of logs and error reports. The `/api`
cookie path is scoped for current HTTP APIs; future MCP authentication needs its
own scope decision.

For manual verification after login, inspect `/api/auth/me`, then use the header
menu to log out. The signed-out page must survive reload without starting login.
The following browser-console request from a frontend page on the configured app
origin also logs out. Do not run it on the `/api/auth/me` JSON page, whose strict
Content Security Policy blocks fetch:

```javascript
await fetch('/api/auth/logout', { method: 'POST' });
```

The browser supplies Origin automatically. `/api/auth/me` should then return 401;
a fresh explicit login can reuse the still-active Keycloak session.

## Verification

With backend development dependencies installed and the isolated test database
running:

```powershell
docker compose -f deployment/tests/docker-compose-test.yml up -d db
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
Session tests cover hash-only persistence, cookie flags, current-user privacy,
sliding renewal, expired-session rejection, rotation, user deletion, CSRF checks,
local logout, concurrent renewal/logout, cross-user expired-session cleanup,
the exact expiry boundary, provider failure after cleanup and concurrent
cleanup versus session renewal/deletion. The normal backend suite checks existing behavior.

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
separate accounts sharing a display name, persistent local sessions, authenticated-user
lookup, CSRF logout and preserved Keycloak/browser sessions. All scripts reject regular local deployment targets.

Test credentials are fixed public fixtures in the test Compose files. No regular
local environment files or running application containers are changed. Temporary
accounts and database state are removed with the dedicated test resources in
`finally`, including on verification failure. Existing demo accounts in the
persistent realm remain untouched. Ports 8012, 8016 and 8766 must be free, and
concurrent runs are not supported. A killed runner or Docker outage can prevent
cleanup; the identity-provider README documents scoped cleanup commands.

These HTTP/form checks emulate the browser's local Secure-cookie exception;
they do not verify page rendering or replace a manual browser check.

Frontend regressions verify session-gated rendering/routing, rejection of forged
stored identity, missing-session login, backend failures without retry actions,
passive signed-out reload, explicit sign-in, logout failure/401/success and stale
current-user responses. Conversation tests cover observer disposal and ignored
late responses after identity loss, including explicit logout navigation.
Protection of domain APIs and provider revocation checks remain subsequent slices;
`/me` runs once on the first guarded navigation and there is no polling. AI Service authentication
remains deferred.
