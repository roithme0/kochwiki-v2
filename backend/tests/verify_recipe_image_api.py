"""Verify upload endpoints and transfers through the configured public gateway."""

import base64
import http.client
import json
import os
from urllib.parse import urlsplit
from uuid import UUID

from app.core.config import Settings
from app.db.session import SessionLocal
from app.models.recipe_image import RecipeImage
from app.schemas.recipe_image import RecipeImageOut, RecipeImageUploadOut
from app.services.storage import Storage


def request(
    url: str, method: str, data: bytes | None = None, headers: dict[str, str] | None = None,
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
        return response.status, response.read()
    finally:
        connection.close()


def main() -> None:
    config = Settings().storage_config
    if config is None:
        raise RuntimeError("Configure STORAGE_* before verification")
    storage = Storage(config)
    keys: list[str] = []
    image_ids: list[UUID] = []
    api = config.public_origin + "/api/recipe-image-uploads"
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==")
    try:
        for data, expected in ((png, 200), (b"invalid PNG", 400)):
            status, body = request(api, "POST")
            assert status == 200, f"Upload start failed: {status}"
            upload = RecipeImageUploadOut.model_validate_json(body)
            temporary = f"recipe-image-uploads/{upload.uploadId}"
            keys.append(temporary)
            status, _ = request(upload.url, upload.method, data, upload.headers)
            assert status == 200, f"Transfer failed: {status}"
            status, body = request(f"{api}/{upload.uploadId}/complete", "POST")
            assert status == expected, f"Unexpected completion status: {status}"
            if status == 200:
                image = RecipeImageOut.model_validate_json(body)
                image_ids.append(image.id)
                with SessionLocal() as session:
                    saved = session.get(RecipeImage, image.id)
                    assert saved is not None, "Completion did not persist metadata"
                    keys.append(saved.object_key)
                    assert storage.read(saved.object_key, max_bytes=len(png)) == png
            else:
                assert json.loads(body) == {"detail": "Image must be a valid PNG"}
            assert storage.inspect(temporary) is None
            status, _ = request(f"{api}/{upload.uploadId}/complete", "POST")
            assert status == 404, f"Consumed upload unexpectedly remained: {status}"
    finally:
        try:
            with SessionLocal.begin() as session:
                for image_id in image_ids:
                    saved = session.get(RecipeImage, image_id)
                    if saved is not None:
                        session.delete(saved)
            for key in keys:
                storage.delete(key)
        finally:
            storage.close()
    print("Recipe image API verified through gateway: PNG transfer, completion, persistence, invalid rejection and temporary cleanup.")


if __name__ == "__main__":
    main()
