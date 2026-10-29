from collections.abc import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response

from app.images.config import IMAGE_CONTENT_TYPE
from app.images.dependencies import image_storage
from app.infrastructure.database.session import SessionLocal
from app.images.models import ImageKind
from app.core.schemas.errors import (
    AUTHENTICATION_RESPONSES,
    FORBIDDEN_RESPONSE,
    ErrorResponse,
)
from app.identity.dependencies import require_current_user
from app.identity.models.user import User
from app.recipes.services.image_uploads import RecipeImageUploads
from app.recipes.schemas.image import (
    RecipeImageDownloadOut,
    RecipeImageOut,
    RecipeImageUploadOut,
)
from app.images.transfers import (
    ImagePersistenceFailed,
    ImageUploadNotFound,
    InvalidImage,
    ImageTransfers,
)
from app.infrastructure.storage.storage import Storage, StorageUnavailable

router = APIRouter(
    dependencies=[Depends(require_current_user, scope="function")],
    responses={
        **AUTHENTICATION_RESPONSES,
        503: {
            "model": ErrorResponse,
            "description": "Login not configured or image transfer unavailable",
        },
    },
)


def get_recipe_image_storage() -> Iterator[Storage]:
    yield from image_storage(ImageKind.RECIPE)


def get_recipe_image_transfers(
    storage: Storage = Depends(get_recipe_image_storage),
) -> ImageTransfers:
    return ImageTransfers(storage, SessionLocal, kind=ImageKind.RECIPE)


def get_recipe_image_uploads(
    transfers: ImageTransfers = Depends(get_recipe_image_transfers),
) -> RecipeImageUploads:
    return RecipeImageUploads(transfers, SessionLocal)


@router.get(
    "/recipe-images/{image_id}/download",
    response_model=RecipeImageDownloadOut,
    responses={404: {"model": ErrorResponse}},
)
def download_image(
    image_id: UUID,
    response: Response,
    uploads: ImageTransfers = Depends(get_recipe_image_transfers),
) -> RecipeImageDownloadOut:
    headers = {"Cache-Control": "no-store"}
    try:
        transfer = uploads.download(image_id)
    except StorageUnavailable:
        raise HTTPException(
            503, "Image storage is unavailable", headers=headers
        ) from None
    if transfer is None:
        raise HTTPException(404, "Recipe image not found", headers=headers)
    response.headers.update(headers)
    return RecipeImageDownloadOut(url=transfer.url, expiresIn=transfer.expires_in)


@router.post(
    "/recipe-image-uploads",
    response_model=RecipeImageUploadOut,
    responses=FORBIDDEN_RESPONSE,
)
def begin_upload(
    user: User = Depends(require_current_user, scope="function"),
    uploads: RecipeImageUploads = Depends(get_recipe_image_uploads),
) -> RecipeImageUploadOut:
    try:
        upload = uploads.begin(user.id)
    except StorageUnavailable:
        raise HTTPException(503, "Image storage is unavailable") from None
    except ImagePersistenceFailed:
        raise HTTPException(503, "Image upload could not be started") from None
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
    responses={
        **FORBIDDEN_RESPONSE,
        **{status: {"model": ErrorResponse} for status in (400, 404)},
    },
)
def complete_upload(
    upload_id: UUID,
    user: User = Depends(require_current_user, scope="function"),
    uploads: RecipeImageUploads = Depends(get_recipe_image_uploads),
) -> RecipeImageOut:
    try:
        image = uploads.complete(upload_id, user.id)
    except ImageUploadNotFound:
        raise HTTPException(404, "Upload has not been received") from None
    except InvalidImage as error:
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
