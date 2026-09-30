import tempfile
import unittest
from pathlib import Path

from pydantic_test_constraints import read_constraints, test_constraints


class PydanticConstraintsTests(unittest.TestCase):
    def test_versions_follow_dependency(self) -> None:
        self.assertEqual(
            test_constraints(["other>=1", "pydantic-settings>=2", "pydantic>=2.15.2,<3"]),
            ("pydantic==2.15.2", "pydantic>=2.15.2,<3"),
        )

    def test_missing_duplicate_or_unsupported_declarations_fail(self) -> None:
        for dependencies in (
            [], ["pydantic-settings>=2"],
            ["pydantic>=2,<3", "pydantic>=2.1,<3"],
            ["pydantic==2.13.4"], ["pydantic>2.13.4,<3"],
            ["pydantic>=2,<3; python_version >= '3.13'"],
            ["pydantic>=3,<2"], ["pydantic>=2.0,<2"],
        ):
            with self.subTest(dependencies=dependencies), self.assertRaises(ValueError):
                test_constraints(dependencies)

    def test_reading_project_dependencies(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "pyproject.toml"
            path.write_text('[project]\ndependencies = ["pydantic>=2.15.2,<3"]\n', encoding="utf-8")
            self.assertEqual(read_constraints(path), ("pydantic==2.15.2", "pydantic>=2.15.2,<3"))
            for content in ("", '[project]\ndependencies = "pydantic>=2,<3"', '[project]\ndependencies = [1]'):
                path.write_text(content, encoding="utf-8")
                with self.subTest(content=content), self.assertRaises(ValueError):
                    read_constraints(path)
