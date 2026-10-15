from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
from uuid import UUID, uuid4
from zlib import crc32, error as ZlibError

from PIL import Image, UnidentifiedImageError
from PIL.PngImagePlugin import PngImageFile

from app.services.storage import (
    PresignedTransfer,
    Storage,
    StorageObjectTooLarge,
    StorageUnavailable,
)

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_SIDE = 4096


class ImageUploadNotFound(Exception):
    pass


class InvalidRecipeImage(Exception):
    def __init__(self, message: str, *, cleanup_pending: bool = False) -> None:
        super().__init__(message)
        self.cleanup_pending = cleanup_pending


@dataclass(frozen=True)
class ImageUpload:
    id: UUID
    transfer: PresignedTransfer


@dataclass(frozen=True)
class ValidatedRecipeImage:
    id: UUID
    object_key: str
    size: int
    width: int
    height: int
    sha256: str
    content_type: str = "image/png"
    cleanup_pending: bool = False


class RecipeImageUploads:
    def __init__(self, storage: Storage) -> None:
        self._storage = storage

    def begin(self) -> ImageUpload:
        upload_id = uuid4()
        transfer = self._storage.presign_upload(self._temporary_key(upload_id))
        return ImageUpload(id=upload_id, transfer=transfer)

    def complete(self, upload_id: UUID) -> ValidatedRecipeImage:
        temporary_key = self._temporary_key(upload_id)
        try:
            data = self._storage.read(temporary_key, max_bytes=MAX_IMAGE_BYTES)
        except StorageObjectTooLarge:
            raise InvalidRecipeImage(
                "Image must not exceed 10 MiB",
                cleanup_pending=not self._cleanup(temporary_key),
            ) from None
        if data is None:
            raise ImageUploadNotFound("Upload has not been received")
        try:
            width, height = self._validate(data)
        except InvalidRecipeImage as error:
            error.cleanup_pending = not self._cleanup(temporary_key)
            raise
        image_id = uuid4()
        object_key = f"recipe-images/{image_id}.png"
        self._storage.write(object_key, data, content_type="image/png")
        return ValidatedRecipeImage(
            id=image_id, object_key=object_key, size=len(data),
            width=width, height=height, sha256=sha256(data).hexdigest(),
            cleanup_pending=not self._cleanup(temporary_key),
        )

    def _cleanup(self, key: str) -> bool:
        try:
            self._storage.delete(key)
        except StorageUnavailable:
            return False
        return True

    @staticmethod
    def _temporary_key(upload_id: UUID) -> str:
        return f"recipe-image-uploads/{upload_id}"

    @staticmethod
    def _validate(data: bytes) -> tuple[int, int]:
        if len(data) > MAX_IMAGE_BYTES:
            raise InvalidRecipeImage("Image must not exceed 10 MiB")
        RecipeImageUploads._validate_chunks(data)
        try:
            with Image.open(BytesIO(data), formats=("PNG",)) as image:
                if not isinstance(image, PngImageFile):
                    raise InvalidRecipeImage("Image must be a valid PNG")
                width, height = image.size
                if not (1 <= width <= MAX_IMAGE_SIDE and 1 <= height <= MAX_IMAGE_SIDE):
                    raise InvalidRecipeImage("Image dimensions must not exceed 4096 pixels per side")
                if image.n_frames != 1 or "loop" in image.info:
                    raise InvalidRecipeImage("Animated PNG images are not supported")
                image.verify()
            with Image.open(BytesIO(data), formats=("PNG",)) as decoded:
                decoded.load()
        except (UnidentifiedImageError, OSError, SyntaxError, ValueError, ZlibError, Image.DecompressionBombError):
            raise InvalidRecipeImage("Image must be a valid PNG") from None
        return width, height

    @staticmethod
    def _validate_chunks(data: bytes) -> None:
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            raise InvalidRecipeImage("Image must be a valid PNG")
        offset = 8
        while offset + 12 <= len(data):
            length = int.from_bytes(data[offset:offset + 4], "big")
            end = offset + 12 + length
            if end > len(data):
                break
            chunk_type = data[offset + 4:offset + 8]
            expected = int.from_bytes(data[end - 4:end], "big")
            if crc32(memoryview(data)[offset + 4:end - 4]) != expected:
                break
            if chunk_type == b"acTL":
                raise InvalidRecipeImage("Animated PNG images are not supported")
            if chunk_type == b"IEND":
                if length == 0 and end == len(data):
                    return
                break
            offset = end
        raise InvalidRecipeImage("Image must be a valid PNG")
