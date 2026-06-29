"""Step 6 — Decorating methods, and stacking decorators.

Methods need no special handling: ``self`` is just the first positional
argument, already captured by ``*args``. You'll also stack two decorators and
observe the order: the decorator CLOSEST to the function runs first.

Fill in the TODOs, then run:
    pytest tutorials/decorators/test_exercises.py -v -k step6
"""

import functools
from collections.abc import Callable


def shout(func: Callable[..., str]) -> Callable[..., str]:
    """Uppercase the string returned by ``func``."""

    @functools.wraps(func)
    def wrapper(*args: object, **kwargs: object) -> str:
        # TODO: call func, then return the result uppercased.
        raise NotImplementedError

    return wrapper


def exclaim(func: Callable[..., str]) -> Callable[..., str]:
    """Append "!" to the string returned by ``func``."""

    @functools.wraps(func)
    def wrapper(*args: object, **kwargs: object) -> str:
        # TODO: call func, then return the result with "!" appended.
        raise NotImplementedError

    return wrapper


class Greeter:
    """A class whose method is decorated — note ``self`` flows through *args."""

    def __init__(self, name: str) -> None:
        self.name = name

    @shout
    def greet(self) -> str:
        return f"hi {self.name}"


# Stacking: @shout is OUTER, @exclaim is INNER (closest to func, runs first).
# So message() -> exclaim makes "hi!" -> shout makes "HI!".
@shout
@exclaim
def message() -> str:
    return "hi"


if __name__ == "__main__":
    print(Greeter("sam").greet())  # expected: HI SAM
    print(message())  # expected: HI!
