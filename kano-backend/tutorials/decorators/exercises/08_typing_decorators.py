"""Step 8 — Typing decorators for strict mypy (Python 3.12).

This project runs ``mypy --strict``. ``Callable[..., Any]`` erases the wrapped
function's signature, so call sites lose type safety. ``ParamSpec`` + ``TypeVar``
preserve it: the decorated function type-checks exactly like the original.

Fill in the TODOs, then run:
    pytest tutorials/decorators/test_exercises.py -v -k step8
    mypy tutorials/decorators/exercises/08_typing_decorators.py
"""

import functools
from collections.abc import Callable
from typing import ParamSpec, TypeVar

P = ParamSpec("P")  # captures the parameter list (args + kwargs) of any function
R = TypeVar("R")  # captures the return type


def logcall(func: Callable[P, R]) -> Callable[P, R]:
    """A signature-preserving decorator.

    It records the function name on ``wrapper.last_called`` and returns the
    function's result unchanged. The point is the TYPES:
      - parameters typed ``*args: P.args, **kwargs: P.kwargs``
      - return typed ``R``
    so ``mypy --strict`` still flags a wrong-typed call to the decorated function.
    """

    @functools.wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        # TODO:
        #   1. set wrapper.last_called = func.__name__
        #   2. return func(*args, **kwargs)
        raise NotImplementedError

    return wrapper


if __name__ == "__main__":

    @logcall
    def multiply(a: int, b: int) -> int:
        return a * b

    print("multiply(6, 7) =", multiply(6, 7))  # expected: 42
    print("last_called    =", multiply.last_called)  # type: ignore[attr-defined]
