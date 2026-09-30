import importlib.util
import json
import sys
import unittest
from copy import deepcopy
from decimal import Decimal
from pathlib import Path

import kochwiki_contract
from kochwiki_contract import RecipePresentationOut, RecipePresentationResolve, Unit
from pydantic import ValidationError


def presentation() -> dict[str, object]:
    return {
        "servings": 2,
        "preptime": None,
        "kcal": 12.5,
        "carbs": None,
        "protein": 0,
        "fat": None,
        "ingredients": [{
            "index": 1,
            "amount": 12.5,
            "foodstuff": {
                "id": 7, "name": "Oats", "brand": None, "unit": "G",
                "unitVerbose": "g", "kcal": 100, "carbs": None,
                "protein": 0, "fat": None,
            },
        }],
        "steps": [{"index": 1, "description": "Mix"}],
    }


def request() -> dict[str, object]:
    return {
        "servings": 2, "preptime": None,
        "ingredients": [{"index": 1, "amount": 12.5, "foodstuffId": 7}],
        "steps": [{"index": 1, "description": "Mix"}],
    }


class ContractTests(unittest.TestCase):
    @unittest.skipUnless(sys.flags.isolated, "Run the wheel isolation check with python -I")
    def test_package_is_independent_and_typed(self) -> None:
        for module in ("app", "fastapi", "sqlalchemy"):
            with self.subTest(module=module):
                self.assertIsNone(importlib.util.find_spec(module))
        assert kochwiki_contract.__file__ is not None
        self.assertTrue(Path(kochwiki_contract.__file__).with_name("py.typed").is_file())

    def test_response_round_trip(self) -> None:
        body = presentation()
        parsed = RecipePresentationOut.model_validate_json(json.dumps(body))
        self.assertEqual(parsed.ingredients[0].amount, Decimal("12.5"))
        self.assertIs(parsed.ingredients[0].foodstuff.unit, Unit.G)
        self.assertEqual(json.loads(parsed.model_dump_json()), body)
        empty = {**body, "ingredients": [], "steps": []}
        self.assertEqual(json.loads(RecipePresentationOut.model_validate(empty).model_dump_json()), empty)

    def test_required_nullable_fields(self) -> None:
        for field in ("preptime", "kcal", "carbs", "protein", "fat"):
            with self.subTest(field=field):
                body = presentation()
                del body[field]
                with self.assertRaises(ValidationError):
                    RecipePresentationOut.model_validate(body)
        for field in ("brand", "kcal", "carbs", "protein", "fat"):
            with self.subTest(foodstuff_field=field):
                parsed = RecipePresentationOut.model_validate(presentation())
                body = parsed.model_dump(mode="json")
                del body["ingredients"][0]["foodstuff"][field]
                with self.assertRaises(ValidationError):
                    RecipePresentationOut.model_validate(body)

    def test_response_objects_are_closed(self) -> None:
        for path in ((), ("ingredients", 0), ("ingredients", 0, "foodstuff"), ("steps", 0)):
            with self.subTest(path=path):
                body = presentation()
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
                with self.assertRaises(ValidationError):
                    RecipePresentationOut.model_validate(body)

    def test_request_validation_and_existing_decimal_coercion(self) -> None:
        for amount in (12, 12.5, "12.5", Decimal("12.5")):
            with self.subTest(amount=amount):
                body = request()
                body["ingredients"] = [{"index": 1, "amount": amount, "foodstuffId": 7}]
                parsed = RecipePresentationResolve.model_validate(body)
                self.assertEqual(parsed.ingredients[0].amount, Decimal(str(amount)))
        for amount in (0, -1, 10000, "not-a-number"):
            with self.subTest(invalid_amount=amount):
                body = request()
                body["ingredients"] = [{"index": 1, "amount": amount, "foodstuffId": 7}]
                with self.assertRaises(ValidationError):
                    RecipePresentationResolve.model_validate(body)
        for ingredients in (
            [{"index": 1, "amount": 1, "foodstuffId": 7}, {"index": 1, "amount": 2, "foodstuffId": 8}],
            [{"index": 1, "amount": 1, "foodstuffId": 7}, {"index": 2, "amount": 2, "foodstuffId": 7}],
        ):
            with self.subTest(ingredients=ingredients):
                with self.assertRaises(ValidationError):
                    RecipePresentationResolve.model_validate({**request(), "ingredients": ingredients})
        with self.assertRaises(ValidationError):
            RecipePresentationResolve.model_validate({**request(), "steps": [
                {"index": 1, "description": "Mix"}, {"index": 1, "description": "Bake"},
            ]})
        body = deepcopy(request())
        body["unexpected"] = True
        with self.assertRaises(ValidationError):
            RecipePresentationResolve.model_validate(body)

    def test_request_required_nullable_field_and_closed_nested_objects(self) -> None:
        body = request()
        del body["preptime"]
        with self.assertRaises(ValidationError):
            RecipePresentationResolve.model_validate(body)
        for collection in ("ingredients", "steps"):
            with self.subTest(collection=collection):
                body = request()
                items = body[collection]
                assert isinstance(items, list)
                item = items[0]
                assert isinstance(item, dict)
                item["unexpected"] = True
                with self.assertRaises(ValidationError):
                    RecipePresentationResolve.model_validate(body)


if __name__ == "__main__":
    unittest.main()
