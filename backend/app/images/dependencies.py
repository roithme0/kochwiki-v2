from collections.abc import Iterator

from fastapi import HTTPException

from app.core.config import get_settings
from app.images.models import ImageKind
from app.images.storage import image_bucket
from app.infrastructure.storage.storage import Storage


def image_storage(kind: ImageKind) -> Iterator[Storage]:
    config = get_settings().storage_config
    if config is None:
        raise HTTPException(
            503, "Image storage is unavailable", headers={"Cache-Control": "no-store"}
        )
    storage = Storage(config, bucket=image_bucket(config, kind))
    try:
        yield storage
    finally:
        storage.close()
