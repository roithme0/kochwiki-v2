import importlib.util
import json
import sys
import unittest
from copy import deepcopy
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import kochwiki_contract
from kochwiki_contract import FoodstuffSummaryOut, RecipePresentationOut, RecipePresentationResolve, Unit
from pydantic import ValidationError
from pydantic_core import PydanticSerializationError


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
    def test_response_invariants_in_python_and_json(self) -> None:
        cases: list[tuple[tuple[str | int, ...], tuple[object, ...]]] = [
            (("servings",), (0, -1)),
            (("preptime",), (0, -1)),
            (("ingredients", 0, "index"), (0, -1)),
            (("ingredients", 0, "amount"), (0, -1)),
            (("ingredients", 0, "foodstuff", "id"), (0, -1)),
            (("steps", 0, "index"), (0, -1)),
            (("steps", 0, "description"), ("", "x" * 201)),
        ]
        for field in ("kcal", "carbs", "protein", "fat"):
            cases.extend([
                ((field,), (-1,)),
                (("ingredients", 0, "foodstuff", field), (-1,)),
            ])
        for path, values in cases:
            for value in values:
                body = presentation()
                target: object = body
                for key in path[:-1]:
                    if isinstance(key, int):
                        assert isinstance(target, list)
                    else:
                        assert isinstance(target, dict)
                    target = target[key]
                assert isinstance(target, dict)
                target[path[-1]] = value
                with self.subTest(path=path, value=value):
                    with self.assertRaises(ValidationError):
                        RecipePresentationOut.model_validate(body)
                    with self.assertRaises(ValidationError):
                        RecipePresentationOut.model_validate_json(json.dumps(body))

    def test_responses_do_not_inherit_request_upper_limits(self) -> None:
        parsed = RecipePresentationOut.model_validate(presentation())
        body = parsed.model_dump()
        body.update(servings=100, preptime=1000, kcal=Decimal("1000000"))
        body["ingredients"][0].update(index=100, amount=Decimal("10000"))
        body["steps"][0].update(index=100, description="x" * 200)
        result = RecipePresentationOut.model_validate(body)
        self.assertEqual(result.servings, 100)
        self.assertEqual(result.ingredients[0].amount, Decimal("10000"))
        self.assertEqual(RecipePresentationOut.model_validate_json(result.model_dump_json()), result)

    def test_decimal_bounds_are_expressed_in_both_schema_modes(self) -> None:
        for mode in ("validation", "serialization"):
            with self.subTest(mode=mode):
                schema = RecipePresentationOut.model_json_schema(mode=mode)
                self.assertEqual(schema["properties"]["kcal"]["anyOf"], [
                    {"type": "number", "minimum": 0}, {"type": "null"},
                ])
                self.assertEqual(schema["$defs"]["FoodstuffSummaryOut"]["properties"]["fat"]["anyOf"], [
                    {"type": "number", "minimum": 0}, {"type": "null"},
                ])
                amount = schema["$defs"]["RecipePresentationIngredientOut"]["properties"]["amount"]
                self.assertEqual(amount["type"], "number")
                self.assertEqual(amount["exclusiveMinimum"], 0)
                self.assertNotIn("maximum", amount)

    def test_decimal_serialization_range_and_rounding(self) -> None:
        for value in (Decimal("1e309"), Decimal("-1e309"), Decimal("1e-400"),
                      Decimal("NaN"), Decimal("Infinity")):
            with self.subTest(value=value):
                with self.assertRaises(ValidationError):
                    RecipePresentationOut.model_validate({**presentation(), "kcal": value})
        for literal in ("1e309",):
            body = json.dumps(presentation()).replace('"kcal": 12.5', f'"kcal": {literal}')
            with self.subTest(json_number=literal):
                with self.assertRaises(ValidationError):
                    RecipePresentationOut.model_validate_json(body)
        body = json.dumps(presentation()).replace('"kcal": 12.5', '"kcal": 1e-400')
        self.assertEqual(RecipePresentationOut.model_validate_json(body).kcal, Decimal("0"))
        with self.assertRaises(ValidationError):
            RecipePresentationOut.model_validate(json.loads(body, parse_float=Decimal))
        for value in (Decimal("0"), Decimal("5e-324"), Decimal.from_float(sys.float_info.max),
                      Decimal("0.12345678901234567890123456789")):
            with self.subTest(value=value):
                parsed = RecipePresentationOut.model_validate({**presentation(), "kcal": value})
                self.assertEqual(parsed.kcal, value)
                self.assertEqual(json.loads(parsed.model_dump_json())["kcal"], float(value))
                self.assertEqual(parsed.model_dump(mode="json")["kcal"], float(value))
        parsed = RecipePresentationOut.model_validate(presentation())
        parsed.ingredients[0].amount = Decimal("1e-400")
        for dump in (parsed.model_dump_json, lambda: parsed.model_dump(mode="json")):
            with self.assertRaises(PydanticSerializationError):
                dump()

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

    def test_request_validation_and_numeric_decimal_construction(self) -> None:
        for amount in (12, 12.5, Decimal("12.5")):
            with self.subTest(amount=amount):
                body = request()
                body["ingredients"] = [{"index": 1, "amount": amount, "foodstuffId": 7}]
                parsed = RecipePresentationResolve.model_validate(body)
                self.assertEqual(parsed.ingredients[0].amount, Decimal(str(amount)))
                self.assertIsInstance(json.loads(parsed.model_dump_json())["ingredients"][0]["amount"], (int, float))
                self.assertEqual(RecipePresentationResolve.model_validate_json(parsed.model_dump_json()), parsed)
        for amount in (0, -1, 10000, "12.5", "not-a-number", True, float("inf"), Decimal("NaN")):
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

    def test_malformed_wire_types_are_rejected(self) -> None:
        cases = [
            (RecipePresentationResolve, request, ("servings",), ("2", True, 2.5)),
            (RecipePresentationResolve, request, ("preptime",), ("2", True, 2.5)),
            (RecipePresentationResolve, request, ("ingredients", 0, "index"), ("1", True, 1.5)),
            (RecipePresentationResolve, request, ("ingredients", 0, "foodstuffId"), ("7", True, 7.5)),
            (RecipePresentationResolve, request, ("ingredients", 0, "amount"), ("12.5", True, None)),
            (RecipePresentationResolve, request, ("steps", 0, "description"), (1, True, None)),
            (RecipePresentationOut, presentation, ("servings",), ("2", True, 2.5)),
            (RecipePresentationOut, presentation, ("preptime",), ("2", True, 2.5)),
            (RecipePresentationOut, presentation, ("ingredients", 0, "index"), ("1", True, 1.5)),
            (RecipePresentationOut, presentation, ("ingredients", 0, "amount"), ("12.5", True, None)),
            (RecipePresentationOut, presentation, ("steps", 0, "index"), ("1", True, 1.5)),
            (RecipePresentationOut, presentation, ("steps", 0, "description"), (1, True, None)),
            (RecipePresentationOut, presentation, ("ingredients", 0, "foodstuff", "id"), ("7", True, 7.5)),
            (RecipePresentationOut, presentation, ("ingredients", 0, "foodstuff", "unit"), ("unknown", 1, True)),
        ]
        for path in (("kcal",), ("carbs",), ("protein",), ("fat",)):
            cases.append((RecipePresentationOut, presentation, path, ("12.5", True)))
            cases.append((RecipePresentationOut, presentation, ("ingredients", 0, "foodstuff", *path), ("12.5", True)))
        for field in ("name", "brand", "unitVerbose"):
            cases.append((RecipePresentationOut, presentation, ("ingredients", 0, "foodstuff", field), (1, True)))
        for model, factory, path, values in cases:
            for value in values:
                body = factory()
                target: object = body
                for key in path[:-1]:
                    if isinstance(key, int):
                        assert isinstance(target, list)
                    else:
                        assert isinstance(target, dict)
                    target = target[key]
                assert isinstance(target, dict)
                target[path[-1]] = value
                with self.subTest(model=model.__name__, path=path, value=value):
                    with self.assertRaises(ValidationError):
                        model.model_validate(body)
                    with self.assertRaises(ValidationError):
                        model.model_validate_json(json.dumps(body))
        for field in ("kcal", "carbs", "protein", "fat"):
            for value in ("12.5", True, float("inf"), float("nan")):
                body = presentation()
                body[field] = value
                body["ingredients"] = [{
                    "index": 1, "amount": 1,
                    "foodstuff": {**presentation()["ingredients"][0]["foodstuff"], field: value},
                }]
                with self.subTest(field=field, value=value):
                    with self.assertRaises(ValidationError):
                        RecipePresentationOut.model_validate_json(json.dumps(body))
        for model, factory in ((RecipePresentationResolve, request), (RecipePresentationOut, presentation)):
            for field in ("ingredients", "steps"):
                for value in ({}, "[]", None):
                    with self.subTest(model=model.__name__, field=field, value=value):
                        with self.assertRaises(ValidationError):
                            model.model_validate_json(json.dumps({**factory(), field: value}))
                with self.assertRaises(ValidationError):
                    model.model_validate({**factory(), field: tuple(factory()[field])})

    def test_backend_construction_and_numeric_request_schema(self) -> None:
        parsed = RecipePresentationOut.model_validate(presentation())
        constructed = RecipePresentationOut.model_validate(parsed.model_dump())
        self.assertEqual(constructed.ingredients[0].amount, Decimal("12.5"))
        self.assertIs(constructed.ingredients[0].foodstuff.unit, Unit.G)
        self.assertEqual(json.loads(constructed.model_dump_json()), presentation())
        foodstuff = constructed.ingredients[0].foodstuff
        self.assertEqual(FoodstuffSummaryOut.model_validate(SimpleNamespace(**foodstuff.model_dump())), foodstuff)
        with self.assertRaises(ValidationError):
            FoodstuffSummaryOut.model_validate({**foodstuff.model_dump(), "unit": b"G"})
        schema = RecipePresentationResolve.model_json_schema()
        amount = schema["$defs"]["RecipePresentationIngredientResolve"]["properties"]["amount"]
        self.assertEqual(amount["type"], "number")
        self.assertEqual(amount["exclusiveMinimum"], 0)
        self.assertEqual(amount["maximum"], 9999)
        self.assertNotIn("anyOf", amount)


if __name__ == "__main__":
    unittest.main()
