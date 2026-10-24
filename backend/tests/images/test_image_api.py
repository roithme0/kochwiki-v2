import secrets
from collections.abc import Callable, Iterator
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.foodstuffs.routes.images import get_foodstuff_image_storage, get_foodstuff_image_transfers
from app.recipes.routes.images import get_recipe_image_storage, get_recipe_image_transfers
from app.core.config import get_settings
from app.identity.config import SESSION_COOKIE, SESSION_LIFETIME
from app.identity.models.application_session import ApplicationSession
from app.identity.schemas.user import UserOut
from app.identity.services.sessions import invalidate_session, secret_hash
from app.infrastructure.database.session import SessionLocal
from app.images.config import MAX_IMAGE_BYTES
from app.images.models import ImageAsset, ImageKind
from app.images.transfers import ImagePersistenceFailed, ImageTransfers
from app.infrastructure.storage.storage import PresignedTransfer, Storage, StorageUnavailable
from tests.images.test_image_transfers import png


@pytest.fixture(params=list(ImageKind))
def kind(request: pytest.FixtureRequest) -> ImageKind:
    assert isinstance(request.param, ImageKind)
    return request.param


@pytest.fixture
def storage(client: TestClient, kind: ImageKind) -> Iterator[Mock]:
    adapter = Mock(spec=Storage)
    adapter.presign_upload.return_value = PresignedTransfer(
        url="http://localhost/storage/private/key?signature=secret", method="PUT", expires_in=300,
    )
    adapter.presign_download.return_value = PresignedTransfer(
        url="http://localhost/storage/private/key?signature=download", method="GET", expires_in=300,
    )

    def storage_dependency() -> Storage:
        return adapter

    def dependency() -> ImageTransfers:
        return ImageTransfers(adapter, SessionLocal, kind=kind)

    upload_dependency = get_recipe_image_transfers if kind == ImageKind.RECIPE else get_foodstuff_image_transfers
    client.app.dependency_overrides[upload_dependency] = dependency
    adapter_dependency = get_recipe_image_storage if kind == ImageKind.RECIPE else get_foodstuff_image_storage
    client.app.dependency_overrides[adapter_dependency] = storage_dependency
    try:
        yield adapter
    finally:
        client.app.dependency_overrides.pop(upload_dependency)
        client.app.dependency_overrides.pop(adapter_dependency)


@pytest.mark.usefixtures("recipe_session")
def test_start_and_complete_persist_only_validated_metadata(client: TestClient, kind: ImageKind, storage: Mock) -> None:
    started = client.post(f"/{kind.value}-image-uploads")
    assert started.status_code == 200
    body = started.json()
    assert body["method"] == "PUT"
    assert body["headers"] == {"Content-Type": "image/png"}
    assert body["expiresIn"] == 300
    storage.read.return_value = png()
    completed = client.post(f"/{kind.value}-image-uploads/{body['uploadId']}/complete")
    assert completed.status_code == 200
    image = completed.json()
    assert set(image) == {"id", "contentType", "size", "width", "height", "createdAt"}
    with SessionLocal() as session:
        saved = session.get(ImageAsset, UUID(image["id"]))
        assert saved is not None
        assert saved.kind == kind
        assert saved.size == image["size"] == len(png())
    storage.read.assert_called_once()
    recipe = client.post("/recipes", json={"name": "Uploaded image", "servings": 2, "imageId": image["id"]})
    if kind == ImageKind.RECIPE:
        assert recipe.status_code == 201
        assert recipe.json()["imageId"] == image["id"]
        assert client.get(f"/recipes/{recipe.json()['recipeLineageId']}").json()["imageId"] == image["id"]
    else:
        assert recipe.status_code == 404
    storage.read.assert_called_once()


@pytest.mark.parametrize("data,status,detail", [
    (None, 404, "Upload has not been received"),
    (b"not a png", 400, "Image must be a valid PNG"),
])
@pytest.mark.usefixtures("recipe_session")
def test_rejected_completion(client: TestClient, kind: ImageKind, storage: Mock, data: bytes | None, status: int, detail: str) -> None:
    storage.read.return_value = data
    response = client.post(f"/{kind.value}-image-uploads/{uuid4()}/complete")
    assert response.status_code == status
    assert response.json() == {"detail": detail}
    storage.write.assert_not_called()


@pytest.mark.usefixtures("recipe_session")
def test_storage_errors_are_sanitized(client: TestClient, kind: ImageKind, storage: Mock) -> None:
    storage.presign_upload.side_effect = StorageUnavailable("credentials and signed URL")
    assert client.post(f"/{kind.value}-image-uploads").json() == {"detail": "Image storage is unavailable"}
    storage.read.side_effect = StorageUnavailable("credentials and signed URL")
    response = client.post(f"/{kind.value}-image-uploads/{uuid4()}/complete")
    assert response.status_code == 503
    assert response.json() == {"detail": "Image upload could not be completed"}


