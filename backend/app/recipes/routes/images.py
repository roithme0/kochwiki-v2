from collections.abc import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.images.config import IMAGE_CONTENT_TYPE
from app.images.storage import image_bucket
from app.infrastructure.database.session import SessionLocal, get_db
from app.images.models import ImageAsset, ImageKind
from app.core.schemas.errors import ErrorResponse
from app.recipes.schemas.image import (
    RecipeImageDownloadOut,
    RecipeImageOut,
    RecipeImageUploadOut,
)
from app.recipes.services.image_uploads import (
    ImagePersistenceFailed,
    ImageUploadNotFound,
    InvalidRecipeImage,
    RecipeImageUploads,
)
from app.infrastructure.storage.storage import Storage, StorageUnavailable

router = APIRouter()


def get_recipe_image_storage() -> Iterator[Storage]:
    config = get_settings().storage_config
    if config is None:
        raise HTTPException(
            503, "Image storage is unavailable", headers={"Cache-Control": "no-store"}
        )
    storage = Storage(config, bucket=image_bucket(config, ImageKind.RECIPE))
    try:
        yield storage
    finally:
        storage.close()


def get_recipe_image_uploads(
    storage: Storage = Depends(get_recipe_image_storage),
) -> RecipeImageUploads:
    return RecipeImageUploads(storage, SessionLocal)


@router.get(
    "/recipe-images/{image_id}/download",
    response_model=RecipeImageDownloadOut,
    responses={status: {"model": ErrorResponse} for status in (404, 503)},
)
def download_image(
    image_id: UUID,
    response: Response,
    session: Session = Depends(get_db),
    storage: Storage = Depends(get_recipe_image_storage),
) -> RecipeImageDownloadOut:
    headers = {"Cache-Control": "no-store"}
    image = session.get(ImageAsset, image_id)
    if image is None or image.kind != ImageKind.RECIPE:
        raise HTTPException(404, "Recipe image not found", headers=headers)
    try:
        transfer = storage.presign_download(image.object_key)
    except StorageUnavailable:
        raise HTTPException(
            503, "Image storage is unavailable", headers=headers
        ) from None
    response.headers.update(headers)
    return RecipeImageDownloadOut(url=transfer.url, expiresIn=transfer.expires_in)


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
