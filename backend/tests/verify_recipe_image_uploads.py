from __future__ import annotations

import base64

from app.core.config import Settings
from app.services.recipe_image_uploads import InvalidRecipeImage, RecipeImageUploads
from app.services.storage import Storage
from verify_storage_adapter import transfer


def main() -> None:
    config = Settings().storage_config
    if config is None:
        raise RuntimeError("Configure STORAGE_* settings before verification")
    storage = Storage(config)
    uploads = RecipeImageUploads(storage)
    keys: list[str] = []
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==")
    try:
        upload = uploads.begin()
        temporary = f"recipe-image-uploads/{upload.id}"
        keys.append(temporary)
        status, _ = transfer(upload.transfer, png)
        assert status == 200, f"Upload failed: {status}"
        result = uploads.complete(upload.id)
        keys.append(result.object_key)
        assert (result.width, result.height, result.size) == (1, 1, len(png))
        assert not result.cleanup_pending
        assert storage.inspect(temporary) is None
        status, downloaded = transfer(storage.presign_download(result.object_key))
        assert status == 200 and downloaded == png
        status, _ = transfer(upload.transfer, b"invalid replacement")
        assert status == 200, f"Upload replay failed: {status}"
        try:
            uploads.complete(upload.id)
        except InvalidRecipeImage as error:
            assert not error.cleanup_pending
        else:
            raise AssertionError("Invalid replacement was accepted")
        assert storage.inspect(temporary) is None
        status, downloaded = transfer(storage.presign_download(result.object_key))
        assert status == 200 and downloaded == png, "Temporary upload changed permanent bytes"
    finally:
        try:
            for key in keys:
                storage.delete(key)
        finally:
            storage.close()
    print("Recipe image upload verified: validation, permanent bytes/metadata, immediate cleanup, invalid rejection, upload replay isolation.")


if __name__ == "__main__":
    main()
