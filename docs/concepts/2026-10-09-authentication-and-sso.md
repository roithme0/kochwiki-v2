# Kochwiki Authentication and SSO

## Status

Initial concept under discussion. The agreed provider is now self-hosted Keycloak,
replacing Microsoft Entra External ID. Start with Kochwiki authentication;
AI Service authentication and cross-application SSO integration remain deferred.
The first local provider slice now configures the `services` realm through a
repeatable setup/update command in `../identity-provider`. Kochwiki application sessions, frontend authentication integration and production
deployment remain unimplemented.
The second local slice now provides dedicated PostgreSQL storage with a persistent Docker
volume. Existing disposable demo accounts are not migrated. Backups are deferred
from this slice.
The next deployment slice adds Nginx to local, staging and production Compose
definitions. Only Nginx publishes a host port; Keycloak and PostgreSQL remain on
Docker networks. Staging and production use `start`, fixed external URLs,
automatic restart, deployment-specific environment values and independent persistent volumes.
Certificates and HTTPS are explicitly deferred; these HTTP-only definitions are
deployment preparation, not a public production rollout.
All three definitions passed Compose validation. Local proxy verification passed
registration, login, repeat apply and forwarded-header spoofing checks. Login and
provider data also survived PostgreSQL/Keycloak replacement through the proxy.
Staging and production definitions have not been launched in their target environments.
The provider-side Kochwiki OIDC client is now managed by the same repeatable
configuration command. A standalone local callback verifies the login flow and
identity claims before Kochwiki integration. The next agreed slice implements
the actual FastAPI login/callback round trip, with manual browser URL entry and a
minimal verification result. Local user mapping, application sessions and frontend
integration remain subsequent slices.
Local OIDC verification and the existing realm regression checks passed,
including managed-setting repair and preservation of identities and the client
secret. All three Compose definitions validate; the test callback is local-only.
The Kochwiki verification slice now exposes `/api/auth/login` and
`/api/auth/callback` through the existing gateway. Login uses a ten-minute,
single-use PostgreSQL transaction containing state and browser-binding hashes,
nonce, PKCE verifier and expiry. A temporary HttpOnly, SameSite=Lax cookie binds
the transaction to the initiating browser; it is Secure for HTTPS callbacks.
Only one pending login flow per browser is supported initially. Backend-side
code exchange and RS256 ID-token validation establish identity; tokens are
then discarded. Success and failures show generic, non-cached verification
pages without profile data or automatic retries. This does not yet establish
a Kochwiki application session, replace user selection or protect domain APIs.
Configuration is environment-driven, with an optional separate local Docker
backchannel address preserving the canonical issuer. The current local gateway
uses port 8002; its callback and the provider's exact allowlist are aligned.
Login transaction/identity safeguards and the existing backend suite passed.
Actual hosted registration and login through Keycloak, Nginx and FastAPI passed;
callback query values are redacted from backend access logs and gateway auth
access logging is disabled. See `docs/authentication-verification.md` for the
tracked configuration and verification instructions.

The agreed full implementation will have FastAPI manage OIDC login and issue an
opaque browser session cookie.
Open self-registration grants immediate Kochwiki access without invitation or
manual approval. Use Keycloak's standard email-and-password login rather
than introducing an email-code authenticator dependency.
SMTP integration is optional and deferred; initial registration does not require
email verification, and email-based password recovery is disabled.
This is a concept, not an implementation specification. Authorization is
explicitly outside this implementation's scope.

## Goal

Replace unauthenticated user selection with verified sign-in and an authenticated
current user. Establish a foundation that can later support AI Service without
making that service's full authentication implementation a prerequisite for
Kochwiki login. Do not introduce or redesign roles, permissions, ownership,
sharing, or application entitlements.

## Current Context

Kochwiki is a private Angular application backed by FastAPI. Browser API traffic
is same-origin through the deployment gateway or Angular development proxy.

The frontend stores a selected local user ID in local storage and restores the
corresponding user. Its `AuthGuard` checks whether a user is selected; this does
not prove identity. AI conversation requests carry the selected user's identity
through `X-Application-User`; that browser-supplied identity is not authentication.

