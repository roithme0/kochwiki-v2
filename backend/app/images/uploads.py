from dataclasses import replace
from uuid import UUID

from sqlalchemy.exc import DBAPIError, SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.images.models import ImageAsset
from app.images.schemas import ImageUpload, ValidatedImage
from app.images.transfers import ImagePersistenceFailed, ImageTransfers, InvalidImage


class ImageUploads:
    def __init__(self, transfers: ImageTransfers, sessions: sessionmaker[Session]) -> None:
        self._transfers = transfers
        self._sessions = sessions

    def begin(self, uploader_id: int) -> ImageUpload:
        upload = self._transfers.begin()
        try:
            with self._sessions.begin() as session:
                self._register_upload(session, upload, uploader_id)
        except SQLAlchemyError:
            raise ImagePersistenceFailed(cleanup_pending=False) from None
        return upload

    def complete(self, upload_id: UUID, uploader_id: int) -> ValidatedImage:
        image: ValidatedImage | None = None
        try:
            with self._sessions.begin() as session:
                owner_id = self._authorize_upload(session, upload_id, uploader_id)
                image = self._transfers.complete(session, upload_id, uploader_id=owner_id)
                self._consume_upload(session, upload_id)
                session.flush()
        except InvalidImage as error:
            error.cleanup_pending = not self._transfers.cleanup_upload(upload_id)
            raise
        except SQLAlchemyError as error:
            if image is None:
                raise ImagePersistenceFailed(cleanup_pending=False) from None
            self._recover(image, error)
        assert image is not None
        return replace(image, cleanup_pending=not self._transfers.cleanup_upload(upload_id))

    def _recover(self, image: ValidatedImage, error: SQLAlchemyError) -> None:
        try:
            with self._sessions() as session:
                persisted = session.get(ImageAsset, image.id) is not None
        except SQLAlchemyError:
            raise ImagePersistenceFailed(cleanup_pending=True) from None
        if persisted:
            return
        if isinstance(error, DBAPIError) and error.connection_invalidated:
            raise ImagePersistenceFailed(cleanup_pending=True) from None
        raise ImagePersistenceFailed(cleanup_pending=not self._transfers.cleanup_image(image)) from None

    def _register_upload(self, session: Session, upload: ImageUpload, uploader_id: int) -> None:
        pass

    def _authorize_upload(self, session: Session, upload_id: UUID, uploader_id: int) -> int | None:
        return None

    def _consume_upload(self, session: Session, upload_id: UUID) -> None:
        pass
