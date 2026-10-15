from collections.abc import Iterator
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.routes.recipe_images import get_recipe_image_uploads
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.recipe_image import RecipeImage
from app.services.recipe_image_uploads import ImagePersistenceFailed, RecipeImageUploads
from app.services.storage import PresignedTransfer, Storage, StorageUnavailable
from test_recipe_image_uploads import png


@pytest.fixture
def storage(client: TestClient) -> Iterator[Mock]:
    adapter = Mock(spec=Storage)
    adapter.presign_upload.return_value = PresignedTransfer(
        url="http://localhost/storage/private/key?signature=secret", method="PUT", expires_in=300,
    )

    def dependency() -> RecipeImageUploads:
        return RecipeImageUploads(adapter, SessionLocal)

    client.app.dependency_overrides[get_recipe_image_uploads] = dependency
    try:
        yield adapter
    finally:
        client.app.dependency_overrides.pop(get_recipe_image_uploads)


def test_start_and_complete_persist_only_validated_metadata(client: TestClient, storage: Mock) -> None:
    started = client.post("/recipe-image-uploads")
    assert started.status_code == 200
    body = started.json()
    assert body["method"] == "PUT"
    assert body["headers"] == {"Content-Type": "image/png"}
    assert body["expiresIn"] == 300
    storage.read.return_value = png()
    completed = client.post(f"/recipe-image-uploads/{body['uploadId']}/complete")
    assert completed.status_code == 200
    image = completed.json()
    assert set(image) == {"id", "contentType", "size", "width", "height", "createdAt"}
    with SessionLocal() as session:
        saved = session.get(RecipeImage, UUID(image["id"]))
        assert saved is not None
        assert saved.size == image["size"] == len(png())
    storage.read.assert_called_once()


@pytest.mark.parametrize("data,status,detail", [
    (None, 404, "Upload has not been received"),
    (b"not a png", 400, "Image must be a valid PNG"),
])
def test_rejected_completion(client: TestClient, storage: Mock, data: bytes | None, status: int, detail: str) -> None:
    storage.read.return_value = data
    response = client.post(f"/recipe-image-uploads/{uuid4()}/complete")
    assert response.status_code == status
    assert response.json() == {"detail": detail}
    storage.write.assert_not_called()


def test_storage_errors_are_sanitized(client: TestClient, storage: Mock) -> None:
    storage.presign_upload.side_effect = StorageUnavailable("credentials and signed URL")
    assert client.post("/recipe-image-uploads").json() == {"detail": "Image storage is unavailable"}
    storage.read.side_effect = StorageUnavailable("credentials and signed URL")
    response = client.post(f"/recipe-image-uploads/{uuid4()}/complete")
    assert response.status_code == 503
    assert response.json() == {"detail": "Image upload could not be completed"}


def test_persistence_errors_are_sanitized(client: TestClient) -> None:
    uploads = Mock(spec=RecipeImageUploads)
    uploads.complete.side_effect = ImagePersistenceFailed(cleanup_pending=True)

    def dependency() -> RecipeImageUploads:
        return uploads

    client.app.dependency_overrides[get_recipe_image_uploads] = dependency
    try:
        response = client.post(f"/recipe-image-uploads/{uuid4()}/complete")
        assert response.status_code == 503
        assert response.json() == {"detail": "Image upload could not be completed"}
    finally:
        client.app.dependency_overrides.pop(get_recipe_image_uploads)


def test_storage_not_configured(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "storage_endpoint_url", "storage_public_origin", "storage_region",
        "storage_bucket_recipe_images", "storage_access_key_id", "storage_secret_access_key",
    ):
        monkeypatch.setattr(get_settings(), name, None)
    response = client.post("/recipe-image-uploads")
    assert response.status_code == 503


def test_malformed_upload_id(client: TestClient, storage: Mock) -> None:
    assert client.post("/recipe-image-uploads/invalid/complete").status_code == 422
    storage.read.assert_not_called()
