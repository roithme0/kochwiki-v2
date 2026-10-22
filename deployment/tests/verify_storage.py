"""Verify Garage and the production gateway without application data or dependencies."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.parse import quote, urlencode
import uuid


ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "deployment/tests/compose.storage.yml"
HOST = "127.0.0.1:18994"
ACCESS_KEY = "GK11111111111111111111111111111111"
SECRET_KEY = "b" * 64
BUCKET = "/recipe-images"


def compose(*args: str) -> None:
    subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE), *args],
        cwd=ROOT, check=True, timeout=180,
    )


def digest(key: bytes, value: str) -> bytes:
    return hmac.new(key, value.encode(), hashlib.sha256).digest()


def presign(
    method: str, path: str, *, host: str | None = None, age_seconds: int = 0,
    canonical_prefix: str = "", access_key_id: str | None = None,
    secret_access_key: str | None = None,
) -> str:
    host = host or HOST
    access_key_id = access_key_id or ACCESS_KEY
    secret_access_key = secret_access_key or SECRET_KEY
    now = datetime.now(timezone.utc) - timedelta(seconds=age_seconds)
    date = now.strftime("%Y%m%d")
    timestamp = now.strftime("%Y%m%dT%H%M%SZ")
    scope = f"{date}/garage/s3/aws4_request"
    query = urlencode(sorted({
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": f"{access_key_id}/{scope}",
        "X-Amz-Date": timestamp,
        "X-Amz-Expires": "60",
        "X-Amz-SignedHeaders": "host",
    }.items()), quote_via=quote, safe="~")
    canonical = (
        f"{method}\n{canonical_prefix}{path}\n{query}\nhost:{host}\n\nhost\nUNSIGNED-PAYLOAD"
    )
    string_to_sign = (
        f"AWS4-HMAC-SHA256\n{timestamp}\n{scope}\n"
        + hashlib.sha256(canonical.encode()).hexdigest()
    )
    key = digest(("AWS4" + secret_access_key).encode(), date)
    for value in ("garage", "s3", "aws4_request"):
        key = digest(key, value)
    signature = hmac.new(key, string_to_sign.encode(), hashlib.sha256).hexdigest()
    return f"/storage{path}?{query}&X-Amz-Signature={signature}"


def request(method: str, path: str, body: bytes | None = None) -> tuple[int, bytes]:
    connection = http.client.HTTPConnection(HOST, timeout=15)
    try:
        connection.request(method, path, body=body)
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


def ready() -> None:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            status, _ = request("GET", presign("GET", BUCKET))
            if status == 200:
                return
        except (OSError, http.client.HTTPException):
            pass
        time.sleep(1)
    raise AssertionError("Storage gateway did not become ready")


def verify_definitions() -> None:
    values = {
        "GARAGE_RPC_SECRET": "a" * 64,
        "GARAGE_ADMIN_TOKEN": "c" * 64,
        "GARAGE_ACCESS_KEY_ID": ACCESS_KEY,
        "GARAGE_SECRET_ACCESS_KEY": SECRET_KEY,
        "APP_DB_PASSWORD": "test-only",
        "POSTGRES_PASSWORD": "test-only",
        "STORAGE_PUBLIC_ORIGIN": "https://storage-check.example.invalid",
    }
    environment = os.environ | values
    with tempfile.TemporaryDirectory(prefix="kochwiki-storage-config-") as directory:
        env_file = Path(directory) / ".env"
        env_file.write_text("\n".join(f"{key}={value}" for key, value in values.items()))
        for target in ("local", "staging", "production"):
            result = subprocess.run(
                ["docker", "compose", "--env-file", str(env_file), "-f",
                 str(ROOT / f"deployment/docker-compose-{target}.yml"),
                 "config", "--format", "json"],
                check=True, capture_output=True, text=True, env=environment, timeout=30,
            )
            config = json.loads(result.stdout)
            garage = config["services"]["file-storage"]
            assert garage["image"] == "dxflrs/garage:v2.4.1"
            assert garage["command"] == ["/garage", "server", "--single-node"]
            assert not garage.get("ports")
            assert not any(name.startswith("GARAGE_DEFAULT_") for name in garage["environment"])
            initializer = config["services"]["file-storage-init"]
            assert initializer["network_mode"] == "service:file-storage"
            assert initializer["environment"]["GARAGE_ACCESS_KEY_ID"] == ACCESS_KEY
            assert initializer["depends_on"]["file-storage"]["condition"] == "service_healthy"
            backend = config["services"]["backend"]["environment"]
            assert backend["STORAGE_BUCKET_RECIPE_IMAGES"] == "recipe-images"
            assert backend["STORAGE_BUCKET_FOODSTUFF_IMAGES"] == "foodstuff-images"
            assert backend["STORAGE_ACCESS_KEY_ID"] == ACCESS_KEY
            assert backend["STORAGE_SECRET_ACCESS_KEY"] == SECRET_KEY
            mounts = {mount["target"]: mount for mount in garage["volumes"]}
            for name in ("data", "meta"):
                mount = mounts[f"/var/lib/garage/{name}"]
                assert mount["type"] == ("volume" if target == "local" else "bind")
                if target != "local":
                    assert Path(mount["source"]) == ROOT / "deployment/garage" / name
            assert config["services"]["gateway"]["depends_on"]["file-storage-init"]["condition"] == "service_completed_successfully"
    print("Local, staging, and production Compose definitions validated", flush=True)


def run_initializer(script: str, *, succeeds: bool = True) -> None:
    result = subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE), "run", "--rm", "-T", "--no-deps",
         "file-storage-init", "python", "-"],
        input=script, text=True, capture_output=True, timeout=60,
    )
    assert (result.returncode == 0) is succeeds, (result.stdout, result.stderr)
    if not succeeds:
        assert "do not match the stored key" in result.stderr


def verify_additional_bucket() -> None:
    run_initializer('''
import json
import os
from pathlib import Path
import sys
sys.path.insert(0, "/config")
from init_storage import main
definitions = json.loads(Path("/config/buckets.json").read_text())
definitions.append({"name": "second-storage-check", "access_key_id_env": "SECOND_ID", "secret_access_key_env": "SECOND_SECRET"})
os.environ["SECOND_ID"] = "GK" + "2" * 32
os.environ["SECOND_SECRET"] = "d" * 64
Path("/tmp/buckets.json").write_text(json.dumps(definitions))
sys.argv = ["init_storage.py", "/tmp/buckets.json"]
main()
main()
''')
    assert request("GET", presign("GET", "/second-storage-check"))[0] == 403
    path = "/second-storage-check/" + uuid.uuid4().hex
    upload = presign("PUT", path, access_key_id="GK" + "2" * 32, secret_access_key="d" * 64)
    download = presign("GET", path, access_key_id="GK" + "2" * 32, secret_access_key="d" * 64)
    assert request("PUT", upload, b"second bucket")[0] == 200
    assert request("GET", download) == (200, b"second bucket")
    run_initializer('''
import os
import sys
sys.path.insert(0, "/config")
from init_storage import main
os.environ["GARAGE_SECRET_ACCESS_KEY"] = "e" * 64
main()
''', succeeds=False)


def verify_domain_buckets() -> dict[str, bytes]:
    key = "/checks/" + uuid.uuid4().hex + "/same%20key.png"
    objects: dict[str, bytes] = {}
    for bucket in ("recipe-images", "foodstuff-images"):
        path = "/" + bucket + key
        payload = (bucket + "\x00image-bytes").encode()
        assert request("PUT", presign("PUT", path), payload)[0] == 200
        objects[path] = payload
        assert request("GET", "/storage" + path)[0] == 403
        assert request("GET", "/storage/" + bucket)[0] == 403
        assert request("PUT", "/storage" + path, b"anonymous")[0] == 403
    for path, payload in objects.items():
        assert request("GET", presign("GET", path)) == (200, payload)
    print("Both domain buckets accept shared credentials, isolate identical keys, and deny unsigned access", flush=True)
    return objects


def verify() -> None:
    verify_definitions()
    try:
        compose("up", "-d", "--wait", "--wait-timeout", "90")
        ready()
        domain_objects = verify_domain_buckets()
        for path in ("/", "/api/", "/mcp/"):
            assert request("GET", path)[0] == 200, path
        assert request("GET", "/storage")[0] == 404
        key = f"checks/{uuid.uuid4().hex}/plate + % ä.png"
        path = BUCKET + "/" + quote(key, safe="/~")
        payload = b"storage-transfer-check\x00\xff" * 65536
        assert request("PUT", presign("PUT", path), payload)[0] == 200
        assert request("GET", presign("GET", path)) == (200, payload)
        assert request("HEAD", presign("HEAD", path))[0] == 200
        print("Presigned PUT/GET/HEAD, encoded keys, and >1 MiB transfer passed", flush=True)

        compose("run", "--rm", "--no-deps", "file-storage-init")
        for object_path, object_bytes in domain_objects.items():
            assert request("GET", presign("GET", object_path)) == (200, object_bytes)
        assert request("GET", presign("GET", path)) == (200, payload)
        verify_additional_bucket()
        assert request("GET", presign("GET", path)) == (200, payload)
        print("Repeated provisioning and second bucket preserve existing credentials and objects", flush=True)

        assert request("GET", "/storage" + path)[0] == 403
        assert request("GET", "/storage" + BUCKET)[0] == 403
        assert request("PUT", "/storage" + path, b"anonymous")[0] == 403
        assert request("GET", presign("PUT", path))[0] == 403
        assert request("GET", presign("GET", path, host="wrong.example"))[0] == 403
        status, error = request("GET", presign("GET", path, age_seconds=120))
        assert status == 400 and b"Date is too old" in error
        assert request("GET", presign("GET", path) + "&tampered=1")[0] == 403
        assert request("GET", presign("GET", path, canonical_prefix="/storage"))[0] == 403
        assert request("GET", presign("GET", path)) == (200, payload)
        print("Anonymous, wrong method/host, expired, tampered and prefixed signatures denied", flush=True)

        compose("restart", "file-storage")
        ready()
        assert request("GET", presign("GET", path)) == (200, payload)
        compose("up", "-d", "--force-recreate", "--no-deps", "--wait", "file-storage")
        ready()
        assert request("GET", presign("GET", path)) == (200, payload)
        for object_path, object_bytes in domain_objects.items():
            assert request("GET", presign("GET", object_path)) == (200, object_bytes)
        print("Bucket, key, and object survived restart and container recreation", flush=True)

        logs = subprocess.run(
            ["docker", "compose", "-f", str(COMPOSE), "logs", "gateway", "file-storage"],
            check=True, capture_output=True, text=True, timeout=30,
        ).stdout
        assert "X-Amz-Signature=" not in logs, "Presigned credentials leaked into storage logs"
        services = subprocess.run(
            ["docker", "compose", "-f", str(COMPOSE), "ps", "--format", "json", "file-storage"],
            check=True, capture_output=True, text=True, timeout=30,
        ).stdout
        info = json.loads(services)
        assert not info["Publishers"], "Garage publishes host ports"
        print("Garage ports private; storage logs contain no presigned URLs", flush=True)
    finally:
        compose("stop")


if __name__ == "__main__":
    verify()
