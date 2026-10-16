from collections.abc import Iterator
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.recipes.routes.recipe_images import get_recipe_image_storage, get_recipe_image_uploads
from app.core.config import get_settings
from app.infrastructure.database.session import SessionLocal
from app.recipes.models.recipe_image import RecipeImage
from app.recipes.services.recipe_image_uploads import ImagePersistenceFailed, RecipeImageUploads
from app.infrastructure.storage.storage import PresignedTransfer, Storage, StorageUnavailable
from test_recipe_image_uploads import png


@pytest.fixture
def storage(client: TestClient) -> Iterator[Mock]:
    adapter = Mock(spec=Storage)
    adapter.presign_upload.return_value = PresignedTransfer(
        url="http://localhost/storage/private/key?signature=secret", method="PUT", expires_in=300,
    )
    adapter.presign_download.return_value = PresignedTransfer(
        url="http://localhost/storage/private/key?signature=download", method="GET", expires_in=300,
    )

    def storage_dependency() -> Storage:
        return adapter

    def dependency() -> RecipeImageUploads:
        return RecipeImageUploads(adapter, SessionLocal)

    client.app.dependency_overrides[get_recipe_image_uploads] = dependency
    client.app.dependency_overrides[get_recipe_image_storage] = storage_dependency
    try:
        yield adapter
    finally:
        client.app.dependency_overrides.pop(get_recipe_image_uploads)
        client.app.dependency_overrides.pop(get_recipe_image_storage)


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
    recipe = client.post("/recipes", json={"name": "Uploaded image", "servings": 2, "imageId": image["id"]})
    assert recipe.status_code == 201
    assert recipe.json()["imageId"] == image["id"]
    assert client.get(f"/recipes/{recipe.json()['recipeLineageId']}").json()["imageId"] == image["id"]
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
    response = client.get(f"/recipe-images/{uuid4()}/download")
    assert response.status_code == 503
    assert response.headers["cache-control"] == "no-store"


def test_malformed_upload_id(client: TestClient, storage: Mock) -> None:
    assert client.post("/recipe-image-uploads/invalid/complete").status_code == 422
    storage.read.assert_not_called()


def test_download_uses_persisted_key_without_reading_object(client: TestClient, storage: Mock) -> None:
    storage.read.return_value = png()
    completed = client.post(f"/recipe-image-uploads/{uuid4()}/complete")
    image_id = UUID(completed.json()["id"])
    with SessionLocal() as session:
        image = session.get(RecipeImage, image_id)
        assert image is not None
        key = image.object_key
    storage.reset_mock()
    for _ in range(2):
        response = client.get(f"/recipe-images/{image_id}/download")
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert response.json() == {
            "url": "http://localhost/storage/private/key?signature=download", "expiresIn": 300,
        }
    assert storage.presign_download.call_count == 2
    storage.presign_download.assert_called_with(key)
    storage.read.assert_not_called()
    storage.inspect.assert_not_called()


def test_download_missing_image_and_invalid_id(client: TestClient, storage: Mock) -> None:
    response = client.get(f"/recipe-images/{uuid4()}/download")
    assert response.status_code == 404
    assert response.json() == {"detail": "Recipe image not found"}
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/recipe-images/invalid/download").status_code == 422
    storage.presign_download.assert_not_called()


def test_download_signing_failure_is_sanitized(client: TestClient, storage: Mock) -> None:
    storage.read.return_value = png()
    completed = client.post(f"/recipe-image-uploads/{uuid4()}/complete")
    storage.presign_download.side_effect = StorageUnavailable("credentials and signed URL")
    response = client.get(f"/recipe-images/{completed.json()['id']}/download")
    assert response.status_code == 503
    assert response.json() == {"detail": "Image storage is unavailable"}
    assert response.headers["cache-control"] == "no-store"
