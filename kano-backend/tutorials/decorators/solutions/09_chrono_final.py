"""Step 9 — reference solution: the @chrono decorator.

Production-quality, matching kano-backend conventions (structlog, Python 3.12
typing, strict mypy, 100-char lines). This is the version you can copy into
``src/kano/decorators.py`` to use for real.
"""

import functools
import time
from collections.abc import Callable
from typing import ParamSpec, TypeVar, overload

import structlog

logger = structlog.get_logger(__name__)

P = ParamSpec("P")
R = TypeVar("R")


# Two @overload signatures teach mypy the dual form: bare ``@chrono`` returns the
# wrapped function, while ``@chrono(unit=...)`` returns a decorator. Without these,
# ``mypy --strict`` reports "untyped decorator" at the @chrono(unit="s") call site.
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
    logged even if the wrapped function raises (via ``try/finally``).
    """

    def decorate(fn: Callable[P, R]) -> Callable[P, R]:
        @functools.wraps(fn)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            start = time.perf_counter()
            try:
                return fn(*args, **kwargs)
            finally:
                elapsed = time.perf_counter() - start
                value = elapsed * 1000 if unit == "ms" else elapsed
                logger.info(
                    "chrono",
                    function=fn.__qualname__,
                    **{f"duration_{unit}": round(value, 3)},
                )

        return wrapper

    # Dual form: bare ``@chrono`` hands us the function as ``func``; the
    # parametrised ``@chrono(unit=...)`` leaves ``func`` as None.
    return decorate(func) if func is not None else decorate


if __name__ == "__main__":
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
