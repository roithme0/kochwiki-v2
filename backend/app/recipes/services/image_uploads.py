from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError
from app.images.schemas import ImageUpload
from app.images.transfers import ImageUploadNotFound
from app.images.uploads import ImageUploads
from app.recipes.models.image_upload import RecipeImageUpload


class RecipeImageUploads(ImageUploads):
    def _register_upload(
        self, session: Session, upload: ImageUpload, uploader_id: int
    ) -> None:
        session.add(
            RecipeImageUpload(
                id=upload.id,
                uploader_id=uploader_id,
                created_at=datetime.now(timezone.utc),
            )
        )

    def _authorize_upload(
        self, session: Session, upload_id: UUID, uploader_id: int
    ) -> int:
        upload = session.scalar(
            select(RecipeImageUpload)
            .where(
                RecipeImageUpload.id == upload_id,
            )
            .with_for_update()
        )
        if upload is None:
            raise ImageUploadNotFound("Upload has not been received")
        if upload.uploader_id != uploader_id:
            raise ForbiddenError(
                "Only the uploader may complete this recipe image upload"
            )
        return upload.uploader_id

    def _consume_upload(self, session: Session, upload_id: UUID) -> None:
        session.execute(
            delete(RecipeImageUpload).where(RecipeImageUpload.id == upload_id)
        )
