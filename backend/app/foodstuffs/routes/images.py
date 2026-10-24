from collections.abc import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response

from app.images.config import IMAGE_CONTENT_TYPE
from app.images.dependencies import image_storage
from app.infrastructure.database.session import SessionLocal
from app.images.models import ImageKind
from app.core.schemas.errors import AUTHENTICATION_RESPONSES, ErrorResponse
from app.identity.dependencies import require_current_user
from app.identity.models.user import User
from app.foodstuffs.services.image_uploads import FoodstuffImageUploads
from app.foodstuffs.schemas.image import (
    FoodstuffImageDownloadOut,
    FoodstuffImageOut,
    FoodstuffImageUploadOut,
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
        503: {"model": ErrorResponse, "description": "Login not configured or image transfer unavailable"},
    },
)


def get_foodstuff_image_storage() -> Iterator[Storage]:
    yield from image_storage(ImageKind.FOODSTUFF)


def get_foodstuff_image_transfers(
    storage: Storage = Depends(get_foodstuff_image_storage),
) -> ImageTransfers:
    return ImageTransfers(storage, SessionLocal, kind=ImageKind.FOODSTUFF)


def get_foodstuff_image_uploads(
    transfers: ImageTransfers = Depends(get_foodstuff_image_transfers),
) -> FoodstuffImageUploads:
    return FoodstuffImageUploads(transfers, SessionLocal)


@router.get(
    "/foodstuff-images/{image_id}/download",
    response_model=FoodstuffImageDownloadOut,
    responses={404: {"model": ErrorResponse}},
)
def download_image(
    image_id: UUID,
    response: Response,
    uploads: ImageTransfers = Depends(get_foodstuff_image_transfers),
) -> FoodstuffImageDownloadOut:
    headers = {"Cache-Control": "no-store"}
    try:
        transfer = uploads.download(image_id)
    except StorageUnavailable:
        raise HTTPException(
            503, "Image storage is unavailable", headers=headers
        ) from None
    if transfer is None:
        raise HTTPException(404, "Foodstuff image not found", headers=headers)
    response.headers.update(headers)
    return FoodstuffImageDownloadOut(url=transfer.url, expiresIn=transfer.expires_in)


@router.post(
    "/foodstuff-image-uploads",
    response_model=FoodstuffImageUploadOut,
)
def begin_upload(
    user: User = Depends(require_current_user, scope="function"),
    uploads: FoodstuffImageUploads = Depends(get_foodstuff_image_uploads),
) -> FoodstuffImageUploadOut:
    try:
        upload = uploads.begin(user.id)
    except StorageUnavailable:
        raise HTTPException(503, "Image storage is unavailable") from None
    except ImagePersistenceFailed:
        raise HTTPException(503, "Image upload could not be started") from None
    return FoodstuffImageUploadOut(
        uploadId=upload.id,
        url=upload.transfer.url,
        method="PUT",
        headers={"Content-Type": IMAGE_CONTENT_TYPE},
        expiresIn=upload.transfer.expires_in,
    )


@router.post(
    "/foodstuff-image-uploads/{upload_id}/complete",
    response_model=FoodstuffImageOut,
    responses={status: {"model": ErrorResponse} for status in (400, 404)},
)
def complete_upload(
    upload_id: UUID,
    user: User = Depends(require_current_user, scope="function"),
    uploads: FoodstuffImageUploads = Depends(get_foodstuff_image_uploads),
) -> FoodstuffImageOut:
    try:
        image = uploads.complete(upload_id, user.id)
    except ImageUploadNotFound:
        raise HTTPException(404, "Upload has not been received") from None
    except InvalidImage as error:
        raise HTTPException(400, str(error)) from None
    except (StorageUnavailable, ImagePersistenceFailed):
        raise HTTPException(503, "Image upload could not be completed") from None
    return FoodstuffImageOut(
        id=image.id,
        contentType=IMAGE_CONTENT_TYPE,
        size=image.size,
        width=image.width,
        height=image.height,
        createdAt=image.created_at,
    )
