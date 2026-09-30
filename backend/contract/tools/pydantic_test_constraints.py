import re
import sys
import tomllib
from pathlib import Path


def test_constraints(dependencies: list[str]) -> tuple[str, str]:
    declarations = [entry for entry in dependencies if re.match(r"(?i)^pydantic(?:\s|[<>=!~;\[@]|$)", entry)]
    if len(declarations) != 1:
        raise ValueError("Expected exactly one Pydantic dependency in pyproject.toml")
    declaration = declarations[0]
    number = r"(?:0|[1-9]\d*)"
    version = rf"{number}(?:\.{number})*"
    match = re.fullmatch(rf"pydantic\s*>=\s*({version})\s*,\s*<\s*({version})\s*", declaration, re.IGNORECASE)
    if match is None:
        raise ValueError("Pydantic CI supports only an inclusive minimum and exclusive maximum: pydantic>=X,<Y")
    minimum = tuple(int(part) for part in match[1].split("."))
    maximum = tuple(int(part) for part in match[2].split("."))
    width = max(len(minimum), len(maximum))
    if minimum + (0,) * (width - len(minimum)) >= maximum + (0,) * (width - len(maximum)):
        raise ValueError("Pydantic minimum must be below its maximum")
    return f"pydantic=={match[1]}", declaration


def read_constraints(path: Path) -> tuple[str, str]:
    with path.open("rb") as file:
        metadata = tomllib.load(file)
    project: object = metadata.get("project")
    if not isinstance(project, dict):
        raise ValueError("Missing project metadata in pyproject.toml")
    dependencies: object = project.get("dependencies")
    if not isinstance(dependencies, list) or not all(isinstance(entry, str) for entry in dependencies):
        raise ValueError("Expected project.dependencies to be a list of strings")
    return test_constraints([entry for entry in dependencies if isinstance(entry, str)])


def main() -> None:
    try:
        constraints = read_constraints(Path(__file__).resolve().parents[1] / "pyproject.toml")
    except (ValueError, OSError) as error:
        sys.exit(str(error))
    print("\n".join(constraints))


if __name__ == "__main__":
    main()
