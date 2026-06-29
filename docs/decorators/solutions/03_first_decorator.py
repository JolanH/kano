"""Step 3 — reference solution."""

import time
from collections.abc import Callable
from typing import Any


def timed(func: Callable[[], None]) -> Callable[[], None]:
    def wrapper() -> None:
        start = time.perf_counter()
        func()
        # Store on the wrapper object so callers/tests can read the timing.
        wrapper.last_duration = time.perf_counter() - start  # type: ignore[attr-defined]

    return wrapper


if __name__ == "__main__":

    @timed
    def slow() -> None:
        total = 0
        for i in range(100_000):
            total += i

    slow()
    duration: Any = slow.last_duration  # type: ignore[attr-defined]
    print(f"slow() took {duration:.6f}s")
