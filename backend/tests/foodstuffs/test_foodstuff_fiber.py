from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.identity.schemas.user import UserOut


def test_fiber_creation_updates_and_owner_permissions(
    authenticated_client: TestClient, sign_in: Callable[[TestClient], UserOut]
) -> None:
    client = authenticated_client
    created = client.post(
        "/foodstuffs", json={"name": "Oats", "unit": "G", "fiber": 10.125, "kcal": 370}
    )
    assert created.status_code == 201
    food = created.json()
    path = f"/foodstuffs/{food['id']}"
    assert food["fiber"] == 10.125
    assert client.get(path).json()["fiber"] == 10.125
    assert client.get("/foodstuffs").json()[0]["fiber"] == 10.125
    for changes, expected in (
        ({"name": "Rolled oats"}, 10.125),
        ({"fiber": 0}, 0),
        ({"brand": "Mill"}, 0),
        ({"fiber": None}, None),
    ):
        response = client.patch(path, json=changes)
        assert response.status_code == 200
        assert response.json()["fiber"] == expected
        assert response.json()["kcal"] == 370
    sign_in(client)
    assert client.patch(path, json={"fiber": 8}).status_code == 403
    assert client.get(path).json()["fiber"] is None


@pytest.mark.parametrize("value", [-1, "NaN", "Infinity"])
def test_invalid_fiber_cannot_be_created_or_updated(
    authenticated_client: TestClient, value: object
) -> None:
    client = authenticated_client
    food = client.post("/foodstuffs", json={"name": "Apple", "unit": "G"}).json()
    assert food["fiber"] is None
    assert (
        client.post(
            "/foodstuffs", json={"name": "Invalid", "unit": "G", "fiber": value}
        ).status_code
        == 422
    )
    assert (
        client.patch(f"/foodstuffs/{food['id']}", json={"fiber": value}).status_code
        == 422
    )
