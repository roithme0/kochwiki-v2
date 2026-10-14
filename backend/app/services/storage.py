from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal
from urllib.parse import urlsplit, urlunsplit

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.storage import StorageConfig

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client


class StorageUnavailable(Exception):
    pass


@dataclass(frozen=True)
class PresignedTransfer:
    url: str = field(repr=False)
    method: Literal["PUT", "GET"]
    expires_in: int


@dataclass(frozen=True)
class StoredObject:
    size: int
    content_type: str | None
    etag: str


class Storage:
    def __init__(self, config: StorageConfig) -> None:
        self._bucket = config.bucket_recipe_images
        sdk_config = Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            connect_timeout=5,
            read_timeout=15,
            retries={"total_max_attempts": 1},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        )
        session = boto3.session.Session(
            aws_access_key_id=config.access_key_id.get_secret_value(),
            aws_secret_access_key=config.secret_access_key.get_secret_value(),
            region_name=config.region,
        )
        self._internal: S3Client = session.client(
            "s3",
            endpoint_url=config.endpoint_url,
            config=sdk_config,
        )
        self._signer: S3Client = session.client(
            "s3",
            endpoint_url=config.public_origin,
            config=sdk_config,
        )

    def close(self) -> None:
        self._internal.close()
        self._signer.close()

    def presign_upload(self, key: str, *, expires_in: int = 300) -> PresignedTransfer:
        return self._presign(key, "PUT", expires_in)

    def presign_download(self, key: str, *, expires_in: int = 300) -> PresignedTransfer:
        return self._presign(key, "GET", expires_in)

    def _presign(
        self,
        key: str,
        method: Literal["PUT", "GET"],
        expires_in: int,
    ) -> PresignedTransfer:
        self._validate_key(key)
        if (
            isinstance(expires_in, bool)
            or not isinstance(expires_in, int)
            or not 1 <= expires_in <= 3600
        ):
            raise ValueError(
                "Storage URL expiry must be an integer between 1 and 3600 seconds"
            )
        try:
            signed = self._signer.generate_presigned_url(
                "put_object" if method == "PUT" else "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=expires_in,
                HttpMethod=method,
            )
        except (BotoCoreError, ClientError):
            raise StorageUnavailable("Storage URL signing failed") from None
        parsed = urlsplit(signed)
        url = urlunsplit(
            (parsed.scheme, parsed.netloc, "/storage" + parsed.path, parsed.query, "")
        )
        return PresignedTransfer(url=url, method=method, expires_in=expires_in)

    def inspect(self, key: str) -> StoredObject | None:
        self._validate_key(key)
        try:
            response = self._internal.head_object(Bucket=self._bucket, Key=key)
        except ClientError as error:
            if error.response["ResponseMetadata"]["HTTPStatusCode"] == 404:
                return None
            raise StorageUnavailable("Storage object inspection failed") from None
        except BotoCoreError:
            raise StorageUnavailable("Storage object inspection failed") from None
        return StoredObject(
            size=response["ContentLength"],
            content_type=response.get("ContentType"),
            etag=response["ETag"],
        )

    def delete(self, key: str) -> None:
        self._validate_key(key)
        try:
            self._internal.delete_object(Bucket=self._bucket, Key=key)
        except (BotoCoreError, ClientError):
            raise StorageUnavailable("Storage object deletion failed") from None

    @staticmethod
    def _validate_key(key: str) -> None:
        if (
            not key
            or len(key.encode("utf-8")) > 1024
            or any(ord(character) < 32 or ord(character) == 127 for character in key)
            or any(part in {"", ".", ".."} for part in key.split("/"))
            or "\\" in key
        ):
            raise ValueError("Invalid storage object key")
