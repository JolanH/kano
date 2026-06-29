"""Step 5 — reference solution."""

import functools
import time
from collections.abc import Callable
from typing import Any


def timed(func: Callable[..., Any]) -> Callable[..., Any]:
    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        start = time.perf_counter()
        result = func(*args, **kwargs)
        wrapper.last_duration = time.perf_counter() - start  # type: ignore[attr-defined]
        return result

    return wrapper


if __name__ == "__main__":

    @timed
    def add(a: int, b: int) -> int:
        return a + b

    print("add(2, 3) =", add(2, 3))
    duration: Any = add.last_duration  # type: ignore[attr-defined]
    print(f"took {duration:.6f}s")
