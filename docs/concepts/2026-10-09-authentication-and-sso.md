# Kochwiki Authentication and SSO

## Status

Initial concept under discussion. The agreed goal is to introduce authentication
starting with Kochwiki, with later authentication for AI Service and an eventual
single sign-on experience. Microsoft Entra External ID in an external tenant is
the preferred provider direction, prioritizing lower operational effort over
self-hosted Keycloak, subject to confirming the remaining requirements. FastAPI
will manage OIDC login and issue an opaque browser session cookie. The chosen
sign-up and sign-in method is email plus
one-time code, without an application password. Open self-registration grants
immediate Kochwiki access without invitation or manual approval. This document
records the evolving concept, not an implementation specification. Authorization
is explicitly outside this implementation's scope.

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

Focus on Microsoft Entra External ID in an external tenant for consumer accounts.
Users should create a dedicated account for the service family, authenticated
through email plus one-time code, without a separate application password or
a requirement to use personal Microsoft or organizational accounts. One account
should serve Kochwiki, AI Service, and future applications in the SSO scope.
Open self-registration grants immediate Kochwiki access. No invitation, manual
approval, or separate application activation is required. This decision applies
to Kochwiki; access to AI Service and future applications is not yet defined.

External ID supports local email plus one-time code for registration and login.
It also supports SSO between applications
registered in the external tenant. These capabilities fit the current direction;
separate application registrations and sessions are the provisional approach.

Microsoft operates the identity infrastructure. We retain responsibility for
tenant security, administrator access to Entra, application configuration,
and integration maintenance. Production readiness is a requirement
even for this personal project. Costs, MFA requirements,
and session/logout behavior still require evaluation before final commitment.

## Registration and Access

Anyone who completes registration should immediately be able to use Kochwiki.
No invitation, manual approval, or separate activation is required. This work
replaces the user selection mechanism with authenticated identity. Existing
domain behavior is retained; new roles, data permissions, ownership, sharing,
and entitlements are explicitly out of scope. Current domain restrictions have
not been audited and are not assumed to exist or to be absent.

Registration and fresh authentication use a one-time code delivered to the
user's email address. Email verification is explicitly accepted. No separate
approval step after registration is intended. This approach avoids requiring
users to remember or store a password for the service family.

Email-code authentication does not require a new code every time Kochwiki is
opened. Persistent sign-in across browser restarts is the agreed default, without
a required "Stay signed in?" choice. Entra browser-session policy and Kochwiki's
own persistent session cookie must be designed together. Regular use should
extend the local session through a sliding 30-day inactivity timeout, avoiding routine
email-code prompts for active users. Mere background polling should not keep an
otherwise unused session alive. After 30 days without qualifying use, the local
session expires and the user returns through the Entra login flow; an existing
Entra session may allow this without a new email code.

Explicit logout invalidates the current server-side Kochwiki session, clears its
browser cookie, and initiates Entra logout in that browser. Local logout must
remain effective even if Entra logout is unavailable or interrupted. It does
not revoke sessions on other devices. The intended experience is to avoid
immediate automatic sign-in through the same Entra browser session after logout.
Effects on future SSO applications will be resolved during the later SSO stage.

The local session and Entra's authentication session are distinct. Extending a
Kochwiki session does not renew Entra's session or demonstrate fresh email
verification. Account status and revocation are checked as described below;
provider reauthentication and any absolute session limit remain to be defined.
Fresh authentication depends on mailbox access and timely email delivery.

Reference: [External ID user flows and persistent browser sessions](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-user-flow-sign-up-sign-in-customers).

Registration abuse protection can be considered as part of operating the
authentication flow. AI usage entitlements and quotas are outside this scope.

Self-hosted Keycloak is no longer the focus because its patching, backups,
monitoring, recovery, and availability introduce ongoing operating responsibility.

