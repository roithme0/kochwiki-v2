import unittest
from io import BytesIO
from unittest.mock import patch
from urllib.parse import parse_qs, quote, urlsplit

from botocore.exceptions import EndpointConnectionError
from botocore.stub import Stubber
from botocore.response import StreamingBody
from pydantic import SecretStr, ValidationError

from app.core.config import Settings
from app.images.models import ImageKind
from app.images.storage import image_bucket
from app.infrastructure.storage.config import StorageConfig
from app.infrastructure.storage.storage import (
    Storage,
    StorageObjectTooLarge,
    StorageUnavailable,
)


def configuration() -> StorageConfig:
    return StorageConfig(
        endpoint_url="http://file-storage:3900",
        public_origin="https://example.invalid:8443/",
        region="garage",
        bucket_recipe_images="explicit-bucket",
        bucket_foodstuff_images="foodstuff-bucket",
        access_key_id=SecretStr("GK-test-only"),
        secret_access_key=SecretStr("test-secret"),
    )


class StorageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.storage = Storage(
            configuration(), bucket=configuration().bucket_recipe_images
        )
        self.addCleanup(self.storage.close)

    def test_two_buckets_route_all_operations_independently(self) -> None:
        key = "folder/food +%?#ä.png"
        for bucket in ("recipe-images", "foodstuff-images"):
            with self.subTest(bucket=bucket):
                storage = Storage(configuration(), bucket=bucket)
                self.addCleanup(storage.close)
                for transfer in (
                    storage.presign_upload(key),
                    storage.presign_download(key),
                ):
                    assert urlsplit(transfer.url).path == f"/storage/{bucket}/" + quote(
                        key, safe="/"
                    )
                with Stubber(storage._internal) as stub:
                    stub.add_response(
                        "get_object",
                        {"ContentLength": 3, "Body": StreamingBody(BytesIO(b"png"), 3)},
                        {"Bucket": bucket, "Key": key},
                    )
                    stub.add_response(
                        "put_object",
                        {},
                        {
                            "Bucket": bucket,
                            "Key": key,
                            "Body": b"png",
                            "ContentType": "image/png",
                        },
                    )
                    stub.add_response(
                        "head_object",
                        {"ContentLength": 3, "ETag": '"opaque"'},
                        {"Bucket": bucket, "Key": key},
                    )
                    stub.add_response(
                        "delete_object", {}, {"Bucket": bucket, "Key": key}
                    )
                    self.assertEqual(storage.read(key, max_bytes=3), b"png")
                    storage.write(key, b"png", content_type="image/png")
                    self.assertIsNotNone(storage.inspect(key))
                    storage.delete(key)
                    stub.assert_no_pending_responses()

    def test_public_signature_preserves_encoded_path_and_port(self) -> None:
        key = "folder/plate +%?#ä.png"
        for method, transfer in (
            ("PUT", self.storage.presign_upload(key)),
            ("GET", self.storage.presign_download(key)),
        ):
            parsed = urlsplit(transfer.url)
            self.assertEqual(parsed.netloc, "example.invalid:8443")
            self.assertEqual(
                parsed.path, "/storage/explicit-bucket/" + quote(key, safe="/")
            )
            query = parse_qs(parsed.query)
            self.assertEqual(query["X-Amz-SignedHeaders"], ["host"])
            self.assertIn("/garage/s3/aws4_request", query["X-Amz-Credential"][0])
            self.assertEqual(transfer.method, method)
            self.assertNotIn("Signature", repr(transfer))
            self.assertNotIn("test-secret", repr(configuration()))
        self.assertNotEqual(
            self.storage.presign_upload(key).url, self.storage.presign_download(key).url
        )
        self.assertEqual(
            self.storage._internal.meta.endpoint_url, "http://file-storage:3900"
        )

    def test_inspect_and_delete_use_explicit_bucket(self) -> None:
        with Stubber(self.storage._internal) as stub:
            stub.add_response(
                "head_object",
                {"ContentLength": 42, "ContentType": "image/png", "ETag": '"opaque"'},
                {"Bucket": "explicit-bucket", "Key": "test.png"},
            )
            stub.add_response(
                "delete_object", {}, {"Bucket": "explicit-bucket", "Key": "test.png"}
            )
            result = self.storage.inspect("test.png")
            self.assertIsNotNone(result)
            assert result is not None
            self.assertEqual(
                (result.size, result.content_type, result.etag),
                (42, "image/png", '"opaque"'),
            )
            self.storage.delete("test.png")
            stub.assert_no_pending_responses()

    def test_missing_is_distinct_from_denied_or_unavailable(self) -> None:
        with Stubber(self.storage._internal) as stub:
            stub.add_client_error(
                "head_object", service_error_code="404", http_status_code=404
            )
            self.assertIsNone(self.storage.inspect("missing.png"))
            stub.add_client_error(
                "head_object",
                service_error_code="AccessDenied",
                service_message="sensitive detail",
                http_status_code=403,
            )
            with self.assertRaisesRegex(
                StorageUnavailable, "^Storage object inspection failed$"
            ):
                self.storage.inspect("denied.png")
            stub.add_client_error(
                "delete_object",
                service_error_code="AccessDenied",
                service_message="sensitive detail",
                http_status_code=403,
            )
            with self.assertRaisesRegex(
                StorageUnavailable, "^Storage object deletion failed$"
            ):
                self.storage.delete("denied.png")
        with patch.object(
            self.storage._internal,
            "head_object",
            side_effect=EndpointConnectionError(endpoint_url="sensitive detail"),
        ):
            with self.assertRaises(StorageUnavailable) as failure:
                self.storage.inspect("test.png")
            self.assertNotIn("sensitive", str(failure.exception))
            self.assertTrue(failure.exception.__suppress_context__)

    def test_keys_and_expiry_reject_ambiguous_transfers(self) -> None:
        for key in (
            "",
            "/leading",
            "trailing/",
            "a//b",
            "a/../b",
            "a/./b",
            "a\\b",
            "a\nb",
            "ä" * 513,
        ):
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.storage.presign_upload(key)
        for expiry in (0, -1, 3601, True):
            with self.subTest(expiry=expiry), self.assertRaises(ValueError):
                self.storage.presign_download("test.png", expires_in=expiry)

    def test_bounded_read_and_write(self) -> None:
        with Stubber(self.storage._internal) as stub:
            body = StreamingBody(BytesIO(b"png"), 3)
            stub.add_response(
                "get_object",
                {"ContentLength": 3, "Body": body},
                {"Bucket": "explicit-bucket", "Key": "temporary"},
            )
            self.assertEqual(self.storage.read("temporary", max_bytes=3), b"png")
            self.assertTrue(body._raw_stream.closed)
            stub.add_response(
                "put_object",
                {},
                {
                    "Bucket": "explicit-bucket",
                    "Key": "permanent",
                    "Body": b"png",
                    "ContentType": "image/png",
                },
            )
            self.storage.write("permanent", b"png", content_type="image/png")
            stub.assert_no_pending_responses()

    def test_read_closes_oversized_or_incomplete_stream_and_sanitizes_errors(
        self,
    ) -> None:
        with Stubber(self.storage._internal) as stub:
            for advertised_size, data in ((4, b"four"), (3, b"four")):
                body = StreamingBody(BytesIO(data), len(data))
                stub.add_response(
                    "get_object", {"ContentLength": advertised_size, "Body": body}
                )
                with self.assertRaises(StorageObjectTooLarge):
                    self.storage.read("temporary", max_bytes=3)
                self.assertTrue(body._raw_stream.closed)
            body = StreamingBody(BytesIO(b"x"), 3)
            stub.add_response("get_object", {"ContentLength": 3, "Body": body})
            with self.assertRaises(StorageUnavailable):
                self.storage.read("temporary", max_bytes=3)
            self.assertTrue(body._raw_stream.closed)
            stub.add_client_error(
                "get_object", service_error_code="NoSuchKey", http_status_code=404
            )
            self.assertIsNone(self.storage.read("missing", max_bytes=3))
            stub.add_client_error(
                "get_object",
                service_error_code="AccessDenied",
                service_message="secret",
                http_status_code=403,
            )
            with self.assertRaisesRegex(
                StorageUnavailable, "^Storage object read failed$"
            ):
                self.storage.read("denied", max_bytes=3)
            stub.add_client_error(
                "put_object",
                service_error_code="AccessDenied",
                service_message="secret",
                http_status_code=403,
            )
            with self.assertRaisesRegex(
                StorageUnavailable, "^Storage object write failed$"
            ):
                self.storage.write("denied", b"png", content_type="image/png")

    def test_configuration_rejects_partial_or_invalid_addresses(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            self.assertIsNone(Settings(_env_file=None).storage_config)
            with self.assertRaises(ValidationError):
                Settings(
                    _env_file=None, storage_bucket_recipe_images="only-one-setting"
                )
        for origin in (
            "https://example.invalid/storage",
            "https://user:secret@example.invalid",
            "https://example.invalid?q=secret",
            "https://example.invalid#fragment",
            "https://example.invalid:invalid",
            "ftp://example.invalid",
        ):
            with self.subTest(origin=origin), self.assertRaises(ValidationError):
                StorageConfig.model_validate(
                    configuration().model_dump() | {"public_origin": origin}
                )

    def test_image_kinds_resolve_to_distinct_configured_buckets(self) -> None:
        config = configuration()
        self.assertEqual(image_bucket(config, ImageKind.RECIPE), "explicit-bucket")
        self.assertEqual(image_bucket(config, ImageKind.FOODSTUFF), "foodstuff-bucket")
        with self.assertRaises(ValidationError):
            StorageConfig.model_validate(
                config.model_dump() | {"bucket_foodstuff_images": "explicit-bucket"}
            )

    def test_enabled_storage_requires_every_setting(self) -> None:
        values = {
            "storage_" + name: value
            for name, value in configuration().model_dump().items()
        }
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(
                Settings(_env_file=None, **values).storage_config, configuration()
            )
            for name in values:
                with (
                    self.subTest(missing=name),
                    self.assertRaises(ValidationError) as failure,
                ):
                    Settings(
                        _env_file=None,
                        **{key: value for key, value in values.items() if key != name},
                    )
                self.assertNotIn("test-secret", str(failure.exception))


if __name__ == "__main__":
    unittest.main()
