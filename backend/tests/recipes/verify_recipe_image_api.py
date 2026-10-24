"""Verify image transfers through the gateway using STORAGE_VERIFY_SESSION."""

import base64
import http.client
import json
import os
from urllib.parse import urlsplit
from uuid import UUID

from app.core.config import Settings
from app.identity.config import SESSION_COOKIE
from app.identity.services.sessions import secret_hash
from app.infrastructure.database.session import SessionLocal
from app.images.models import ImageAsset
from app.recipes.schemas.image import RecipeImageDownloadOut, RecipeImageOut, RecipeImageUploadOut
from app.infrastructure.storage.storage import Storage


def request(
    url: str, method: str, data: bytes | None = None, headers: dict[str, str] | None = None,
    *, no_store: bool = False,
) -> tuple[int, bytes]:
    public = urlsplit(url)
    connect = urlsplit(os.environ.get("STORAGE_VERIFY_CONNECT_ORIGIN", f"{public.scheme}://{public.netloc}"))
    connection_type = http.client.HTTPSConnection if connect.scheme == "https" else http.client.HTTPConnection
    connection = connection_type(connect.hostname, connect.port, timeout=30)
    try:
        connection.request(
            method, public.path + ("?" + public.query if public.query else ""), body=data,
            headers={**(headers or {}), "Host": public.netloc},
        )
        response = connection.getresponse()
        if no_store:
            assert response.getheader("Cache-Control") == "no-store", "Download instructions must not be cached"
        return response.status, response.read()
    finally:
        connection.close()


def main() -> None:
    config = Settings().storage_config
    if config is None:
        raise RuntimeError("Configure STORAGE_* before verification")
    session_secret = os.environ.get("STORAGE_VERIFY_SESSION")
    if secret_hash(session_secret) is None:
        raise RuntimeError("Set STORAGE_VERIFY_SESSION to a valid application-session secret")
    api_headers = {"Cookie": f"{SESSION_COOKIE}={session_secret}", "Origin": config.public_origin}
    status, _ = request(config.public_origin + "/api/auth/me", "GET", headers=api_headers)
    if status != 200:
        raise RuntimeError("Verification requires an active application session and configured login")
    storage = Storage(config, bucket=config.bucket_recipe_images)
    keys: list[str] = []
    image_ids: list[UUID] = []
    api = config.public_origin + "/api/recipe-image-uploads"
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==")
    try:
        for data, expected in ((png, 200), (b"invalid PNG", 400)):
            status, body = request(api, "POST", headers=api_headers)
            assert status == 200, f"Upload start failed: {status}"
            upload = RecipeImageUploadOut.model_validate_json(body)
            temporary = f"recipe-image-uploads/{upload.uploadId}"
            keys.append(temporary)
            status, _ = request(upload.url, upload.method, data, upload.headers)
            assert status == 200, f"Transfer failed: {status}"
            status, body = request(f"{api}/{upload.uploadId}/complete", "POST", headers=api_headers)
            assert status == expected, f"Unexpected completion status: {status}"
            if status == 200:
                image = RecipeImageOut.model_validate_json(body)
                image_ids.append(image.id)
                with SessionLocal() as session:
                    saved = session.get(ImageAsset, image.id)
                    assert saved is not None, "Completion did not persist metadata"
                    keys.append(saved.object_key)
                    assert storage.read(saved.object_key, max_bytes=len(png)) == png
                status, body = request(
                    f"{config.public_origin}/api/recipe-images/{image.id}/download", "GET",
                    headers=api_headers, no_store=True,
                )
                assert status == 200, f"Download instructions failed: {status}"
                download = RecipeImageDownloadOut.model_validate_json(body)
                assert download.expiresIn == 300
                status, downloaded = request(download.url, "GET")
                assert status == 200, f"Download failed: {status}"
                assert downloaded == png, "Downloaded image differs from validated PNG"
                status, _ = request(download.url.split("?", 1)[0], "GET")
                assert status == 403, "Image unexpectedly allows anonymous download"
            else:
                assert json.loads(body) == {"detail": "Image must be a valid PNG"}
            assert storage.inspect(temporary) is None
            status, _ = request(f"{api}/{upload.uploadId}/complete", "POST", headers=api_headers)
            assert status == 404, f"Consumed upload unexpectedly remained: {status}"
    finally:
        try:
            with SessionLocal.begin() as session:
                for image_id in image_ids:
                    saved = session.get(ImageAsset, image_id)
                    if saved is not None:
                        session.delete(saved)
            for key in keys:
                storage.delete(key)
        finally:
            storage.close()
    print("Recipe image API verified through gateway: PNG upload/download, no-store instructions, private objects, persistence, invalid rejection and temporary cleanup.")


if __name__ == "__main__":
    main()
