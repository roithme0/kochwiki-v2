# MCP integration

Kochwiki hosts the official Python MCP SDK `2.2.0` inside its FastAPI backend.
The first slice exposes only `hello_world`, with no arguments, returning
`{"message": "Hello World"}` as structured content. It and the existing HTTP
`GET /` endpoint call `app/services/greeting.py` directly.

## Endpoint and lifecycle

The Streamable HTTP endpoint is `/mcp/` on both the backend and gateway.
The gateway forwards this path directly to the backend and redirects `/mcp`
to `/mcp/` with HTTP 308, preserving the method. `/api/mcp/` is not exposed.
Keep the trailing slash in client URLs.
For a backend on port 8080, connect to `http://localhost:8080/mcp/`.
Other containers on the same network can use `http://backend:8080/mcp/`.

The FastAPI lifespan runs the SDK session manager. `create_app()` allocates a
fresh MCP server and manager for each application instance; the SDK manager
cannot be restarted after shutdown. The existing Uvicorn entry point remains
`app.main:app`.

This slice uses stateless HTTP with JSON responses. Domain context will use
explicit references in later slices; it must not depend on transport sessions.
Streaming notifications and client callbacks are outside this slice.
MCP tool schemas are discovered through MCP, not FastAPI OpenAPI.

`MCP_ALLOWED_HOSTS` configures the SDK transport's Host allowlist as a
comma-separated list. Defaults allow loopback addresses and the Docker service
name `backend`, with optional ports. Add the actual gateway hostname when using
a different address. This setting does not grant authentication or domain
permissions. Browser-origin MCP connections are not enabled in this slice;
the intended consumer is a service-side client.

## Try it

Install the backend requirements and local contract package as described in the
repository README. From `backend`, start the existing application:

```powershell
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8080
```

In another terminal, from `backend`, run the official SDK client probe:

```powershell
.venv\Scripts\python.exe tests/verify_mcp.py http://localhost:8080/mcp/
```

The probe connects, discovers the tool, invokes it, and checks its structured
result. It requires neither an AI model nor database queries. Normal deployment
startup still runs the existing database migrations.

## Verification

### Manual check with MCP Inspector

With the current backend running in Compose, start Inspector from PowerShell:

```powershell
npx.cmd @modelcontextprotocol/inspector --server-url http://localhost:8000/mcp/ --transport http
```

Replace `8000` with the gateway port. Open the UI URL printed in the terminal,
connect, and select `hello_world` under **Tools**. Execute it without arguments;
the structured result should be `{"message": "Hello World"}`.

In an already open Inspector, add a **Streamable HTTP** server with that URL.
For a directly running backend, use `http://localhost:8080/mcp/` instead.
Keep the trailing slash. Inspector proxies the connection through its Node
backend, so no browser CORS configuration is needed in Kochwiki.

See the [official Inspector connection documentation](https://github.com/modelcontextprotocol/inspector/blob/main/docs/mcp-server-configuration.md).

### Automated checks

Run the backend regression suite with the existing test PostgreSQL available:

```powershell
.venv\Scripts\python.exe -m pytest tests -q
```

`tests/test_mcp.py` exercises the SDK client over Streamable HTTP through the
ASGI transport, application startup/shutdown across fresh instances, the
existing greeting/OpenAPI routes, and rejection of an unconfigured Host.
The client probe separately permits verification over a listening TCP server.

No domain instructions, foodstuff reads, proposal behavior, or AI Service
integration are included yet.