@pytest.mark.usefixtures("recipe_session")
def test_persistence_errors_are_sanitized(client: TestClient, kind: ImageKind) -> None:
    uploads = Mock(spec=ImageTransfers)
    uploads.complete.side_effect = ImagePersistenceFailed(cleanup_pending=True)

    def dependency() -> ImageTransfers:
        return uploads

    upload_dependency = get_recipe_image_transfers if kind == ImageKind.RECIPE else get_foodstuff_image_transfers
    client.app.dependency_overrides[upload_dependency] = dependency
    try:
        response = client.post(f"/{kind.value}-image-uploads/{uuid4()}/complete")
        assert response.status_code == 503
        assert response.json() == {"detail": "Image upload could not be completed"}
    finally:
        client.app.dependency_overrides.pop(upload_dependency)


@pytest.mark.usefixtures("recipe_session")
def test_storage_not_configured(client: TestClient, kind: ImageKind, monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "storage_endpoint_url", "storage_public_origin", "storage_region",
        "storage_bucket_recipe_images", "storage_bucket_foodstuff_images", "storage_access_key_id", "storage_secret_access_key",
    ):
        monkeypatch.setattr(get_settings(), name, None)
    response = client.post(f"/{kind.value}-image-uploads")
    assert response.status_code == 503
    response = client.get(f"/{kind.value}-images/{uuid4()}/download")
    assert response.status_code == 503
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.usefixtures("recipe_session")
def test_malformed_upload_id(client: TestClient, kind: ImageKind, storage: Mock) -> None:
    assert client.post(f"/{kind.value}-image-uploads/invalid/complete").status_code == 422
    storage.read.assert_not_called()


@pytest.mark.usefixtures("recipe_session")
def test_download_uses_persisted_key_without_reading_object(client: TestClient, kind: ImageKind, storage: Mock) -> None:
    storage.read.return_value = png()
    completed = client.post(f"/{kind.value}-image-uploads/{uuid4()}/complete")
    image_id = UUID(completed.json()["id"])
    with SessionLocal() as session:
        image = session.get(ImageAsset, image_id)
        assert image is not None
        key = image.object_key
    storage.reset_mock()
    for _ in range(2):
        response = client.get(f"/{kind.value}-images/{image_id}/download")
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert response.json() == {
            "url": "http://localhost/storage/private/key?signature=download", "expiresIn": 300,
        }
    assert storage.presign_download.call_count == 2
    storage.presign_download.assert_called_with(key)
    storage.read.assert_not_called()
    storage.inspect.assert_not_called()


@pytest.mark.usefixtures("recipe_session")
def test_download_missing_image_and_invalid_id(client: TestClient, kind: ImageKind, storage: Mock) -> None:
    response = client.get(f"/{kind.value}-images/{uuid4()}/download")
    assert response.status_code == 404
    assert response.json() == {"detail": f"{kind.value.capitalize()} image not found"}
    assert response.headers["cache-control"] == "no-store"
    assert client.get(f"/{kind.value}-images/invalid/download").status_code == 422
    storage.presign_download.assert_not_called()


@pytest.mark.usefixtures("recipe_session")
def test_download_rejects_other_kind(client: TestClient, kind: ImageKind, storage: Mock) -> None:
    storage.read.return_value = png()
    completed = client.post(f"/{kind.value}-image-uploads/{uuid4()}/complete")
    image_id = UUID(completed.json()["id"])
    with SessionLocal.begin() as session:
        image = session.get(ImageAsset, image_id)
        assert image is not None
        image.kind = ImageKind.FOODSTUFF if kind == ImageKind.RECIPE else ImageKind.RECIPE
    response = client.get(f"/{kind.value}-images/{image_id}/download")
    assert response.status_code == 404
    assert response.json() == {"detail": f"{kind.value.capitalize()} image not found"}
    assert response.headers["cache-control"] == "no-store"
    storage.presign_download.assert_not_called()


@pytest.mark.usefixtures("recipe_session")
def test_download_signing_failure_is_sanitized(client: TestClient, kind: ImageKind, storage: Mock) -> None:
    storage.read.return_value = png()
    completed = client.post(f"/{kind.value}-image-uploads/{uuid4()}/complete")
    storage.presign_download.side_effect = StorageUnavailable("credentials and signed URL")
    response = client.get(f"/{kind.value}-images/{completed.json()['id']}/download")
    assert response.status_code == 503
    assert response.json() == {"detail": "Image storage is unavailable"}
    assert response.headers["cache-control"] == "no-store"


FOODSTUFF_IMAGE_OPERATIONS: list[tuple[str, str]] = [
    ("POST", "/foodstuff-image-uploads"),
    ("POST", "/foodstuff-image-uploads/{id}/complete"),
    ("GET", "/foodstuff-images/{id}/download"),
]
AUTHENTICATED_IMAGE_OPERATIONS: list[tuple[ImageKind, str, str]] = [
    (ImageKind.FOODSTUFF, method, path) for method, path in FOODSTUFF_IMAGE_OPERATIONS
] + [(ImageKind.RECIPE, "GET", "/recipe-images/{id}/download")]


