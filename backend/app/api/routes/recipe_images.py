from collections.abc import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import get_settings
from app.core.recipe_images import IMAGE_CONTENT_TYPE
from app.db.session import SessionLocal
from app.schemas.errors import ErrorResponse
from app.schemas.recipe_image import RecipeImageOut, RecipeImageUploadOut
from app.services.recipe_image_uploads import (
    ImagePersistenceFailed,
    ImageUploadNotFound,
    InvalidRecipeImage,
    RecipeImageUploads,
)
from app.services.storage import Storage, StorageUnavailable

router = APIRouter()


def get_recipe_image_uploads() -> Iterator[RecipeImageUploads]:
    config = get_settings().storage_config
    if config is None:
        raise HTTPException(503, "Image storage is unavailable")
    storage = Storage(config)
    try:
        yield RecipeImageUploads(storage, SessionLocal)
    finally:
        storage.close()


@router.post(
    "/recipe-image-uploads",
    response_model=RecipeImageUploadOut,
    responses={503: {"model": ErrorResponse}},
)
def begin_upload(
    uploads: RecipeImageUploads = Depends(get_recipe_image_uploads),
) -> RecipeImageUploadOut:
    try:
        upload = uploads.begin()
    except StorageUnavailable:
        raise HTTPException(503, "Image storage is unavailable") from None
    return RecipeImageUploadOut(
        uploadId=upload.id,
        url=upload.transfer.url,
        method="PUT",
        headers={"Content-Type": IMAGE_CONTENT_TYPE},
        expiresIn=upload.transfer.expires_in,
    )


@router.post(
    "/recipe-image-uploads/{upload_id}/complete",
    response_model=RecipeImageOut,
    responses={status: {"model": ErrorResponse} for status in (400, 404, 503)},
)
def complete_upload(
    upload_id: UUID,
    uploads: RecipeImageUploads = Depends(get_recipe_image_uploads),
) -> RecipeImageOut:
    try:
        image = uploads.complete(upload_id)
    except ImageUploadNotFound:
        raise HTTPException(404, "Upload has not been received") from None
    except InvalidRecipeImage as error:
        raise HTTPException(400, str(error)) from None
    except (StorageUnavailable, ImagePersistenceFailed):
        raise HTTPException(503, "Image upload could not be completed") from None
    return RecipeImageOut(
        id=image.id,
        contentType=IMAGE_CONTENT_TYPE,
        size=image.size,
        width=image.width,
        height=image.height,
        createdAt=image.created_at,
    )
