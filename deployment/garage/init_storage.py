"""Provision named Garage buckets without replacing persisted credentials or data."""

from __future__ import annotations

from dataclasses import dataclass
import hmac
import json
import os
from pathlib import Path
import re
import sys
import time
from typing import cast
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

type Json = None | bool | int | float | str | list[Json] | dict[str, Json]


@dataclass(frozen=True)
class Bucket:
    name: str
    access_key_id: str
    secret_access_key: str


def required_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise ValueError(f"Missing environment variable: {name}")
    return value


def load_buckets(path: Path) -> list[Bucket]:
    definitions: object = json.loads(path.read_text())
    if not isinstance(definitions, list) or not definitions:
        raise ValueError("Bucket configuration must be a nonempty list")
    buckets: list[Bucket] = []
    names: set[str] = set()
    for entry in definitions:
        if not isinstance(entry, dict):
            raise ValueError("Each bucket configuration must be an object")
        for field in ("name", "access_key_id_env", "secret_access_key_env"):
            if not isinstance(entry.get(field), str) or not entry[field]:
                raise ValueError(f"Bucket configuration requires {field}")
        name = entry["name"]
        if name in names or re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", name) is None:
            raise ValueError("Bucket names must be unique, valid S3 bucket names")
        access_key = required_env(entry["access_key_id_env"])
        secret_key = required_env(entry["secret_access_key_env"])
        if re.fullmatch(r"GK[0-9a-fA-F]{32}", access_key) is None:
            raise ValueError("Access key IDs must be GK followed by 32 hex characters")
        if re.fullmatch(r"[0-9a-fA-F]{64}", secret_key) is None:
            raise ValueError("Secret access keys must contain 64 hex characters")
        names.add(name)
        buckets.append(Bucket(name, access_key, secret_key))
    return buckets


class Admin:
    def __init__(self, token: str) -> None:
        self.token = token
        self.origin = "http://127.0.0.1:3903"

    def wait_ready(self) -> None:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            try:
                with urlopen(self.origin + "/health", timeout=5) as response:
                    if response.status == 200:
                        return
            except (URLError, TimeoutError):
                pass
            time.sleep(1)
        raise RuntimeError("Garage did not become ready for initialization")

    def call(
        self, operation: str, *, query: dict[str, str] | None = None,
        body: dict[str, Json] | None = None, missing_ok: bool = False,
    ) -> dict[str, Json] | None:
        url = self.origin + "/v2/" + operation
        if query:
            url += "?" + urlencode(query)
        request = Request(
            url, data=None if body is None else json.dumps(body).encode(),
            headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"},
            method="GET" if body is None else "POST",
        )
        try:
            with urlopen(request, timeout=15) as response:
                value: object = json.load(response)
        except HTTPError as error:
            if missing_ok and error.code == 404:
                return None
            raise RuntimeError(f"Garage {operation} failed (HTTP {error.code})") from None
        if not isinstance(value, dict):
            raise RuntimeError(f"Garage {operation} returned an invalid response")
        return cast(dict[str, Json], value)

    def provision(self, bucket: Bucket) -> None:
        key = self.call("GetKeyInfo", query={"id": bucket.access_key_id, "showSecretKey": "true"}, missing_ok=True)
        if key is None:
            self.call("ImportKey", body={
                "accessKeyId": bucket.access_key_id,
                "secretAccessKey": bucket.secret_access_key,
                "name": bucket.name + "-app",
            })
        elif key.get("expired") is True or not hmac.compare_digest(
            str(key.get("secretAccessKey", "")), bucket.secret_access_key,
        ):
            raise RuntimeError(f"Configured credentials do not match the stored key for {bucket.name}")
        info = self.call("GetBucketInfo", query={"globalAlias": bucket.name}, missing_ok=True)
        if info is None:
            info = self.call("CreateBucket", body={"globalAlias": bucket.name})
        if info is None or not isinstance(info.get("id"), str):
            raise RuntimeError("Garage returned no bucket identifier")
        self.call("AllowBucketKey", body={
            "bucketId": info["id"], "accessKeyId": bucket.access_key_id,
            "permissions": {"read": True, "write": True},
        })
        print(f"Bucket ready: {bucket.name}", flush=True)


def main() -> None:
    buckets = load_buckets(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/config/buckets.json"))
    admin = Admin(required_env("GARAGE_ADMIN_TOKEN"))
    admin.wait_ready()
    for bucket in buckets:
        admin.provision(bucket)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError) as error:
        print(f"Storage initialization failed: {error}", file=sys.stderr)
        sys.exit(1)
