"""Optional live connectivity check; never requests model generation."""

from __future__ import annotations

import json
import os
import subprocess

from verify_ai_gateway import BASE, ROOT, compose, ready, request


def session(port: int) -> None:
    body = json.dumps({"input": {"source": {
        "external_reference": "00000000-0000-4000-8000-000000000001",
        "recipe": {"name": "Relay connectivity check", "servings": 1,
                   "ingredients": [], "steps": []},
    }, "foodstuffs": []}}).encode()
    status, payload = request(port, BASE, "POST", body, timeout=10)
    print(f"Live session creation through {port}: HTTP {status}", flush=True)
    if status != 201:
        print(payload.decode()[:500], flush=True)
        raise AssertionError(f"Live session creation failed: HTTP {status}")
    created = json.loads(payload)
    path = BASE + "/" + created["session_id"]
    assert request(port, path, timeout=10)[0] == 200
    assert request(port, path + "/messages", "POST", b'{"text":"Connectivity check; no turn requested."}', timeout=10)[0] == 201
    assert request(port, path, timeout=10)[0] == 200
    print(f"Live session creation, history, message acknowledgement through {port}: passed (no generation)", flush=True)


def main() -> None:
    environment = os.environ.copy()
    environment["AI_GATEWAY_URL"] = "http://host.docker.internal:8004"
    try:
        compose(environment, "up", "-d", "--force-recreate")
        ready(18992)
        session(18992)
        environment["AI_GATEWAY_URL"] = "http://localhost:8004"
        with (ROOT / "deployment/tests/angular-relay.log").open("wb") as log:
            process = subprocess.Popen(["node", str(ROOT / "frontend/node_modules/@angular/cli/bin/ng.js"),
                                        "serve", "--port", "18993", "--host", "127.0.0.1"],
                                       cwd=ROOT / "frontend/tests/ai-relay", env=environment, stdout=log, stderr=log)
            try:
                ready(18993, process)
                session(18993)
            finally:
                process.terminate()
                process.wait(timeout=20)
        reverse = """
import json
from urllib.request import Request, urlopen
from app.core.config import get_settings
base = get_settings().kochwiki_base_url
if not base:
    print('Reverse resolver: KOCHWIKI_BASE_URL unset; external verification pending')
    raise SystemExit(1)
else:
    body = json.dumps({'servings': 1, 'preptime': None, 'ingredients': [], 'steps': []}).encode()
    request = Request(base.rstrip('/') + '/recipe-presentations/resolve', data=body,
                      headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read())
            print('Reverse resolver: HTTP', response.status, '; presentation keys:', sorted(payload))
    except Exception as error:
        print('Reverse resolver: external verification failed:', type(error).__name__)
        raise SystemExit(1)
"""
        subprocess.run(["docker", "exec", "ai-service-local-backend-1", "python", "-c", reverse], check=True)
    finally:
        compose(environment, "stop")


if __name__ == "__main__":
    main()
