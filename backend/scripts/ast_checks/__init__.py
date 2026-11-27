from ast import Module
from collections.abc import Callable, Iterable

type Diagnostic = tuple[int, int, str]
type Rule = Callable[[Module], Iterable[Diagnostic]]
