"""Step 7 — reference solution."""

import functools
from collections.abc import Callable
from typing import Any, overload


def repeat(times: int) -> Callable[[Callable[..., Any]], Callable[..., list[Any]]]:
    def decorate(func: Callable[..., Any]) -> Callable[..., list[Any]]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> list[Any]:
            return [func(*args, **kwargs) for _ in range(times)]

        return wrapper

    return decorate


# Overloads describe the dual form to mypy (the typing technique itself is the
# subject of step 8). Bare ``@tag`` -> wrapped function; ``@tag("b")`` -> decorator.
@overload
def tag(label: Callable[..., str]) -> Callable[..., str]: ...
@overload
def tag(label: str = "span") -> Callable[[Callable[..., str]], Callable[..., str]]: ...


def tag(label: str | Callable[..., str] = "span") -> Any:
    default = "span"

    def decorate(func: Callable[..., str], lbl: str) -> Callable[..., str]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> str:
            return f"<{lbl}>{func(*args, **kwargs)}</{lbl}>"

        return wrapper

    # Dual form.
    if callable(label):  # bare @tag — `label` is really the function
        return decorate(label, default)

    chosen = label

    def decorator(func: Callable[..., str]) -> Callable[..., str]:
        return decorate(func, chosen)

    return decorator


if __name__ == "__main__":

    @repeat(3)
    def roll() -> int:
        return 4

    print("repeat:", roll())  # [4, 4, 4]

    @tag
    def a() -> str:
        return "hi"

    @tag("b")
    def c() -> str:
        return "yo"

    print("tag default:", a())  # <span>hi</span>
    print("tag('b'):   ", c())  # <b>yo</b>
