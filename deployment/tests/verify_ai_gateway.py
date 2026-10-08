"""Exercise actual Nginx and Angular relays with a controlled, credential-free upstream."""

from __future__ import annotations

import argparse
import http.client
import json
import os
from pathlib import Path
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[2]
BASE = "/ai/api/v1/agents/kochwiki/sessions"
REQUESTS: list[tuple[str, str, bytes]] = []
RELEASE_STREAM = threading.Event()
STREAM_FIRST = b'data: {"kind":"snapshot"}\n\n'
STREAM_LAST = b'data: {"kind":"terminal"}\n\n'


class Upstream(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self.respond()

    def do_POST(self) -> None:
        self.respond()

    def respond(self) -> None:
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        REQUESTS.append((self.command, self.path, body))
        query = parse_qs(urlsplit(self.path).query)
        if "stream" in query:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(STREAM_FIRST) + len(STREAM_LAST)))
            self.end_headers()
            self.wfile.write(STREAM_FIRST)
            self.wfile.flush()
            RELEASE_STREAM.wait(timeout=10)
            self.wfile.write(STREAM_LAST)
            return
        if "disconnect" in query:
            self.connection.shutdown(2)
            self.connection.close()
            return
        time.sleep(float(query.get("delay", ["0"])[0]))
        status = int(query.get("status", ["200"])[0])
        payload = b'{"kind":"agent_unavailable"}' if status == 503 else json.dumps({
            "method": self.command, "path": self.path, "body": body.decode(),
        }).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: object) -> None:
        pass


def request(port: int, path: str, method: str = "GET", body: bytes = b"", *, timeout: float = 90) -> tuple[int, bytes]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        connection.request(method, path, body, {"Content-Type": "application/json"})
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


def ready(port: int, process: subprocess.Popen[bytes] | None = None) -> None:
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        if process is not None and process.poll() is not None:
            raise AssertionError("Angular exited; see deployment/tests/angular-relay.log")
        try:
            if request(port, "/", timeout=2)[0] == 200:
                return
        except (OSError, http.client.HTTPException):
            pass
        time.sleep(1)
    raise AssertionError(f"Relay on {port} did not start")


def verify_mcp(port: int) -> None:
    for method in ("GET", "POST", "DELETE"):
        status, payload = request(port, "/mcp/?sample=a%20b", method, b"{}")
        assert status == 200, (status, payload)
        assert json.loads(payload) == {
            "method": method, "path": "/mcp/?sample=a%20b", "port": "8080",
        }
    for method in ("GET", "POST", "DELETE"):
        status, payload = request(port, "/mcp?sample=1", method, b"{}")
        assert status == 200, (status, payload)
        assert json.loads(payload) == {
            "method": method, "path": "/mcp/?sample=1", "port": "8080",
        }
    for path in ("/api/mcp", "/api/mcp/", "/api/mcp/other"):
        assert request(port, path)[0] == 404, path
    print(f"Gateway {port}: MCP paths, methods, queries and retired API path passed", flush=True)


def verify(port: int, delayed: bool) -> None:
    assert request(port, "/aide")[0] == 200, "Ordinary frontend prefix route blocked"
    for agent in ("kochwiki", "demo", "renamed-agent_2"):
        for method, suffix in (("POST", ""), ("GET", "/session-1"),
                               ("POST", "/session-1/messages"), ("POST", "/session-1/turns"),
                               ("GET", "/session-1/turns/turn-1/events")):
            path = BASE.replace("/kochwiki/", f"/{agent}/") + suffix + "?sample=a%20b&sample=c"
            body = b'{"text":"hello","nested":{"value":1}}' if method == "POST" else b""
            before = len(REQUESTS)
            status, payload = request(port, path, method, body)
            assert status == 200, (status, payload)
            assert REQUESTS[before:] == [(method, path[3:], body)], REQUESTS[before:]
            assert json.loads(payload) == {"method": method, "path": path[3:], "body": body.decode()}
    for failure in (422, 503):
        path = BASE + f"?status={failure}"
        status, payload = request(port, path, "POST", b"{}")
        assert status == failure
        if failure == 503:
            assert payload == b'{"kind":"agent_unavailable"}'
        else:
            assert json.loads(payload) == {"method": "POST", "path": path[3:], "body": "{}"}
    before = len(REQUESTS)
    for path in ("/ai", "/ai/", "/ai/api/v1/agents/demo/configuration", "/ai/health",
                 "/ai/api/v1/agents//sessions", "/ai/api/v1/agents/demo%2Fother/sessions",
                 BASE + "-lookalike", BASE + "/session-1/other", BASE + "/session-1/turns/extra",
                 BASE + "/session%2Fturns", BASE + "/session-1%2Fturns",
                 BASE + "/session-1/turns/turn-1", BASE + "/session-1/turns//events",
                 BASE + "/session-1/turns/turn-1/events/extra",
                 BASE + "/session-1/turns/turn%2F1/events",
                 BASE + "/session-1/turns/turn-1%2Fevents"):
        assert request(port, path)[0] == 404, path
    assert len(REQUESTS) == before
    verify_stream(port)
    before = len(REQUESTS)
    assert request(port, BASE + "/session-1/turns?disconnect=1", "POST", b"{}")[0] == 502
    time.sleep(0.2)
    assert len(REQUESTS) == before + 1, "Mutation retried after disconnect"
    if delayed:
        before = len(REQUESTS)
        started = time.monotonic()
        assert request(port, BASE + "/session-1/turns?delay=65", "POST", b"{}")[0] == 200
        assert time.monotonic() - started >= 65
        assert len(REQUESTS) == before + 1
    print(f"Relay {port}: routes, bodies, queries, errors, restrictions, disconnect/no retry, delay={delayed} passed", flush=True)


