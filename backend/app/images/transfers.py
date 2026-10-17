from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
from uuid import UUID, uuid4
from zlib import crc32, error as ZlibError

from PIL import Image, UnidentifiedImageError
from PIL.PngImagePlugin import PngImageFile
from sqlalchemy.exc import DBAPIError, SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.images.config import IMAGE_CONTENT_TYPE, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE
from app.images.models import ImageAsset, ImageKind
from app.images.schemas import ImageUpload, ValidatedImage
from app.infrastructure.storage.storage import (
    Storage,
    StorageObjectTooLarge,
    StorageUnavailable,
    PresignedTransfer,
)


class ImageUploadNotFound(Exception):
    pass


class ImagePersistenceFailed(Exception):
    def __init__(self, *, cleanup_pending: bool) -> None:
        super().__init__("Image metadata could not be persisted")
        self.cleanup_pending = cleanup_pending


class InvalidImage(Exception):
    def __init__(self, message: str, *, cleanup_pending: bool = False) -> None:
        super().__init__(message)
        self.cleanup_pending = cleanup_pending


class ImageTransfers:
    def __init__(
        self, storage: Storage, sessions: sessionmaker[Session], *, kind: ImageKind,
    ) -> None:
        self._storage = storage
        self._sessions = sessions
        self._kind = kind

    def download(self, image_id: UUID) -> PresignedTransfer | None:
        with self._sessions() as session:
            image = session.get(ImageAsset, image_id)
            if image is None or image.kind != self._kind:
                return None
            return self._storage.presign_download(image.object_key)

    def begin(self) -> ImageUpload:
        upload_id = uuid4()
        transfer = self._storage.presign_upload(self._temporary_key(upload_id))
        return ImageUpload(id=upload_id, transfer=transfer)

    def complete(self, upload_id: UUID) -> ValidatedImage:
        temporary_key = self._temporary_key(upload_id)
        try:
            data = self._storage.read(temporary_key, max_bytes=MAX_IMAGE_BYTES)
        except StorageObjectTooLarge:
            raise InvalidImage(
                f"Image must not exceed {MAX_IMAGE_BYTES / (1024 * 1024):g} MiB",
                cleanup_pending=not self._cleanup(temporary_key),
            ) from None
        if data is None:
            raise ImageUploadNotFound("Upload has not been received")
        try:
            width, height = self._validate(data)
        except InvalidImage as error:
            error.cleanup_pending = not self._cleanup(temporary_key)
            raise
        image_id = uuid4()
        object_key = f"{self._kind.value}-images/{image_id}.png"
        self._storage.write(object_key, data, content_type=IMAGE_CONTENT_TYPE)
        created_at = datetime.now(timezone.utc)
        digest = sha256(data).hexdigest()
        record = ImageAsset(
            kind=self._kind,
            id=image_id,
            object_key=object_key,
            size=len(data),
            width=width,
            height=height,
            sha256=digest,
            content_type=IMAGE_CONTENT_TYPE,
            created_at=created_at,
        )
        try:
            with self._sessions.begin() as session:
                session.add(record)
        except SQLAlchemyError as error:
            try:
                with self._sessions() as session:
                    persisted = session.get(ImageAsset, image_id) is not None
            except SQLAlchemyError:
                raise ImagePersistenceFailed(cleanup_pending=True) from None
            if not persisted:
                if isinstance(error, DBAPIError) and error.connection_invalidated:
                    raise ImagePersistenceFailed(cleanup_pending=True) from None
                raise ImagePersistenceFailed(
                    cleanup_pending=not self._cleanup(object_key),
                ) from None
        return ValidatedImage(
            id=image_id,
            object_key=object_key,
            size=len(data),
            width=width,
            height=height,
            sha256=digest,
            created_at=created_at,
            cleanup_pending=not self._cleanup(temporary_key),
        )

    def _cleanup(self, key: str) -> bool:
        try:
            self._storage.delete(key)
        except StorageUnavailable:
            return False
        return True

    def _temporary_key(self, upload_id: UUID) -> str:
        return f"{self._kind.value}-image-uploads/{upload_id}"

    @staticmethod
    def _validate(data: bytes) -> tuple[int, int]:
        if len(data) > MAX_IMAGE_BYTES:
            raise InvalidImage(
                f"Image must not exceed {MAX_IMAGE_BYTES / (1024 * 1024):g} MiB"
            )
        ImageTransfers._validate_chunks(data)
        try:
            with Image.open(BytesIO(data), formats=("PNG",)) as image:
                if not isinstance(image, PngImageFile):
                    raise InvalidImage("Image must be a valid PNG")
                width, height = image.size
                if not (1 <= width <= MAX_IMAGE_SIDE and 1 <= height <= MAX_IMAGE_SIDE):
                    raise InvalidImage(
                        f"Image dimensions must not exceed {MAX_IMAGE_SIDE} pixels per side"
                    )
                if image.n_frames != 1 or "loop" in image.info:
                    raise InvalidImage("Animated PNG images are not supported")
                image.verify()
            with Image.open(BytesIO(data), formats=("PNG",)) as decoded:
                decoded.load()
        except (
            UnidentifiedImageError,
            OSError,
            SyntaxError,
            ValueError,
            ZlibError,
            Image.DecompressionBombError,
        ):
            raise InvalidImage("Image must be a valid PNG") from None
        return width, height

    @staticmethod
    def _validate_chunks(data: bytes) -> None:
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            raise InvalidImage("Image must be a valid PNG")
        offset = 8
        while offset + 12 <= len(data):
            length = int.from_bytes(data[offset : offset + 4], "big")
            end = offset + 12 + length
            if end > len(data):
                break
            chunk_type = data[offset + 4 : offset + 8]
            expected = int.from_bytes(data[end - 4 : end], "big")
            if crc32(memoryview(data)[offset + 4 : end - 4]) != expected:
                break
            if chunk_type == b"acTL":
                raise InvalidImage("Animated PNG images are not supported")
            if chunk_type == b"IEND":
                if length == 0 and end == len(data):
                    return
                break
            offset = end
        raise InvalidImage("Image must be a valid PNG")
