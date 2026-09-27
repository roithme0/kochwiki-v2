# AI Service gateway connection

Kochwiki relays only `/ai/api/v1/agents/{agent_name}/sessions`, an individual
session, and its `/messages` and `/turns` resources. It removes `/ai` and
preserves `/api`, methods, query strings, JSON bodies, and upstream errors.
Other `/ai` requests return 404. This is routing, not authorization: both
applications must remain within the agreed private network boundary.

Agent names may contain ASCII letters, digits, hyphens, and underscores.
Kochwiki, demo, and new or renamed agents share the same routing rules;
enabling an agent in AI Service does not require editing either proxy.

## Deployment

All local, staging, and production Compose gateways accept `AI_GATEWAY_URL`.
It must be an HTTP or HTTPS **origin**, with optional port, without a trailing
slash, credentials, path, query, or fragment. The `/api` prefix comes from the
forwarded request; do not put it in this setting. Examples:

```powershell
$env:AI_GATEWAY_URL = 'http://host.docker.internal:8004'
docker compose -f deployment/docker-compose-local.yml up -d gateway
```

Alternatively put `AI_GATEWAY_URL=http://ai-gateway.example.internal:8004`
in an untracked operator `.env` file and use Compose's `--env-file` option.
The services have separate Compose projects and independently exposed ports;
they need neither a shared Docker network nor AI Service entries in Kochwiki
Compose. Their default exposed ports can collide: choose distinct
`GATEWAY_PORT` values when both run on one host.

Inside the Kochwiki gateway container, `localhost` refers to that container.
Use the other gateway's externally reachable hostname/IP and exposed port.
Docker Desktop provides `host.docker.internal` for services on the host.
Linux operators need a reachable host address or their own host-gateway
mapping; this configuration does not assume Docker Desktop hostnames exist
on every platform. Docker's embedded DNS resolver is used at request time,
so an unavailable AI hostname does not prevent Nginx startup. DNS results
are cached for ten seconds. HTTPS uses SNI; apply the same private-network
and trusted-upstream requirements as the rest of this deployment.

Unset configuration returns 503 for supported AI routes. Unresolved or
unreachable upstreams return gateway errors, while frontend and `/api/`
routing remain independent. Invalid origin syntax fails configuration
explicitly. Restart/recreate the gateway after changing its environment.

## Angular development

For persistent local configuration, create an untracked `frontend/.env`:

```dotenv
AI_GATEWAY_URL=http://localhost:8004
```

`frontend/proxy.conf.cjs` loads this optional file using Node's built-in
`process.loadEnvFile()`, regardless of the current working directory. Then
run `npm start` from `frontend`. Existing shell variables take precedence
over values in the file. This configures Angular independently from Compose.

Alternatively, set the variable in the shell starting Angular:

```powershell
$env:AI_GATEWAY_URL = 'http://localhost:8004'
cd frontend
npm start
```

Here `localhost` refers to the developer host. The existing Kochwiki API
target remains `http://localhost:8002`. No machine-specific AI address is
stored in tracked configuration. Restart Angular after changing the
file or shell variable. Unset configuration returns 503; connection failures use Angular's
default proxy error handling (normally 502, without a custom JSON body);
unsupported AI routes return 404 rather than the SPA shell.

## Timeouts and mutations

Kochwiki Nginx uses a five-second connection timeout and a five-second DNS
resolution timeout. Angular uses its default upstream connection behavior,
without a separate five-second connection deadline. A silently unreachable
address can therefore take longer to fail in development than in deployment.
Both have a **600-second read/inactivity timeout** for
non-streaming turns (and 600 seconds for sending/request socket inactivity
in Kochwiki). These are proxy inactivity limits, not an absolute end-to-end
deadline. DNS and connection waits may occur sequentially in Nginx.

The inspected agent allows up to eight provider responses, each with a
60-second provider timeout, plus resolver/tool work. A 600-second proxy
budget leaves room beyond one provider request without allowing an
indefinite silent turn. The AI Service gateway now declares five-second
connect/send timeouts, a 600-second read timeout, and no upstream retries.
Ensure that these settings are loaded in its running container and that
any additional ingress, load balancer, or client timeout covers the complete
chain. Controlled Kochwiki checks do not prove external deployment readiness.

Neither Kochwiki relay retries failed mutations. A timeout or disconnect
does not cancel AI work and may happen after a session/message/turn was
accepted. Do not automatically resubmit it; use the conversation contract's
history/recovery behavior in the later chat integration.

## Reverse resolver connection

Configure the separately deployed AI Service's `KOCHWIKI_BASE_URL` with
Kochwiki's exposed gateway address **including `/api`**, for example
`http://host.docker.internal:8002/api` from an AI container. Its resolver
posts to `/recipe-presentations/resolve` under that base. This setting is
owned by AI Service, not Kochwiki, and must be reachable from the AI backend
container. No credentials or real private addresses belong in tracked files.

## Verification

Run the controlled regression harness from the repository root with Docker,
Python, installed frontend dependencies, and the existing Kochwiki API
available on localhost:8002:

```powershell
python deployment/tests/verify_ai_gateway.py
```

It starts an isolated `kochwiki-ai-relay-check` Compose project, a controlled
upstream on port 18991, Nginx on 18992, and actual Angular development servers
on 18993. A minimal Angular fixture consumes the same proxy configuration
and installed Angular tooling, independently of the demo package. Ordinary
Angular API checks use the existing Kochwiki API. It checks the four request forms, bodies/queries, representative
upstream errors, excluded paths, 65-second turns, and exactly one upstream
mutation after a disconnect. Unset, unresolved, and unreachable configurations
must start and retain ordinary routing. The harness stops its containers and
servers; it does not alter the normal Compose projects. `--skip-delay` is
available for focused repeat checks, but full delivery validation must include
the delayed responses. Angular diagnostics are written to an ignored log.

Live verification is separate: create/read a Kochwiki session through the
exposed AI gateway via each relay and acknowledge a message without invoking
a paid turn. From the AI backend container, post a valid resolver request to
its configured `KOCHWIKI_BASE_URL`. Record whether the agent is configured
and whether the resolver accepts it. A live 503 or unresolved reverse base
is an external integration gap, even if controlled tests pass. Productive
recipe generation and rendering belong to later slices.

For the standard local exposed ports (AI 8004, Kochwiki 8002), the optional
`python deployment/tests/verify_live_ai_gateway.py` automates those live
session and reverse resolver checks using the isolated relays. It requires
the running `ai-service-local-backend-1` container. It acknowledges one
message in each new session, never invokes a model turn, and leaves those
process-local sessions to expire normally.

Delivery validation on 2026-09-26 passed the full controlled suite through
Nginx 1.25.5 and the actual Angular dev-server, including 65-second turns,
and passed live session creation/history/message acknowledgement through
both relays and reverse resolver HTTP 200. The local chat-ui dependency was
linked to a newer sibling build incompatible with the unchanged demo's
imports; the main application compilation could not be verified. The minimal
Angular fixture verified the shared proxy independently. Live AI gateway
configuration inspection failed because its mounted configuration file was
unavailable, so the external long-turn timeout and productive recipe
generation remain unverified.
