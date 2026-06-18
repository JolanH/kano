"""Step 6 — reference solution."""

import functools
from collections.abc import Callable


def shout(func: Callable[..., str]) -> Callable[..., str]:
    @functools.wraps(func)
    def wrapper(*args: object, **kwargs: object) -> str:
        return func(*args, **kwargs).upper()

    return wrapper


def exclaim(func: Callable[..., str]) -> Callable[..., str]:
    @functools.wraps(func)
    def wrapper(*args: object, **kwargs: object) -> str:
        return func(*args, **kwargs) + "!"

    return wrapper


class Greeter:
    def __init__(self, name: str) -> None:
        self.name = name

    @shout
    def greet(self) -> str:
        return f"hi {self.name}"


@shout
@exclaim
def message() -> str:
    return "hi"


if __name__ == "__main__":
    print(Greeter("sam").greet())  # HI SAM
    print(message())  # HI!
