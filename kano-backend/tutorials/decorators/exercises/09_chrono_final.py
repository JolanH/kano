"""Step 9 — Capstone: the @chrono decorator.

Combine everything into a production-quality decorator that matches this
project's conventions:
  - functools.wraps to preserve identity
  - *args/**kwargs + return to wrap anything
  - optional `unit` argument with the dual @chrono / @chrono(unit="s") form
  - ParamSpec / TypeVar typing for `mypy --strict`
  - structlog logging like the rest of kano-backend
  - try/finally so timing is logged even when the function raises

Fill in the TODOs, then run:
    pytest tutorials/decorators/test_exercises.py -v -k step9
    python tutorials/decorators/exercises/09_chrono_final.py
"""

import functools
import time
from collections.abc import Callable
from typing import ParamSpec, TypeVar, overload

import structlog

logger = structlog.get_logger(__name__)

P = ParamSpec("P")
R = TypeVar("R")


# These two @overload signatures let `mypy --strict` understand the dual form
# (@chrono vs @chrono(unit="s")). They carry no runtime behaviour — the real
# logic lives in the implementation below.
@overload
def chrono(func: Callable[P, R]) -> Callable[P, R]: ...
@overload
def chrono(*, unit: str = "ms") -> Callable[[Callable[P, R]], Callable[P, R]]: ...


def chrono(
    func: Callable[P, R] | None = None,
    *,
    unit: str = "ms",
) -> Callable[P, R] | Callable[[Callable[P, R]], Callable[P, R]]:
    """Log the wall-clock execution time of the decorated callable.

    Usable as ``@chrono`` or ``@chrono(unit="s")``. Emits a structlog event
    named ``"chrono"`` with a ``function`` key and a ``duration_<unit>`` key,
    logged even if the wrapped function raises.
    """

    def decorate(fn: Callable[P, R]) -> Callable[P, R]:
        @functools.wraps(fn)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            start = time.perf_counter()
            try:
                # TODO: call fn(*args, **kwargs) and return its result
                raise NotImplementedError
            finally:
                # TODO:
                #   1. elapsed = time.perf_counter() - start
                #   2. convert to ms if unit == "ms", else keep seconds
                #   3. logger.info("chrono", function=fn.__qualname__,
                #                  **{f"duration_{unit}": round(value, 3)})
                pass

        return wrapper

    # Dual form: bare @chrono passes the function as `func`; @chrono(...) doesn't.
    # TODO: if func is not None return decorate(func), else return decorate.
    raise NotImplementedError


if __name__ == "__main__":
    # Pretty console output so you can see the timing while learning.
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.dev.ConsoleRenderer(),
        ]
    )

    @chrono
    def busy() -> int:
        return sum(range(500_000))

    @chrono(unit="s")
    def lazy() -> str:
        time.sleep(0.01)
        return "done"

    print("busy() =", busy())
    print("lazy() =", lazy())
