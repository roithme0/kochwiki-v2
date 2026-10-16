"""Exercise the configured adapter against Garage through the application gateway."""

import base64
import http.client
import os
import time
from xml.etree import ElementTree
from urllib.parse import urlsplit
from uuid import uuid4

from app.core.config import Settings
from app.infrastructure.storage.storage import PresignedTransfer, Storage


def transfer(request: PresignedTransfer, body: bytes | None = None) -> tuple[int, bytes]:
    signed = urlsplit(request.url)
    connect = urlsplit(os.environ.get("STORAGE_VERIFY_CONNECT_ORIGIN", f"{signed.scheme}://{signed.netloc}"))
    connection_type = http.client.HTTPSConnection if connect.scheme == "https" else http.client.HTTPConnection
    connection = connection_type(connect.hostname, connect.port, timeout=15)
    try:
        headers = {"Host": signed.netloc}
        if body is not None:
            headers["Content-Type"] = "image/png"
        connection.request(request.method, signed.path + "?" + signed.query, body=body, headers=headers)
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


def main() -> None:
    config = Settings().storage_config
    if config is None:
        raise RuntimeError("Configure all STORAGE_* settings, including STORAGE_BUCKET_RECIPE_IMAGES, before verification")
    storage = Storage(config)
    key = f"storage-verification/{uuid4()}/plate +%?#ä.png"
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==")
    try:
        assert storage.inspect(key) is None, "Verification key unexpectedly exists"
        status, _ = transfer(storage.presign_upload(key), png)
        assert status == 200, f"PNG upload failed with status {status}"
        metadata = storage.inspect(key)
        assert metadata is not None and metadata.size == len(png), "Internal inspection failed"
        assert metadata.content_type == "image/png", "Content type not retained"
        status, downloaded = transfer(storage.presign_download(key))
        assert status == 200 and downloaded == png, "PNG download differs"
        expired = storage.presign_download(key, expires_in=1)
        time.sleep(3)
        status, error = transfer(expired)
        document = ElementTree.fromstring(error) if status in {400, 403} else None
        code = document.findtext("Code") if document is not None else None
        message = document.findtext("Message", "") if document is not None else ""
        denied = code == "RequestExpired" or (
            code in {"AccessDenied", "InvalidRequest"}
            and ("Date is too old" in message or "expired" in message.lower())
        )
        assert status in {400, 403} and denied, f"Expired URL was not rejected as expired: status {status}, code {code}"
    finally:
        try:
            storage.delete(key)
            assert storage.inspect(key) is None, "Verification object remains after deletion"
        finally:
            storage.close()
    print("Storage adapter verified: PNG PUT, internal HEAD, identical GET, expired URL denied, DELETE confirmed.")


if __name__ == "__main__":
    main()
