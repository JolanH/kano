"""Step 4 — Preserve identity with functools.wraps.

Wrapping replaces the original function, so its ``__name__`` and ``__doc__``
are lost (they become the wrapper's). ``@functools.wraps(func)`` copies that
metadata back onto the wrapper.

Fill in the TODOs, then run:
    pytest tutorials/decorators/test_exercises.py -v -k step4
"""

import functools
from collections.abc import Callable


def documented(func: Callable[[], None]) -> Callable[[], None]:
    """Decorator that preserves the wrapped function's identity.

    After decorating, ``func.__name__`` and ``func.__doc__`` must still be the
    ORIGINAL function's name and docstring — not "wrapper".
    """

    # TODO: add the @functools.wraps(func) decorator on the line below.
    def wrapper() -> None:
        func()

    return wrapper


if __name__ == "__main__":

    @documented
    def greet() -> None:
        """Say hello."""
        print("hello")

    print("name:", greet.__name__)  # expected: greet
    print("doc :", greet.__doc__)  # expected: Say hello.
