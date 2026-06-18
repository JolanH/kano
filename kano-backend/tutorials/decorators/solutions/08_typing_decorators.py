"""Step 8 — reference solution."""

import functools
from collections.abc import Callable
from typing import ParamSpec, TypeVar

P = ParamSpec("P")
R = TypeVar("R")


def logcall(func: Callable[P, R]) -> Callable[P, R]:
    @functools.wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        wrapper.last_called = func.__name__  # type: ignore[attr-defined]
        return func(*args, **kwargs)

    return wrapper


if __name__ == "__main__":

    @logcall
    def multiply(a: int, b: int) -> int:
        return a * b

    print("multiply(6, 7) =", multiply(6, 7))
    print("last_called    =", multiply.last_called)  # type: ignore[attr-defined]
