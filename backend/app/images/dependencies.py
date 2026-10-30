from contextlib import ExitStack
from threading import Lock

from fastapi import HTTPException, Request

from app.core.config import get_settings
from app.images.models import ImageKind
from app.images.storage import image_bucket
from app.infrastructure.storage.storage import Storage
from app.infrastructure.storage.config import StorageConfig


class ImageStoragePool:
    def __init__(self) -> None:
        self._storages: dict[tuple[StorageConfig, ImageKind], Storage] = {}
        self._lock = Lock()
        self._cleanup = ExitStack()

    def get(self, config: StorageConfig, kind: ImageKind) -> Storage:
        key = (config, kind)
        with self._lock:
            if key not in self._storages:
                storage = Storage(config, bucket=image_bucket(config, kind))
                self._cleanup.callback(storage.close)
                self._storages[key] = storage
            return self._storages[key]

    def close(self) -> None:
        with self._lock:
            self._cleanup.close()
            self._storages.clear()


def image_storage(request: Request, kind: ImageKind) -> Storage:
    config = get_settings().storage_config
    if config is None:
        raise HTTPException(
            503, "Image storage is unavailable", headers={"Cache-Control": "no-store"}
        )
    pool = request.app.state.image_storages
    assert isinstance(pool, ImageStoragePool)
    return pool.get(config, kind)
