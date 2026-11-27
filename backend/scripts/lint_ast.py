import ast
import sys
from importlib import import_module
from pathlib import Path
from typing import cast

from ast_checks import Rule


def load_rules() -> list[Rule]:
    directory = Path(__file__).with_name("ast_checks")
    rules: list[Rule] = []
    for path in sorted(directory.glob("*_rule.py")):
        module = import_module(f"ast_checks.{path.stem}")
        check: object = getattr(module, "check", None)
        if not callable(check):
            raise TypeError(f"{path.name} must export a check function")
        rules.append(cast(Rule, check))
    if not rules:
        raise RuntimeError(f"No AST lint rules found in {directory}")
    return rules


def main() -> int:
    rules = load_rules()
    failed = False
    for filename in filter(None, sys.stdin.read().split("\0")):
        tree = ast.parse(Path(filename).read_bytes(), filename=filename)
        diagnostics = {diagnostic for rule in rules for diagnostic in rule(tree)}
        for line, column, message in sorted(diagnostics):
            print(f"{filename}:{line}:{column}: {message}")
            failed = True
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
