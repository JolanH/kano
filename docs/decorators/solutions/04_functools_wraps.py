"""Step 4 — reference solution."""

import functools
from collections.abc import Callable


def documented(func: Callable[[], None]) -> Callable[[], None]:
    @functools.wraps(func)
    def wrapper() -> None:
        func()

    return wrapper


if __name__ == "__main__":

    @documented
    def greet() -> None:
        """Say hello."""
        print("hello")

    print("name:", greet.__name__)
    print("doc :", greet.__doc__)
