from typing import assert_never

from app.images.models import ImageKind
from app.infrastructure.storage.config import StorageConfig


def image_bucket(config: StorageConfig, kind: ImageKind) -> str:
    match kind:
        case ImageKind.RECIPE:
            return config.bucket_recipe_images
        case ImageKind.FOODSTUFF:
            return config.bucket_foodstuff_images
        case _:
            assert_never(kind)