def verify_stream(port: int) -> None:
    path = BASE + "/session-1/turns/turn-1/events?stream=1&sample=a%20b"
    RELEASE_STREAM.clear()
    before = len(REQUESTS)
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    try:
        connection.request("GET", path, headers={"Accept": "text/event-stream"})
        response = connection.getresponse()
        assert response.status == 200
        assert response.getheader("Content-Type") == "text/event-stream"
        first = response.readline() + response.readline()
        assert first == STREAM_FIRST, first
        assert REQUESTS[before:] == [("GET", path[3:], b"")]
        RELEASE_STREAM.set()
        assert response.read() == STREAM_LAST
    finally:
        RELEASE_STREAM.set()
        connection.close()
    print(f"Relay {port}: SSE delivered before upstream completion", flush=True)


def compose(environment: dict[str, str], *arguments: str) -> None:
    subprocess.run(["docker", "compose", "-f", str(ROOT / "deployment/tests/compose.ai-relay.yml"),
                    *arguments], env=environment, check=True, stdout=subprocess.DEVNULL)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-delay", action="store_true")
    options = parser.parse_args()
    server = ThreadingHTTPServer(("0.0.0.0", 18991), Upstream)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    environment = os.environ.copy()
    try:
        for mode in ("controlled", "unset", "unresolved", "unreachable"):
            environment["AI_GATEWAY_URL"] = {
                "controlled": "http://host.docker.internal:18991", "unset": "",
                "unresolved": "http://ai-relay-does-not-exist.invalid:18991",
                "unreachable": "http://host.docker.internal:18990",
            }[mode]
            compose(environment, "up", "-d", "--force-recreate")
            ready(18992)
            assert request(18992, "/api/health")[0] == 200
            verify_mcp(18992)
            if mode == "controlled":
                verify(18992, not options.skip_delay)
            else:
                started = time.monotonic()
                assert request(18992, BASE, "POST", b"{}")[0] in (502, 503, 504)
                assert time.monotonic() - started < 12
                print(f"Nginx {mode}: startup, ordinary routes, bounded AI failure passed", flush=True)
        for mode in ("controlled", "unset", "unresolved", "unreachable"):
            environment["AI_GATEWAY_URL"] = {
                "controlled": "http://127.0.0.1:18991", "unset": "",
                "unresolved": "http://ai-relay-does-not-exist.invalid:18991",
                "unreachable": "http://127.0.0.1:18990",
            }[mode]
            with (ROOT / "deployment/tests/angular-relay.log").open("wb") as log:
                process = subprocess.Popen(["node", str(ROOT / "frontend/node_modules/@angular/cli/bin/ng.js"), "serve",
                                            "--port", "18993", "--host", "127.0.0.1"],
                                           cwd=ROOT / "frontend/tests/ai-relay", env=environment, stdout=log, stderr=log)
                try:
                    ready(18993, process)
                    assert request(18993, "/api/foodstuffs")[0] == 200
                    if mode == "controlled":
                        verify(18993, not options.skip_delay)
                    else:
                        started = time.monotonic()
                        assert request(18993, BASE, "POST", b"{}")[0] in (502, 503, 504)
                        assert time.monotonic() - started < 12
                        print(f"Angular {mode}: startup, ordinary routes, bounded AI failure passed", flush=True)
                finally:
                    process.terminate()
                    process.wait(timeout=20)
    finally:
        compose(environment, "stop")
        server.shutdown()


if __name__ == "__main__":
    main()