@pytest.mark.parametrize(("kind", "method", "path"), AUTHENTICATED_IMAGE_OPERATIONS)
@pytest.mark.parametrize("credential", ["missing", "malformed", "unknown", "expired", "revoked", "stored-hash"])
def test_image_operations_reject_invalid_sessions_before_storage_access(
    client: TestClient, storage: Mock, sign_in: Callable[[TestClient], UserOut],
    method: str, path: str, credential: str,
) -> None:
    user = sign_in(client)
    secret = client.cookies.get(SESSION_COOKIE, path="/")
    assert secret is not None
    if credential == "expired":
        with SessionLocal.begin() as session:
            session.execute(update(ApplicationSession).values(
                last_activity_at=func.statement_timestamp() - SESSION_LIFETIME,
            ))
    elif credential == "revoked":
        with SessionLocal.begin() as session:
            assert invalidate_session(session, secret)
    supplied = {
        "missing": None, "malformed": "invalid", "unknown": secrets.token_urlsafe(32),
        "expired": secret, "revoked": secret, "stored-hash": secret_hash(secret),
    }[credential]
    client.cookies.clear()
    if supplied is not None:
        client.cookies.set(SESSION_COOKIE, supplied)
    storage.read.return_value = png()
    response = client.request(method, path.format(id=uuid4()), headers={"X-Application-User": f"kochwiki:{user.id}"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}
    assert response.headers["cache-control"] == "no-store"
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert storage.mock_calls == []
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(ImageAsset)) == 0


@pytest.mark.parametrize(("kind", "method", "path"), AUTHENTICATED_IMAGE_OPERATIONS)
def test_image_operations_are_shared_and_renew_sessions(
    client: TestClient, storage: Mock, sign_in: Callable[[TestClient], UserOut],
    kind: ImageKind, method: str, path: str,
) -> None:
    creator = sign_in(client)
    started = client.post(f"/{kind.value}-image-uploads")
    assert started.status_code == 200
    resource_id = UUID(started.json()["uploadId"])
    storage.read.return_value = png()
    if method == "GET":
        completed = client.post(f"/{kind.value}-image-uploads/{resource_id}/complete")
        assert completed.status_code == 200
        resource_id = UUID(completed.json()["id"])
        if kind == ImageKind.RECIPE:
            recipe = client.post("/recipes", json={"name": "Shared image", "servings": 1, "imageId": str(resource_id)})
            assert recipe.status_code == 201
            assert recipe.json()["ownerId"] == creator.id
    caller = sign_in(client)
    assert caller.id != creator.id
    secret = client.cookies.get(SESSION_COOKIE, path="/")
    with SessionLocal.begin() as session:
        previous_activity = session.scalar(update(ApplicationSession).where(
            ApplicationSession.secret_hash == secret_hash(secret),
        ).values(last_activity_at=func.statement_timestamp() - SESSION_LIFETIME / 2)
            .returning(ApplicationSession.last_activity_at))
    assert previous_activity is not None
    storage.reset_mock()
    response = client.request(method, path.format(id=resource_id))
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "Max-Age=0" not in response.headers["set-cookie"]
    with SessionLocal() as session:
        renewed_activity = session.scalar(select(ApplicationSession.last_activity_at).where(
            ApplicationSession.secret_hash == secret_hash(secret),
        ))
        if path.endswith("/complete"):
            saved = session.get(ImageAsset, UUID(response.json()["id"]))
            assert saved is not None and saved.kind == ImageKind.FOODSTUFF
            assert saved.size == len(png())
            storage.read.assert_called_once_with(f"foodstuff-image-uploads/{resource_id}", max_bytes=MAX_IMAGE_BYTES)
        elif method == "GET":
            saved = session.get(ImageAsset, resource_id)
            assert saved is not None
            storage.presign_download.assert_called_once_with(saved.object_key)
            storage.read.assert_not_called()
            assert response.json() == {
                "url": "http://localhost/storage/private/key?signature=download", "expiresIn": 300,
            }
        else:
            storage.presign_upload.assert_called_once_with(f"foodstuff-image-uploads/{response.json()['uploadId']}")
            assert session.scalar(select(func.count()).select_from(ImageAsset)) == 0
    assert renewed_activity is not None and renewed_activity > previous_activity


@pytest.mark.parametrize(("method", "path"), [(method, path) for _, method, path in AUTHENTICATED_IMAGE_OPERATIONS])
def test_image_operations_require_configured_login(
    client: TestClient, method: str, path: str,
) -> None:
    response = client.request(method, path.format(id=uuid4()))
    assert response.status_code == 503
    assert response.json() == {"detail": "Login is not configured."}


@pytest.mark.parametrize(("method", "path"), [(method, path) for _, method, path in AUTHENTICATED_IMAGE_OPERATIONS])
def test_image_operation_contract_declares_authentication(
    client: TestClient, method: str, path: str,
) -> None:
    path = path.replace("{id}", "{image_id}" if method == "GET" else "{upload_id}")
    operation = client.get("/api/openapi.json").json()["paths"][path][method.lower()]
    assert operation["security"] == [{"APIKeyCookie": []}]
    for code in ("401", "503"):
        assert operation["responses"][code]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ErrorResponse",
        }
    assert operation["responses"]["503"]["description"] == "Login not configured or image transfer unavailable"