References: [External tenant configuration](https://learn.microsoft.com/en-us/entra/external-id/tenant-configurations),
[Local account registration and recovery](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers),
and [External ID capabilities including SSO](https://learn.microsoft.com/en-us/entra/external-id/external-identities-overview).

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
the current session; if no valid session exists, initiate the Entra login flow.
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

FastAPI owns the OIDC login flow and validates the identity returned by Entra.
It establishes the current local Kochwiki user and creates a server-side session.
The browser receives a random opaque session identifier in a Secure, HttpOnly
cookie. Angular restores the current user from the backend rather than trusting
a user ID selected or stored by the browser. Entra tokens stay server-side.

Store server-side sessions in the existing PostgreSQL database. Sessions should
survive backend restarts and be available to every backend instance using that
database. This avoids introducing an additional service solely for session
storage. The browser cookie contains only an opaque session identifier, not
provider tokens or user profile data.

Renewal mechanics, cookie SameSite behavior, CSRF protection, and expired-session
cleanup must be defined for a production implementation. Existing FastAPI can
own this flow without requiring a separate authentication service.

Future applications can maintain their own sessions and reuse the Entra login
for SSO; sharing Kochwiki's session cookie across services is not required.

Reference: [IETF browser application architecture guidance](https://www.rfc-editor.org/rfc/rfc10017.html).

## Local User Records

Create a fresh local Kochwiki user on the first successful sign-in and reuse it
on subsequent sign-ins. Do not link the authenticated account to a pre-existing
manually selected user or migrate that user's associations. The backend owns
the mapping from validated provider identity to the local user; the browser
cannot choose which local user it authenticates as.

The agreed identity key is the pair of Entra tenant ID (`tid`) and user object
ID (`oid`) from a validated ID token. Accept identities only from the configured
external tenant and expected issuer, with the token intended for Kochwiki's
client. Enforce uniqueness of this pair locally so repeat or concurrent first
sign-ins do not create multiple users for the same provider identity. Entra's
`sub` is application-specific; `tid` and `oid` also suit later correlation across
applications in the same tenant.

Extend the Kochwiki user with an email column. Email is profile information,
not the identity key, and must not trigger automatic linking or merging of
accounts. Deleting and recreating an Entra account produces a new identity even
if the email is reused. Obtain email from Entra on each successful login and
refresh the local value. Exact claim configuration remains an implementation
detail to verify with the selected user flow.

The current user model contains a required, unique `username` with a 50-character
limit, and the current user response contains only `id` and `username`. Replace
this username with a required, non-unique display name, specified by the user
during the Entra registration flow. Different users may have identical display
names; identity is determined solely by the validated provider identity mapping.
Do not ask users to find an unused name or use their email as the display name.

Adding email and replacing username requires coordinated database, backend
response, and frontend contract changes when implemented. Entra is the source
of truth for both email and display name across the service family. Refresh both
local fields from newly issued, validated login claims on every successful
login. Claim configuration must include these fields. Profile synchronization
uses login claims rather than Graph profile reads. The initial implementation
does require a separate read-only Graph integration for account status and
revocation checks, described below.

Already signed-in applications can retain older profile values until their next
login. More immediate cross-application synchronization is an optional future
enhancement, not part of the initial implementation. Its mechanism is undecided.

Reference: [Microsoft ID token claims and stable identity guidance](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference).

Existing recipes and other domain data are not declared disposable by this
decision. Any required treatment of references to old users must be checked
against the actual data model before implementation; destructive cleanup is
not part of this concept.

## Account Status and Session Revocation

Track last qualifying activity separately from the last successful Entra
validation. Update activity on each qualifying request for the sliding 30-day
inactivity window; background polling must not count as activity. Record the
original authentication time separately for comparison with provider revocation.
Neither activity nor successful checks reset that original authentication time.

On each protected request, first reject a locally expired or invalidated session.
Never revive an expired session by recording new activity. If the cached Entra
validation is less than 15 minutes old, reuse it. Otherwise perform a read-only
Graph check before executing the protected operation. Only successful validation
advances the successful-check timestamp. Concurrent requests and backend
instances should coordinate checks to avoid redundant upstream requests.

Check account existence, enabled status, and session revocation rather than
existence alone. The intended Graph inputs are `accountEnabled` and
`signInSessionsValidFromDateTime`, with revocation compared against the session's
original authentication time. Verify exact permissions, claim/time semantics,
and property availability in the external tenant before implementation. This
integration requires read access, not the optional profile editor's Graph write
permission.

A confirmed deleted or disabled account invalidates its local sessions. A
confirmed revocation invalidates sessions authenticated before the revocation
cutoff; a later successful authentication is not invalidated by an older cutoff.
Detection occurs on the next request after the 15-minute cache expires, subject
to Entra propagation delays. No background polling of inactive users is required.

If Graph validation cannot complete because of a timeout, throttling, service
outage, or integration failure, deny the protected request, retain the local
session, and display a temporary error without a retry action. Do not
automatically replay failed application requests. A later normal request
attempts the overdue Graph check again; retaining the session does not permit
access until validation succeeds. Do not treat the failure
as an authentication HTTP 401, trigger automatic logout or login redirects,
advance the successful-check timestamp, or extend activity from the rejected
request. There is no grace period that permits access using an overdue check.
Normal activity tracking resumes after validation succeeds. Local session expiry
still applies while validation is unavailable.

References: [Graph user status and revocation properties](https://learn.microsoft.com/en-us/graph/api/resources/user?view=graph-rest-1.0)
and [Entra versus application session revocation](https://learn.microsoft.com/en-us/entra/identity/users/users-revoke-access).

## Optional Enhancement: Display-Name Editing in Kochwiki

A future Kochwiki profile page may let the signed-in user edit their shared
display name without visiting an Entra administration portal. FastAPI writes
the new `displayName` to Entra through Microsoft Graph, then updates Kochwiki's
local copy after confirmed success. Other apps obtain the change at their next
login unless the optional synchronization enhancement has been implemented.
Do not overwrite the confirmed update from an older cached token's claims.

Prefer delegated Graph `User.ReadWrite` and `PATCH /me`, binding the operation
to the authenticated account rather than granting the app tenant-wide profile
write access. Configure Graph permission and consent in Entra, and acquire
Graph-audience access tokens server-side. An existing Kochwiki session cookie
or OIDC ID token alone cannot authorize a Graph request. Token caching, secure
storage, renewal, and any necessary reauthentication must be designed; a
30-day sliding local session does not guarantee a usable Graph token.

The feature includes an Angular form, a narrowly scoped FastAPI endpoint,
display-name validation, CSRF protection, Graph failure handling, and coordinated
frontend/backend contracts. Meaningful tests should cover current-user binding,
expired-token behavior, upstream rejection, and uncertain or partial outcomes.
The UI must not claim a successful update before Entra confirms it. A Graph
success followed by a local persistence failure needs a recovery path.

Rough engineering estimate: 2-4 working days beyond an operational login/session
implementation, assuming a standard OIDC library with usable server-side token
acquisition and no new infrastructure. This includes tenant configuration, form
and endpoint implementation, error handling, tests, and verification against a
real external tenant. Allow a further 1-2 days if token-cache integration,
incremental consent, or a fresh-authentication challenge is not already supported.
These are planning estimates, not a measured delivery commitment. This is a
bounded feature, but most work is in token lifecycle and reliable integration
rather than the Graph update request itself. Profile editing remains optional
and does not add Graph write permission to the initial login scope.

Changing the login email from Kochwiki is explicitly excluded, including from
optional enhancements. This feature must not edit `mail`, sign-in identities,
or login email addresses. No separate profile editor is required initially.

References: [External ID self-profile permissions](https://learn.microsoft.com/en-us/entra/external-id/customers/reference-user-permissions),
[Graph user updates](https://learn.microsoft.com/en-us/graph/api/user-update?view=graph-rest-1.0),
and [Microsoft's profile-editing example](https://devblogs.microsoft.com/identity/external-id-profile-edit/).

## Decisions to Resolve

1. Is any periodic provider reauthentication or absolute local session limit
   required in addition to inactivity expiry and the agreed revocation checks?
2. What cookie, CSRF, and session lifecycle security policies suit this deployment?
3. Which profile fields and validation rules should the user response expose?

## Risks

Existing client-selected user IDs must not become trusted authentication claims.
Protecting only Angular routes would not protect APIs. `/ai`, AI Service, and
inter-service authentication are deferred, so this stage must not be described
as protecting the entire service ecosystem. Browser-supplied AI identity headers
remain unverified at that boundary until the later integration. Authentication
alone does not establish per-user data isolation or permission enforcement;
those properties are not deliverables of this implementation.