The gateway forwards selected AI Service routes directly, bypassing FastAPI,
without authentication. Kochwiki also exposes MCP and resolver capabilities used
by AI Service. The first stage focuses on Kochwiki's own functionality handled
by FastAPI; authentication of `/ai` and inter-service communication is deferred.

## Protocol Baseline

OAuth 2.0 provides delegated authorization to protected resources. OpenID Connect
(OIDC) adds standardized user authentication on top of OAuth 2.0. SSO is the
experience of using an existing identity-provider login across applications,
rather than a third protocol layered onto OIDC.

The provisional recommendation is to use OAuth 2.0 through OIDC for Kochwiki's
first login, rather than introduce an OAuth-only login and add identity semantics
later. Authorization Code flow with PKCE is the proposed starting point, managed
by FastAPI. An ID token establishes the
authenticated account for its intended client; it is not an API access token.
The OAuth protocol is part of the authentication integration; designing domain
authorization rules is outside this concept's current implementation scope.

References: [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
and [OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html).

## Preferred Identity Provider

Use self-hosted Keycloak for dedicated accounts belonging to the service family.
Users must not need Microsoft or other external accounts. A shared application
realm named `services` is the agreed foundation for Kochwiki, AI Service, and
future apps; separate OIDC clients and application sessions can support later
SSO. Kochwiki client configuration is defined below; future app clients remain
deferred. Reserve the administrative
`master` realm for Keycloak administration, not application users. Keep the
application realm name stable because it forms part of the OIDC issuer URL.

The sibling repository `../identity-provider` holds the provider setup. Its
current `deployments/docker-compose-local.yml` pins Keycloak 26.8.0, publishes a
configurable localhost-only host port through Nginx, and uses `start-dev` with bootstrap
credentials from environment variables. The local deployment uses port 8006.
Keycloak connects to a dedicated PostgreSQL 16 service through the Docker
network; the database port is not published. A named volume persists database
data across container recreation, and a database health check gates Keycloak
startup. The PostgreSQL image creates the database using `POSTGRES_DB`, supplied
from `KC_DB_NAME`. The initialization script creates a dedicated non-superuser
role and transfers database ownership to it. Initialization and application passwords are
separate secrets in the ignored deployment `.env`; initialization only runs on
an empty volume, so changing the environment file does not rotate stored
credentials. Start with a fresh database instead of migrating demo accounts.
The realm configuration command remains separate and does not recreate
containers. This is a local demo, not an established production deployment.
`deployments/docker-compose-staging.yml` and `docker-compose-prod.yml` provide
separate projects using the same realm configuration and database initialization.
All Compose files use the generic ignored `deployments/.env`, based on a single
`.env.example`. Each deployed repository copy supplies its own secrets, port and
fixed full `KC_HOSTNAME` URL. Running environments side by side from the same
checkout requires explicit port/hostname overrides. The apply wrapper uses the
adjacent `.env` and supports an explicit `-EnvFile` override. Nginx overwrites
forwarded headers, and Keycloak consumes `X-Forwarded-*`. Keycloak has no published
port; PostgreSQL uses a separate internal network shared only with Keycloak.
Nginx resolves the Keycloak service through Docker DNS to support replacement.
The admin console currently shares the proxy endpoint; access restrictions remain
future work. All examples bind to localhost and serve HTTP. Do not expose them
for public authentication before adding HTTPS and certificate renewal, choosing
stable HTTPS issuer URLs and validating proxy behavior. Realm SSL requirements
are retained; external HTTP login may therefore be rejected.
All three deployments configure Nginx's host binding through `BIND_ADDRESS`
(localhost by default) and required `BIND_PORT`; the example port is 8006.
Local also uses the same explicit `KC_HOSTNAME`, `KC_HTTP_ENABLED=true` and
`KC_HOSTNAME_STRICT=true` settings as staging/production while retaining
`start-dev`. Browser access and verification must use the configured hostname
consistently (the example uses `localhost`, not `127.0.0.1`).
Backups and restore procedures are deferred from this slice; a persistent
volume does not protect against disk failure or volume deletion.

Manage the provider configuration as code in `../identity-provider`; no manual
GUI configuration should be required per environment. Use version-controlled
configuration files and one repeatable setup/update command backed by Keycloak's
Admin CLI or Admin REST API. It creates the `services` realm if missing and
updates explicitly managed settings on existing realms, preserving registered
users and settings outside its managed scope. Repeated runs must be safe.
Supply environment-specific URLs and secrets separately; do not commit secrets
or user data. The same process supports initial setup and subsequent updates
and can be automated as a deployment step. Startup realm import alone is
insufficient because it skips existing realms; configuration files are not
automatically reconciled with the database on restart. The GUI remains available
for inspection and troubleshooting.

The first local slice was verified through Keycloak's hosted registration and
login forms: invalid passwords/display names and duplicate emails are rejected;
duplicate display names and immediate access with unverified email are accepted.
Reapplying configuration corrects a changed managed setting while preserving
users, clients, and login. Lockout parameters were verified by readback, not by
exercising the full failed-login threshold. Automated verification uses a disposable provider instance, configured with the
same managed files. Test accounts disappear when its database is torn down;
passwords are not printed or persisted outside that test database.

The persistence slice was also verified by replacing both PostgreSQL and
Keycloak containers while retaining their named database volume. The same realm,
managed settings, profile schema, client IDs, user ID, display name, and password
login survived without reapplying realm configuration. The test database is retained across replacement within the disposable run,
then removed by the runner. The persistent local realm is untouched.

Self-hosting transfers patching, database backups and restore verification,
monitoring, recovery, availability, administrator security, and extension
maintenance to us. Production readiness remains a requirement even for this
personal project. The local deployment now has persistent supported database
storage. Production still needs HTTPS,
correct public hostname and proxy configuration, protected administrative access,
and a maintained deployment. Hosting and email delivery can have recurring costs;
choosing Keycloak does not mean operating authentication is cost-free.

Reference: [Keycloak production configuration](https://www.keycloak.org/server/configuration-production).

## Kochwiki OIDC Client

Group Kochwiki's client and mapper configuration under `config/kochwiki/` in
the identity-provider repository. Realm and shared user-profile configuration
remain at the configuration root; future app clients can use their own folders.

Use the confidential client `kochwiki` within the `services` realm. Enable
Standard Flow (Authorization Code), require PKCE `S256`, and authenticate the
backend with a client secret. Disable Direct Access Grants (password grant),
Implicit Flow and service accounts. The managed configuration also disables
device authorization and CIBA. Users authenticate on Keycloak's hosted pages;
the client secret never reaches Angular.

Supply `KOCHWIKI_CLIENT_SECRET` through the identity-provider deployment's
ignored `.env`, using a different random value per environment. The wrapper
rejects the placeholder and secrets shorter than 32 characters or containing
whitespace. Kochwiki later receives the same value through its own backend
environment. Reapplying retains the configured secret; changing it is deliberate
rotation requiring a coordinated backend update.

Use `/api/auth/callback` as the fixed Kochwiki callback path and configure exact
allowed URLs through the space-separated `KOCHWIKI_REDIRECT_URIS` environment
variable. Local URLs are `http://localhost:8000/api/auth/callback` for Docker and
`http://localhost:4200/api/auth/callback` for Angular development. Kochwiki will
configure its public URL separately to construct a matching callback.

Use `/signed-out` as the fixed return path after logout, with a Sign in button
and no automatic login redirect. Configure its exact allowed URLs through
`KOCHWIKI_LOGOUT_REDIRECT_URIS`. Local URLs are
`http://localhost:8000/signed-out` and `http://localhost:4200/signed-out`.
Staging and production supply HTTPS callback and logout URLs. The wrapper
rejects wildcards, URL credentials, queries and fragments, and permits HTTP only
on loopback hosts in the local deployment. The Kochwiki endpoints and signed-out
page are not implemented by this slice.

Consume validated ID-token claims `iss`, `sub`, `email`, `email_verified`, and
`displayName`. Keycloak supplies the protocol identity claims; three managed
client mappers supply email, verification status and the existing `displayName`
attribute. No role or permission claims are required. New clients start without
additional client scopes; existing scope assignments and unrelated mappers remain
unmanaged. Email verification is not required initially. Kochwiki will map
identity by `(iss, sub)` and refresh email and trimmed display name on login.

The Compose `x-kochwiki` extension resolves client variables for the apply
wrapper without adding the client secret to any container environment. Rendered
client JSON travels over stdin to the helper, which uses a private temporary file
and clears its contents on exit. Full resolved Compose output contains secrets
and must not be printed or committed. Repeat apply updates the existing client
and managed mappers while preserving their identifiers and existing users.
Updates remain sequential and nontransactional.

An independent verification callback tests the provider client without requiring
Kochwiki's backend. The disposable provider allows `http://localhost:8766/callback`;
the listener binds to loopback only while running. This is a verification tool,
not a requirement for every future client. The disposable runner can additionally
start a separate Kochwiki backend/database and the real gateway configuration
for the application round trip. Regular local environments are never test targets.

The verification exercises hosted registration and login, callback state,
single-use code exchange, signed ID-token validation including issuer, audience,
expiry and nonce, and the agreed profile claims. Negative cases cover missing
PKCE, unregistered callbacks, invalid client secrets and invalid PKCE verifiers.
It deliberately changes client and mapper settings, reapplies configuration,
and checks identity and secret preservation. Test accounts exist only in the disposable provider; their random
passwords and issued tokens are neither printed nor saved outside it. This verification
does not establish browser rendering, application session behavior or production
deployment readiness.

## Registration and Access

Anyone who completes registration should immediately be
able to use Kochwiki. No invitation, manual approval, or separate activation is
required. Existing domain behavior is retained; roles, permissions, ownership,
sharing, and entitlements remain out of scope. Current domain restrictions have
not been audited and are not assumed to exist or to be absent.

Use standard email-and-password registration and login. The user accepts this
simpler alternative to email-code authentication to avoid an additional
authenticator extension or custom implementation. Registration collects a unique
email address, password, and a separate required non-unique display name. Omit
first and last name from registration and do not require them. Do not
ask users to choose a login username. Enable Keycloak's Email as username and
Login with email settings, and disable Duplicate emails. Keycloak maintains its
internal username from the email address; it is not an application display name.
Display names allow spaces and capitalization rather than inherit login username
restrictions. Trim leading and trailing whitespace and require 1-50 characters
after trimming; reject blank values and control characters. Keycloak's configured
length validator trims for validation but retains surrounding whitespace in
storage; Kochwiki must trim the claim before persisting or displaying it in the
later application integration slice. Email
verification is disabled initially because SMTP integration is deferred. Email
addresses are self-reported profile data, not proof of mailbox ownership.
Keycloak owns password storage, verification, and password-reset flows. Kochwiki
must not collect or store passwords; authentication takes place on Keycloak's
hosted pages through the existing OIDC direction. The agreed password policy
requires at least 15 characters, allows spaces and passphrases, imposes no
uppercase/number/symbol composition requirements, and has no periodic expiry.
Do not configure a password blocklist or compromised-password check. Length alone
does not prevent common or previously compromised passwords from being accepted.
Enable brute-force protection in Temporary lockout mode and retain
Keycloak 26.8.0's default parameters: 30 failed attempts, Multiple escalation,
a 1-minute wait increment, a maximum wait of 15 minutes, and a failure-counter
reset after 12 hours without failures or a successful login. Retain the default
rapid-attempt settings: a 1000-millisecond quick-login check and a 1-minute
minimum quick-login wait. Do not enable permanent lockouts. These version-specific
defaults should be explicit in the reproducible realm configuration and reviewed
on upgrades. Disable Forgot Password and any required
actions or authentication flows that depend on sending email. Do not configure
SMTP initially. Forgotten passwords require an administrator-assisted reset in
Keycloak, with account ownership established outside the unavailable email flow.
The recovery procedure remains to be defined; an unverified email alone must not
be accepted as proof of ownership.

Persistent Kochwiki sign-in across browser restarts remains the default, without
a required "Stay signed in?" choice. The local persistent session uses a sliding
30-day inactivity timeout; regular qualifying use renews it and background
polling does not. After expiry, return through Keycloak login; an existing
provider session may avoid entering credentials again. Keycloak browser persistence, SSO idle/max
limits, and refresh-token lifetimes must be configured coherently. Built-in
Remember Me presents a choice, so it cannot simply be assumed to implement our
default-persistence requirement.

Explicit logout invalidates the current local session, clears its cookie, and
initiates Keycloak browser logout. Local logout remains effective if the
provider is unavailable. Do not initiate account-wide revocation across devices.
Avoid immediate automatic sign-in through the same provider browser session.
Effects on later SSO applications remain for the SSO stage.

Kochwiki and Keycloak sessions are distinct. Local activity alone does not renew
the provider session or prove fresh email ownership. Provider reauthentication
and an absolute local session limit remain open. Registration abuse protection
belongs to authentication operation; AI quotas remain outside this scope.

Reference: [Keycloak authentication, registration, and session settings](https://www.keycloak.org/docs/26.8.0/server_admin/).

## Scope Boundaries

- Start with Kochwiki authentication. Later AI Service authentication and SSO
  remain part of the direction, without assuming identical application sessions
  or tokens accepted by both services.
- Authorization is explicitly out of scope. Do not introduce or redesign
  application roles, permissions, data ownership, sharing, approval gates, or
  service entitlements. Their design is not a prerequisite for this work.
- Start with fresh local user records for authenticated accounts. Linking or
  migrating existing selected users and their associations is out of scope.
  This concept decision does not authorize deleting existing data.
- Focus this stage on Kochwiki functionality handled by FastAPI. `/ai` gateway
  authentication, AI Service authentication, cross-application SSO integration,
  and inter-service authentication are deferred to the next stage. These are
  not prerequisites for replacing Kochwiki user selection. Existing private
  network assumptions remain in force for unauthenticated service paths.
- Existing AI integration may consume the authenticated current Kochwiki user
  instead of a manually selected user, without treating browser-supplied AI
  identity headers as authenticated service credentials.

## Agreed Login Architecture

### Site Entry and Authentication Boundary

Require sign-in for every Kochwiki application page in this stage, including
the home page and direct links to recipes or other features. On entry, restore
the current session; if no valid session exists, initiate the Keycloak login flow.
Users with a valid session proceed directly to the requested page.

After successful login, return users to their intended Kochwiki page using a
validated local return destination. Do not allow arbitrary external return URLs.
Failed or cancelled login should present a recoverable signed-out state rather
than repeatedly redirecting automatically.

Require authenticated identity for Kochwiki's application API routes, not only
Angular navigation. Unauthenticated API calls return an HTTP 401 response;
browser page navigation handles the interactive login redirect. Login initiation,
OIDC callbacks, the signed-out landing state, required frontend assets, and
necessary operational health endpoints must remain reachable without a session.
These exceptions support login and operations; they do not expose domain features.

Anonymous functionality, such as viewing recipes without login, is an intended
future capability but explicitly deferred. `/ai` and inter-service authentication
retain the separate scope boundary described above.

### Backend Sessions

FastAPI owns the OIDC login flow and validates the identity returned by Keycloak.
It establishes the current local Kochwiki user and creates a server-side session.
The browser receives a random opaque session identifier in a Secure, HttpOnly
cookie. Angular restores the current user from the backend rather than trusting
a user ID selected or stored by the browser. Keycloak tokens stay server-side.

Store server-side sessions in the existing PostgreSQL database. Sessions should
survive backend restarts and be available to every backend instance using that
database. This avoids introducing an additional service solely for session
storage. The browser cookie contains only an opaque session identifier, not
provider tokens or user profile data.

Renewal mechanics, cookie SameSite behavior, CSRF protection, and expired-session
cleanup must be defined for a production implementation. Existing FastAPI can
own this flow without requiring a separate authentication service.

Future applications can maintain their own sessions and reuse the Keycloak login
for SSO; sharing Kochwiki's session cookie across services is not required.

Reference: [IETF browser application architecture guidance](https://www.rfc-editor.org/rfc/rfc10017.html).

## Local User Records

Create a fresh local Kochwiki user on first successful sign-in and reuse it on
later sign-ins. Do not link to existing manually selected users or migrate their
associations. The backend owns identity mapping; the browser cannot choose the
local user it authenticates as.

Replace the Entra-specific `tid`/`oid` mapping with the OIDC issuer and subject
pair (`iss`, `sub`) from a validated Keycloak ID token. Accept only the configured
realm issuer and Kochwiki client audience. Enforce uniqueness locally, including
concurrent first logins. Verify subject configuration across future clients
before relying on it for cross-application correlation. The public issuer URL
must be stable; hostname or realm migrations need an explicit identity migration.

Email is profile information, not an identity key. Never automatically merge or
link accounts by email. Deleting and recreating a provider account must produce
a distinct identity even when its email is reused. Refresh the local email on
every successful login from validated claims, without requiring `email_verified`
to be true in the initial setup. Token validation proves the claim came from
Keycloak, not that the user owns that mailbox. Do not treat this email as a
verified recovery address or trusted recipient for sensitive information.

Replace the current required unique `username` (50-character limit) with a
required non-unique display name. Collect it during provider registration;
users must not have to find an unused display name or expose email as that name.
Keycloak uses the email address as its internal username, but neither field is
the local identity key or the name shown throughout Kochwiki.
Keycloak owns both email and display name across the service family. The managed
custom `displayName` attribute and matching ID-token claim mapper are implemented
in the provider configuration. Apply the agreed display-name
validation rules. Do not conflate this display name with Keycloak's login username
or collect first/last names during registration.

Refresh both fields from newly issued validated login claims on successful
login. Database, backend response, and frontend contract changes must ship
together. Already signed-in apps may retain older values until their next login.
Faster cross-application synchronization remains optional and undecided.
Profile synchronization does not require an administrative API read on login.

Existing recipes and other domain data are not disposable. Check old-user
references against the actual data model before implementation; destructive
cleanup is not authorized.

References: [OIDC subject identifiers](https://openid.net/specs/openid-connect-core-1_0.html#SubjectIDTypes)
and [Keycloak user profiles and claim mapping](https://www.keycloak.org/docs/26.8.0/server_admin/).

## Account Status and Session Revocation

Keep last qualifying activity separate from the last successful provider
validation. Update activity for the sliding 30-day local inactivity window.
Retain the original authentication time; successful checks and activity do not
reset it. Reject expired or locally invalidated sessions before upstream checks;
never revive an expired session.

Preserve the agreed 15-minute validation cache and fail-closed behavior. Before
executing a protected operation, perform provider validation if that cache has
expired. Only success advances the check timestamp. Coordinate concurrent checks
across requests and backend instances.

The Entra Graph integration and its `accountEnabled` /
`signInSessionsValidFromDateTime` comparison no longer apply. The Keycloak
mechanism is deliberately unresolved. Evaluate regular online refresh tokens,
token introspection, and OIDC back-channel logout, with narrowly scoped Admin
REST reads only if needed. These mechanisms have different guarantees; none is
accepted as a drop-in replacement merely because Keycloak supports it.
Verify deleted/disabled accounts, administrative session revocation, logout,
reauthentication, token expiry, and a subsequent fresh login against
the actual realm. Local JWT verification alone is not a current status check.
Do not assume introspection of an expired access token proves account revocation.
Do not use offline tokens as a shortcut without revisiting their logout semantics.

Confirmed deletion or disabling invalidates the account's local sessions.
Confirmed provider session revocation invalidates affected local sessions;
a subsequent fresh authentication must remain valid. Preserve the desired
detection on the next protected request after the cache expires, subject to
provider behavior. Inactive users do not need background polling. The exact
mapping between provider and local sessions, required token storage/renewal,
permissions, and provider idle/max limits must be resolved before implementation.

On timeout, throttling, outage, or integration failure, deny the protected request,
retain the local session, and display a temporary error without a retry action.
Do not automatically replay failed application requests. A later normal request
attempts the overdue check again. No access grace period, successful-check update,
or activity renewal is permitted on failure. Do not return authentication 401,
force logout, or redirect to login for an upstream availability failure. Local
inactivity expiry still applies during an outage.

Reference: [Keycloak OIDC endpoints, introspection, and logout](https://www.keycloak.org/securing-apps/oidc-layers).

## Optional Enhancement: Email Delivery and Recovery

Use Synology MailPlus Server as the mail service, forwarding outbound messages
through an external email provider. Keycloak submits mail to MailPlus using
authenticated, encrypted SMTP. Provider choice, sender domain, credentials,
network access, and delivery configuration remain to be resolved.

This extension is not a prerequisite for initial authentication. Until it is
implemented, keep email verification, email-based password reset, and other
email-dependent features disabled. After delivery is verified, enable verification
and password recovery deliberately and test both complete user flows. Existing
accounts need an explicit verification transition; do not mark previously
self-reported email addresses verified automatically. Authentication and recovery
must continue using the stable provider identity, not email-based account merging.

MailPlus and the relay add operational dependencies and potentially recurring
costs. Monitor delivery failures and protect SMTP credentials. Adding this
extension does not permit login-email editing within Kochwiki.

## Optional Enhancement: Display-Name Editing in Kochwiki

A future Kochwiki profile page may edit the shared display name. Keycloak remains
the source of truth: update the provider first, then the local copy after confirmed
success. Other apps receive the change at their next login unless faster profile
synchronization is added. Older cached claims must not overwrite a confirmed edit.

Microsoft Graph and its delegated permissions are no longer applicable. Verify a
supported Keycloak self-service integration before selecting it. If Admin REST
writes are required, restrict credentials and permissions as far as supported,
bind the target account server-side to the authenticated subject, and prevent
any other profile-field edits. Broad administrative access is a material tradeoff,
not an automatic consequence of adding a profile form. Provider-side validation
and authorization still apply; application domain authorization remains out of scope.

The feature includes an Angular form, a narrow FastAPI endpoint, validation,
CSRF protection, secure token/credential handling, failure recovery, and coordinated
contracts. Cover wrong-user targeting, upstream rejection, expired credentials,
and provider success followed by local persistence failure. The UI reports
success only after provider confirmation.

Tentative planning estimate: 2-4 working days beyond working authentication if a
suitable supported API and credential lifecycle are available; allow another
1-2 days for additional credential integration. This must be re-estimated after
Keycloak permissions and profile APIs are verified. The earlier Graph estimate
is not evidence of equivalent Keycloak effort. No profile write access is needed
in the initial implementation.

Changing login email from Kochwiki remains explicitly excluded, including from
optional enhancements. No separate profile editor is required initially.

Reference: [Keycloak Admin REST API](https://www.keycloak.org/docs-api/26.8.0/rest-api/index.html).

## Decisions to Resolve

1. How should administrator-assisted password recovery establish ownership
   while email-based recovery is disabled?
2. Which Keycloak validation/revocation mechanism meets the 15-minute checks and
   failure behavior? What tokens, permissions, and session settings does it require?
3. Is periodic provider reauthentication or an absolute local session limit needed?
4. What cookie, CSRF, and session lifecycle policies suit this deployment?
5. What production hosting, backup/recovery, monitoring, and upgrade
   arrangements belong in the identity-provider repository?

## Risks

Existing client-selected user IDs must not become trusted authentication claims.
Protecting only Angular routes would not protect APIs. `/ai`, AI Service, and
inter-service authentication are deferred, so this stage must not be described
as protecting the entire service ecosystem. Browser-supplied AI identity headers
remain unverified at that boundary until the later integration. Authentication
alone does not establish per-user data isolation or permission enforcement;
those properties are not deliverables of this implementation.
