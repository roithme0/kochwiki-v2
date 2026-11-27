import ast
from collections.abc import Iterator
from http import HTTPStatus
from itertools import pairwise

from ast_checks import Diagnostic


def status_literals(expression: ast.expr) -> Iterator[tuple[int, int, int]]:
    if isinstance(expression, ast.Constant):
        value: object = expression.value
        if isinstance(value, int) and 100 <= value <= 599:
            yield expression.lineno, expression.col_offset + 1, value
    elif isinstance(expression, (ast.List, ast.Set, ast.Tuple)):
        for item in expression.elts:
            yield from status_literals(item)
    elif isinstance(expression, ast.IfExp):
        yield from status_literals(expression.body)
        yield from status_literals(expression.orelse)


def is_status_attribute(expression: ast.expr) -> bool:
    return isinstance(expression, ast.Attribute) and expression.attr in {
        "status",
        "status_code",
    }


def findings(tree: ast.AST) -> Iterator[tuple[int, int, int]]:
    for node in ast.walk(tree):
        if isinstance(node, ast.keyword) and node.arg == "status_code":
            yield from status_literals(node.value)
        elif isinstance(node, ast.Compare):
            operands = [node.left, *node.comparators]
            for left, right in pairwise(operands):
                if is_status_attribute(left):
                    yield from status_literals(right)
                if is_status_attribute(right):
                    yield from status_literals(left)


def check(tree: ast.Module) -> Iterator[Diagnostic]:
    for line, column, code in findings(tree):
        try:
            replacement = f"HTTPStatus.{HTTPStatus(code).name}"
        except ValueError:
            replacement = "a named status constant"
        yield line, column, f"Use {replacement} instead of HTTP status literal {code}."
