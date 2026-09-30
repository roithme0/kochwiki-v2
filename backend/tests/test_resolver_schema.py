import json
from copy import deepcopy
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.recipe import RecipePresentationOut


def presentation() -> dict[str, object]:
    return {
        "servings": 2, "preptime": None,
        "kcal": 12.5, "carbs": None, "protein": 0, "fat": None,
        "ingredients": [{
            "index": 1, "amount": 12.5,
            "foodstuff": {
                "id": 7, "name": "Oats", "brand": None, "unit": "G",
                "unitVerbose": "g", "kcal": 100, "carbs": None,
                "protein": 0, "fat": None,
            },
        }],
        "steps": [{"index": 1, "description": "Mix"}],
    }


@pytest.mark.parametrize("path", [(), ("ingredients", 0), ("ingredients", 0, "foodstuff"), ("steps", 0)])
def test_resolver_response_rejects_undocumented_fields(path: tuple[str | int, ...]) -> None:
    body = deepcopy(presentation())
    target: object = body
    for key in path:
        if isinstance(key, int):
            assert isinstance(target, list)
            target = target[key]
        else:
            assert isinstance(target, dict)
            target = target[key]
    assert isinstance(target, dict)
    target["unexpected"] = True

    with pytest.raises(ValidationError) as error:
        RecipePresentationOut.model_validate_json(json.dumps(body))

    assert [(issue["loc"], issue["type"]) for issue in error.value.errors()] == [
        ((*path, "unexpected"), "extra_forbidden")
    ]


def test_resolver_response_preserves_numbers_nulls_and_empty_collections() -> None:
    body = presentation()
    parsed = RecipePresentationOut.model_validate_json(json.dumps(body))
    assert parsed.ingredients[0].amount == Decimal("12.5")
    assert json.loads(parsed.model_dump_json()) == body

    empty = {**body, "ingredients": [], "steps": []}
    assert json.loads(RecipePresentationOut.model_validate(empty).model_dump_json()) == empty


@pytest.mark.parametrize("field", ["preptime", "kcal", "carbs", "protein", "fat"])
def test_resolver_nullable_fields_remain_required(field: str) -> None:
    body = presentation()
    del body[field]
    with pytest.raises(ValidationError) as error:
        RecipePresentationOut.model_validate_json(json.dumps(body))
    assert error.value.errors()[0]["type"] == "missing"
