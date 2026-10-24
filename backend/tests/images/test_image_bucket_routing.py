from contextlib import ExitStack
from io import BytesIO
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import pytest
from botocore.response import StreamingBody
from botocore.stub import Stubber
from fastapi.testclient import TestClient

from app.images.models import ImageAsset, ImageKind
from app.images.storage import image_bucket
from app.infrastructure.database.session import SessionLocal
from app.infrastructure.storage.config import StorageConfig
from app.infrastructure.storage.storage import Storage
from tests.images.test_image_transfers import png
from tests.infrastructure.storage.test_storage_adapter import configuration


@pytest.mark.parametrize("kind", list(ImageKind))
@pytest.mark.usefixtures("recipe_session")
def test_routes_isolate_uploads_and_downloads_by_configured_bucket(
    client: TestClient, kind: ImageKind,
) -> None:
    config = configuration()
    other = ImageKind.FOODSTUFF if kind == ImageKind.RECIPE else ImageKind.RECIPE
    source_bucket = image_bucket(config, kind)
    other_bucket = image_bucket(config, other)
    upload_id, image_id = uuid4(), uuid4()
    temporary_key = f"{kind.value}-image-uploads/{upload_id}"
    permanent_key = f"{kind.value}-images/{image_id}.png"
    data = png()
    adapters = {
        bucket: Storage(config, bucket=bucket)
        for bucket in (source_bucket, other_bucket)
    }

    def storage_for_bucket(configured: StorageConfig, *, bucket: str) -> Storage:
        assert configured is config
        return adapters[bucket]

    try:
        with ExitStack() as stack:
            for adapter in adapters.values():
                stack.enter_context(patch.object(adapter, "close"))
            source = stack.enter_context(Stubber(adapters[source_bucket]._internal))
            target = stack.enter_context(Stubber(adapters[other_bucket]._internal))
            target.add_client_error(
                "get_object", service_error_code="NoSuchKey", http_status_code=404,
                expected_params={
                    "Bucket": other_bucket,
                    "Key": f"{other.value}-image-uploads/{upload_id}",
                },
            )
            source.add_response(
                "get_object",
                {"ContentLength": len(data), "Body": StreamingBody(BytesIO(data), len(data))},
                {"Bucket": source_bucket, "Key": temporary_key},
            )
            source.add_response("put_object", {}, {
                "Bucket": source_bucket, "Key": permanent_key,
                "Body": data, "ContentType": "image/png",
            })
            source.add_response(
                "delete_object", {}, {"Bucket": source_bucket, "Key": temporary_key},
            )
            source.add_client_error(
                "get_object", service_error_code="NoSuchKey", http_status_code=404,
                expected_params={"Bucket": source_bucket, "Key": temporary_key},
            )
            settings = stack.enter_context(patch("app.images.dependencies.get_settings"))
            settings.return_value.storage_config = config
            stack.enter_context(patch("app.images.dependencies.Storage", side_effect=storage_for_bucket))
            stack.enter_context(patch("app.images.transfers.uuid4", side_effect=[upload_id, image_id]))

            started = client.post(f"/{kind.value}-image-uploads")
            assert started.status_code == 200
            assert started.json()["uploadId"] == str(upload_id)
            assert urlsplit(started.json()["url"]).path == f"/storage/{source_bucket}/{temporary_key}"

            wrong = client.post(f"/{other.value}-image-uploads/{upload_id}/complete")
            assert wrong.status_code == 404
            assert wrong.json() == {"detail": "Upload has not been received"}

            completed = client.post(f"/{kind.value}-image-uploads/{upload_id}/complete")
            assert completed.status_code == 200
            assert UUID(completed.json()["id"]) == image_id
            with SessionLocal() as session:
                image = session.get(ImageAsset, image_id)
                assert image is not None
                assert (image.kind, image.object_key) == (kind, permanent_key)

            wrong_download = client.get(f"/{other.value}-images/{image_id}/download")
            assert wrong_download.status_code == 404
            assert wrong_download.headers["cache-control"] == "no-store"
            download = client.get(f"/{kind.value}-images/{image_id}/download")
            assert download.status_code == 200
            assert download.headers["cache-control"] == "no-store"
            assert urlsplit(download.json()["url"]).path == f"/storage/{source_bucket}/{permanent_key}"
            assert download.json()["expiresIn"] == 300
            assert client.post(f"/{kind.value}-image-uploads/{upload_id}/complete").status_code == 404
            source.assert_no_pending_responses()
            target.assert_no_pending_responses()
    finally:
        for adapter in adapters.values():
            adapter.close()
