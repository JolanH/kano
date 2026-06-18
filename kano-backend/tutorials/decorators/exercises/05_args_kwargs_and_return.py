"""Step 5 — Wrap ANY function: *args, **kwargs, and return.

A reusable decorator cannot assume the signature. Accept ``*args, **kwargs``
and — critically — RETURN the wrapped function's result so callers still get
their value back.

Fill in the TODOs, then run:
    pytest tutorials/decorators/test_exercises.py -v -k step5
"""

import functools
import time
from collections.abc import Callable
from typing import Any


def timed(func: Callable[..., Any]) -> Callable[..., Any]:
    """Time a function of any signature, preserving its return value.

    Store elapsed seconds on ``wrapper.last_duration`` AND return the result.
    """

    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        start = time.perf_counter()
        # TODO:
        #   1. call func(*args, **kwargs) and keep the result
        #   2. set wrapper.last_duration = time.perf_counter() - start
        #   3. RETURN the result (forgetting this is the classic bug!)
        raise NotImplementedError

    return wrapper


if __name__ == "__main__":

    @timed
    def add(a: int, b: int) -> int:
        return a + b

    print("add(2, 3) =", add(2, 3))  # expected: 5
    print(f"took {add.last_duration:.6f}s")  # type: ignore[attr-defined]
