import unittest
from hashlib import sha256
from io import BytesIO
from unittest.mock import Mock
from uuid import uuid4
from zlib import crc32

from PIL import Image
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app.images.config import MAX_IMAGE_BYTES
from app.images.models import ImageAsset

from app.recipes.services.image_uploads import (
    ImageUploadNotFound,
    ImagePersistenceFailed,
    InvalidRecipeImage,
    RecipeImageUploads,
)
from app.infrastructure.storage.storage import PresignedTransfer, StorageObjectTooLarge, StorageUnavailable


def png(width: int = 2, height: int = 3) -> bytes:
    output = BytesIO()
    with Image.new("RGBA", (width, height), (255, 0, 0, 128)) as image:
        image.save(output, format="PNG")
    return output.getvalue()


def chunk(kind: bytes, data: bytes) -> bytes:
    payload = kind + data
    return len(data).to_bytes(4, "big") + payload + crc32(payload).to_bytes(4, "big")


class RecipeImageUploadTests(unittest.TestCase):
    def setUp(self) -> None:
        self.storage = Mock()
        self.engine = create_engine("sqlite://")
        ImageAsset.__table__.create(self.engine)
        self.addCleanup(self.engine.dispose)
        self.sessions = sessionmaker(self.engine)
        self.service = RecipeImageUploads(self.storage, self.sessions)
        self.upload_id = uuid4()
        self.temporary_key = f"recipe-image-uploads/{self.upload_id}"

    def test_begin_only_signs_a_temporary_key(self) -> None:
        self.storage.presign_upload.return_value = PresignedTransfer("secret-url", "PUT", 300)
        upload = self.service.begin()
        self.storage.presign_upload.assert_called_once_with(f"recipe-image-uploads/{upload.id}")
        self.assertNotIn("secret-url", repr(upload))
        self.storage.write.assert_not_called()

    def test_success_writes_exact_validated_bytes_and_cleans_temporary_object(self) -> None:
        data = png()
        self.storage.read.return_value = data
        result = self.service.complete(self.upload_id)
        self.assertEqual((result.width, result.height, result.size), (2, 3, len(data)))
        self.assertEqual(result.sha256, sha256(data).hexdigest())
        self.assertEqual(result.object_key, f"recipe-images/{result.id}.png")
        self.assertFalse(result.cleanup_pending)
        with self.sessions() as session:
            saved = session.get(ImageAsset, result.id)
            self.assertIsNotNone(saved)
            assert saved is not None
            self.assertEqual(
                (saved.object_key, saved.size, saved.width, saved.height, saved.sha256, saved.content_type),
                (result.object_key, result.size, result.width, result.height, result.sha256, result.content_type),
            )
            self.assertEqual(saved.created_at, result.created_at.replace(tzinfo=None))
        self.storage.read.assert_called_once_with(self.temporary_key, max_bytes=MAX_IMAGE_BYTES)
        self.storage.write.assert_called_once_with(result.object_key, data, content_type="image/png")
        self.storage.delete.assert_called_once_with(self.temporary_key)

    def test_invalid_images_are_rejected_and_removed(self) -> None:
        animated = BytesIO()
        with Image.new("RGBA", (2, 2), "red") as first, Image.new("RGBA", (2, 2), "blue") as second:
            first.save(animated, format="PNG", save_all=True, append_images=[second], duration=100, loop=0)
        control = b"acTL" + (1).to_bytes(4, "big") + (0).to_bytes(4, "big")
        animation_chunk = (8).to_bytes(4, "big") + control + crc32(control).to_bytes(4, "big")
        one_frame_apng = png()[:33] + animation_chunk + png()[33:]
        jpeg = BytesIO()
        with Image.new("RGB", (2, 2)) as image:
            image.save(jpeg, format="JPEG")
        corrupted = bytearray(png())
        corrupted[-5] ^= 1
        cases = (b"", b"not an image", jpeg.getvalue(), png()[:-15], bytes(corrupted),
                 animated.getvalue(), one_frame_apng, png(4097, 1), png(1, 4097))
        for data in cases:
            with self.subTest(size=len(data)):
                self.storage.reset_mock()
                self.storage.read.return_value = data
                with self.assertRaises(InvalidRecipeImage) as failure:
                    self.service.complete(self.upload_id)
                self.assertFalse(failure.exception.cleanup_pending)
                self.storage.write.assert_not_called()
                self.storage.delete.assert_called_once_with(self.temporary_key)

    def test_maximum_dimensions_are_accepted(self) -> None:
        self.storage.read.return_value = png(4096, 4096)
        result = self.service.complete(self.upload_id)
        self.assertEqual((result.width, result.height), (4096, 4096))

    def test_exact_byte_limit_is_accepted_and_overflow_is_rejected(self) -> None:
        data = png()
        padding = chunk(b"prIv", bytes(MAX_IMAGE_BYTES - len(data) - 12))
        self.storage.read.return_value = data[:-12] + padding + data[-12:]
        self.assertEqual(self.service.complete(self.upload_id).size, MAX_IMAGE_BYTES)
        self.storage.reset_mock()
        self.storage.read.return_value += b"x"
        with self.assertRaisesRegex(InvalidRecipeImage, "10 MiB"):
            self.service.complete(self.upload_id)
        self.storage.write.assert_not_called()
        self.storage.delete.assert_called_once_with(self.temporary_key)

    def test_valid_checksums_do_not_substitute_for_pixel_decoding(self) -> None:
        data = png()
        idat = data.index(b"IDAT") - 4
        length = int.from_bytes(data[idat:idat + 4], "big")
        broken = data[:idat] + chunk(b"IDAT", b"\x00" * length) + data[idat + length + 12:]
        self.storage.read.return_value = broken
        with self.assertRaises(InvalidRecipeImage):
            self.service.complete(self.upload_id)
        self.storage.write.assert_not_called()
        self.storage.delete.assert_called_once_with(self.temporary_key)

    def test_size_rejection_cleans_without_writing(self) -> None:
        self.storage.read.side_effect = StorageObjectTooLarge()
        with self.assertRaisesRegex(InvalidRecipeImage, "10 MiB"):
            self.service.complete(self.upload_id)
        self.storage.delete.assert_called_once_with(self.temporary_key)
        self.storage.write.assert_not_called()

    def test_missing_upload_and_transport_failure_do_not_delete_retryable_upload(self) -> None:
        self.storage.read.return_value = None
        with self.assertRaises(ImageUploadNotFound):
            self.service.complete(self.upload_id)
        self.storage.read.side_effect = StorageUnavailable()
        with self.assertRaises(StorageUnavailable):
            self.service.complete(self.upload_id)
        self.storage.delete.assert_not_called()

    def test_failed_permanent_write_keeps_temporary_upload_for_retry(self) -> None:
        self.storage.read.return_value = png()
        self.storage.write.side_effect = StorageUnavailable()
        with self.assertRaises(StorageUnavailable):
            self.service.complete(self.upload_id)
        self.storage.delete.assert_not_called()

    def test_cleanup_failure_preserves_result_or_validation_error(self) -> None:
        self.storage.delete.side_effect = StorageUnavailable()
        self.storage.read.return_value = png()
        self.assertTrue(self.service.complete(self.upload_id).cleanup_pending)
        self.storage.read.return_value = b"invalid"
        with self.assertRaises(InvalidRecipeImage) as failure:
            self.service.complete(self.upload_id)
        self.assertTrue(failure.exception.cleanup_pending)

    def test_replayed_upload_gets_a_distinct_permanent_identity(self) -> None:
        self.storage.read.return_value = png()
        first = self.service.complete(self.upload_id)
        self.storage.read.return_value = png(3, 2)
        second = self.service.complete(self.upload_id)
        self.assertNotEqual(first.id, second.id)
        self.assertNotEqual(first.object_key, second.object_key)

    def test_database_failure_removes_permanent_object_and_keeps_upload_retryable(self) -> None:
        self.storage.read.return_value = png()

        def fail_commit(session: Session) -> None:
            raise OperationalError("commit", None, RuntimeError("private database error"))

        event.listen(self.sessions, "before_commit", fail_commit)
        with self.assertRaises(ImagePersistenceFailed) as failure:
            self.service.complete(self.upload_id)
        self.assertFalse(failure.exception.cleanup_pending)
        self.assertNotIn("private", str(failure.exception))
        key = self.storage.write.call_args.args[0]
        self.storage.delete.assert_called_once_with(key)
        with self.sessions() as session:
            self.assertEqual(list(session.scalars(select(ImageAsset))), [])
        event.remove(self.sessions, "before_commit", fail_commit)
        self.assertFalse(self.service.complete(self.upload_id).cleanup_pending)

    def test_unknown_database_outcome_retains_permanent_object(self) -> None:
        self.storage.read.return_value = png()
        ImageAsset.__table__.drop(self.engine)
        with self.assertRaises(ImagePersistenceFailed) as failure:
            self.service.complete(self.upload_id)
        self.assertTrue(failure.exception.cleanup_pending)
        self.storage.delete.assert_not_called()

    def test_failed_compensation_reports_cleanup_pending(self) -> None:
        self.storage.read.return_value = png()
        self.storage.delete.side_effect = StorageUnavailable()

        def fail_commit(session: Session) -> None:
            raise OperationalError("commit", None, RuntimeError())

        event.listen(self.sessions, "before_commit", fail_commit)
        with self.assertRaises(ImagePersistenceFailed) as failure:
            self.service.complete(self.upload_id)
        self.assertTrue(failure.exception.cleanup_pending)
        self.storage.delete.assert_called_once_with(self.storage.write.call_args.args[0])

    def test_lost_connection_retains_object_even_if_record_is_not_yet_visible(self) -> None:
        self.storage.read.return_value = png()

        def lose_connection(session: Session) -> None:
            raise OperationalError("commit", None, RuntimeError(), connection_invalidated=True)

        event.listen(self.sessions, "before_commit", lose_connection)
        with self.assertRaises(ImagePersistenceFailed) as failure:
            self.service.complete(self.upload_id)
        self.assertTrue(failure.exception.cleanup_pending)
        self.storage.delete.assert_not_called()

    def test_commit_acknowledgement_failure_does_not_delete_committed_image(self) -> None:
        self.storage.read.return_value = png()

        def fail_acknowledgement(session: Session) -> None:
            raise OperationalError("commit acknowledgement", None, RuntimeError())

        event.listen(self.sessions, "after_commit", fail_acknowledgement)
        result = self.service.complete(self.upload_id)
        with self.sessions() as session:
            self.assertIsNotNone(session.get(ImageAsset, result.id))
        self.storage.delete.assert_called_once_with(self.temporary_key)


if __name__ == "__main__":
    unittest.main()
