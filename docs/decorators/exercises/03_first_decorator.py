"""Step 3 — Your first decorator.

A decorator takes a function, wraps it in an inner ``wrapper`` closure, and
returns the wrapper. Here we build a timing decorator for ZERO-argument
functions (we generalise later).

Fill in the TODOs, then run:
    pytest tutorials/decorators/test_exercises.py -v -k step3
"""

import time
from collections.abc import Callable


def timed(func: Callable[[], None]) -> Callable[[], None]:
    """Decorator that times a zero-argument function.

    After the wrapper runs, store the elapsed seconds on the wrapper itself as
    an attribute ``last_duration`` (a float >= 0), so callers/tests can read it.

    Remember: ``@timed`` is just ``func = timed(func)``.
    """

    def wrapper() -> None:
        # TODO:
        #   1. record start with time.perf_counter()
        #   2. call func()
        #   3. set wrapper.last_duration to (perf_counter() - start)
        start = time.perf_counter()
        func()
        wrapper.last_duration=time.perf_counter() - start

    return wrapper


if __name__ == "__main__":

    @timed
    def slow() -> None:
        total = 0
        for i in range(100_000):
            total += i

    slow()
    print(f"slow() took {slow.last_duration:.6f}s")  # type: ignore[attr-defined]
