"""Step 7 — Decorators that take arguments (and the dual form).

To write ``@chrono(unit="ms")`` you need THREE levels: a function that takes
the argument, which returns the decorator, which returns the wrapper.

You'll also build the "dual form" — one name usable as BOTH ``@chrono`` and
``@chrono(unit="s")`` — which the capstone relies on.

Fill in the TODOs, then run:
    pytest tutorials/decorators/test_exercises.py -v -k step7
"""

import functools
from collections.abc import Callable
from typing import Any


def repeat(times: int) -> Callable[[Callable[..., Any]], Callable[..., list[Any]]]:
    """Decorator factory: run the wrapped function ``times`` times.

    The wrapper returns a list of the results.
    Example: ``@repeat(3)`` on ``f`` makes ``f()`` return ``[f(), f(), f()]``.
    """

    def decorate(func: Callable[..., Any]) -> Callable[..., list[Any]]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> list[Any]:
            # TODO: call func `times` times, collecting results into a list,
            #       and return that list.
            raise NotImplementedError

        return wrapper

    return decorate


def tag(label: str = "span") -> Callable[[Callable[..., str]], Callable[..., str]]:
    """Wrap the returned string in <label>...</label>.

    Support BOTH usages:
        @tag              -> uses the default label "span"
        @tag("b")         -> uses label "b"

    Hint for the dual form: if ``label`` was handed a *function* instead of a
    string (because someone wrote ``@tag`` with no parentheses), detect that and
    decorate it directly with the default label.
    """
    default = "span"

    def decorate(func: Callable[..., str], lbl: str) -> Callable[..., str]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> str:
            # TODO: return f"<{lbl}>{result}</{lbl}>" around func's result.
            raise NotImplementedError

        return wrapper

    # TODO: implement the dual form.
    #   - if `label` is callable, it's actually the function: return
    #     decorate(label, default)
    #   - otherwise return a one-arg decorator that calls decorate(func, label)
    raise NotImplementedError


if __name__ == "__main__":

    @repeat(3)
    def roll() -> int:
        return 4

    print("repeat:", roll())  # expected: [4, 4, 4]

    @tag
    def a() -> str:
        return "hi"

    @tag("b")
    def c() -> str:
        return "yo"

    print("tag default:", a())  # expected: <span>hi</span>
    print("tag('b'):   ", c())  # expected: <b>yo</b>
