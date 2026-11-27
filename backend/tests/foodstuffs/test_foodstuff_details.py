from collections.abc import Callable
from http import HTTPStatus

import pytest
from fastapi.testclient import TestClient

from app.identity.schemas.user import UserOut


def test_details_roundtrip_normalization_and_permissions(
    authenticated_client: TestClient, sign_in: Callable[[TestClient], UserOut]
) -> None:
    client = authenticated_client
    response = client.post(
        "/foodstuffs",
        json={
            "name": "Kartoffeln",
            "details": "  geschält, roh  ",
            "unit": "G",
            "kcal": 77,
        },
    )
    assert response.status_code == HTTPStatus.CREATED
    food = response.json()
    path = f"/foodstuffs/{food['id']}"
    assert food["details"] == "geschält, roh"
    assert client.get(path).json()["details"] == "geschält, roh"
    assert client.get("/foodstuffs").json()[0]["details"] == "geschält, roh"
    assert (
        client.patch(path, json={"brand": "Farm"}).json()["details"] == "geschält, roh"
    )
    for value in (None, "", " \t "):
        assert client.patch(path, json={"details": value}).json()["details"] is None
        assert client.patch(path, json={"details": "roh"}).json()["details"] == "roh"
    sign_in(client)
    assert (
        client.patch(path, json={"details": "gekocht"}).status_code
        == HTTPStatus.FORBIDDEN
    )
    unchanged = client.get(path).json()
    assert unchanged["name"] == "Kartoffeln" and unchanged["details"] == "roh"
    assert unchanged["kcal"] == 77


@pytest.mark.parametrize("value", ["x" * 251, 1, True, ["roh"], {"state": "roh"}])
def test_invalid_details_are_rejected(
    authenticated_client: TestClient, value: object
) -> None:
    client = authenticated_client
    food = client.post("/foodstuffs", json={"name": "Potato", "unit": "G"}).json()
    assert food["details"] is None
    assert (
        client.post(
            "/foodstuffs", json={"name": "Potato", "unit": "G", "details": value}
        ).status_code
        == HTTPStatus.UNPROCESSABLE_CONTENT
    )
    assert (
        client.patch(f"/foodstuffs/{food['id']}", json={"details": value}).status_code
        == HTTPStatus.UNPROCESSABLE_CONTENT
    )


def test_details_do_not_change_owner_name_brand_uniqueness(
    authenticated_client: TestClient, sign_in: Callable[[TestClient], UserOut]
) -> None:
    client = authenticated_client
    payload = {"name": "Kartoffeln", "brand": "Farm", "unit": "G"}
    plain = client.post("/foodstuffs", json=payload)
    assert plain.status_code == HTTPStatus.CREATED
    for details in (None, "roh", "gekocht", " roh "):
        assert (
            client.post("/foodstuffs", json={**payload, "details": details}).status_code
            == HTTPStatus.CONFLICT
        )
    path = f"/foodstuffs/{plain.json()['id']}"
    for details in ("roh", "gekocht", None):
        assert (
            client.patch(path, json={"details": details}).status_code == HTTPStatus.OK
        )
    other = client.post(
        "/foodstuffs",
        json={**payload, "name": "Andere Kartoffeln", "details": "gekocht"},
    )
    assert other.status_code == HTTPStatus.CREATED
    assert (
        client.patch(
            f"/foodstuffs/{other.json()['id']}", json={"name": "Kartoffeln"}
        ).status_code
        == HTTPStatus.CONFLICT
    )
    assert (
        client.post(
            "/foodstuffs", json={**payload, "brand": "Other", "details": "roh"}
        ).status_code
        == HTTPStatus.CREATED
    )
    sign_in(client)
    assert (
        client.post("/foodstuffs", json={**payload, "details": "roh"}).status_code
        == HTTPStatus.CREATED
    )
    packaged = client.post(
        "/foodstuffs", json={"name": "Hirtenkäse 45% Fett i. Tr.", "unit": "G"}
    ).json()
    assert (
        packaged["name"] == "Hirtenkäse 45% Fett i. Tr." and packaged["details"] is None
    )
