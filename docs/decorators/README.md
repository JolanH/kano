# Python Decorators — from first principles to `@chrono`

A hands-on tutorial that builds up, one small idea at a time, to a production-quality
`@chrono` decorator that measures and logs a function's execution time — wired to the same
**structlog** logging this project (`kano-backend`) uses everywhere.

You learn by *doing*: each step has a runnable **exercise** file with `# TODO`s to fill in,
a reference **solution**, and a **test** you run to know when you got it right.

---

## How to use this tutorial

From the `kano-backend/` directory:

```bash
# 1. Read a section below.
# 2. Open the matching exercises/NN_*.py file and fill in the TODOs.
# 3. Run that exercise's tests until they pass:
pytest tutorials/decorators/test_exercises.py -v -k step3      # just step 3
pytest tutorials/decorators/test_exercises.py -v               # everything

# Run any exercise file directly to see its demo output:
python tutorials/decorators/exercises/03_first_decorator.py

# Stuck? Compare with the reference solution:
#   tutorials/decorators/solutions/NN_*.py
```

The tests import **your** code from `exercises/`. They will fail until you implement each
stub — that's the point. When a step's tests go green, move on.

> Tip: peek at the solution *after* you've struggled a little. The struggle is where the
> learning happens.

---

## The one idea behind every decorator

A decorator is **a function that takes a function and returns a (usually new) function.**

The `@` syntax is pure sugar:

```python
@my_decorator
def greet(): ...

# is EXACTLY the same as:
def greet(): ...
greet = my_decorator(greet)
```

That's it. Everything else — `functools.wraps`, `*args`, decorators-with-arguments, typing —
is detail layered on top of that single sentence. We'll add one layer per step.

---

## Step 1 — Functions are objects (`01_functions_as_objects.py`)

Before you can pass a function *into* a decorator, you need to believe functions are ordinary
values. You can assign them to variables, store them in lists, pass them as arguments, and
**return them from other functions**.

- `apply(func, value)` — call a function you received as an argument.
- `make_adder(n)` — *return* a brand-new function.

Returning a function from a function is the seed of every decorator.

## Step 2 — Closures (`02_closures.py`)

A **closure** is an inner function that "remembers" variables from the enclosing function,
even after that outer function has returned. Use `nonlocal` to mutate a captured variable.

- `make_counter()` — returns a function whose private count survives between calls.

A decorator's wrapper is a closure: it remembers the original function it's wrapping.

## Step 3 — Your first decorator (`03_first_decorator.py`)

Now combine the two: a function that takes `func`, defines an inner `wrapper` that calls
`func`, and returns `wrapper`. Our first timing version:

```python
def timed(func):
    def wrapper():
        start = time.perf_counter()
        func()
        wrapper.last_duration = time.perf_counter() - start
    return wrapper
```

Note it only handles zero-argument functions and throws away the return value — we fix both
soon. `time.perf_counter()` is the right clock for measuring durations (high-resolution,
monotonic).

## Step 4 — Keep the function's identity with `functools.wraps` (`04_functools_wraps.py`)

Wrapping replaces the original function, so `greet.__name__` becomes `"wrapper"` and the
docstring vanishes — breaking debuggers, logs, and `help()`. `@functools.wraps(func)` copies
`__name__`, `__doc__`, `__qualname__`, etc. onto the wrapper. **Always use it.**

## Step 5 — Wrap *any* function: `*args`, `**kwargs`, and `return` (`05_args_kwargs_and_return.py`)

A reusable decorator can't assume the signature. `def wrapper(*args, **kwargs)` accepts
anything, and crucially you must `return func(*args, **kwargs)` so the caller still gets the
result. Forgetting the `return` is the #1 beginner bug.

## Step 6 — Methods and stacking (`06_decorating_methods.py`)

Decorating a method needs no special handling: `self` is just the first positional argument,
already captured by `*args`. You'll also stack decorators and observe the order — the one
**closest to the function runs first** (decorators apply bottom-up, wrappers execute
outside-in).

## Step 7 — Decorators that take arguments (`07_decorator_with_arguments.py`)

`@chrono(unit="ms")` needs one more layer: a function that takes the *arguments* and returns a
decorator, which returns a wrapper — three nested levels.

```python
def repeat(times):          # takes the argument
    def decorate(func):     # the actual decorator
        def wrapper(*a, **k):
            ...
        return wrapper
    return decorate
```

You'll also handle the *dual form* — making one decorator usable as both `@chrono` and
`@chrono(unit="s")` — which is exactly what the capstone needs.

## Step 8 — Typing decorators for strict mypy (`08_typing_decorators.py`)

This project runs `mypy --strict`. A naive `Callable[..., Any]` erases your function's
signature. Python 3.12's `ParamSpec` + `TypeVar` preserve it so the decorated function still
type-checks at every call site:

```python
P = ParamSpec("P")
R = TypeVar("R")

def deco(func: Callable[P, R]) -> Callable[P, R]:
    @functools.wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        return func(*args, **kwargs)
    return wrapper
```

## Step 9 — Capstone: `@chrono` (`09_chrono_final.py`)

Everything at once, in this project's style:

- `functools.wraps` to preserve identity,
- `*args/**kwargs` + `return` to wrap anything,
- optional argument `unit` ("ms" or "s") with the dual `@chrono` / `@chrono(unit="s")` form,
- `ParamSpec`/`TypeVar` typing for strict mypy,
- **structlog** logging matching the codebase: `logger = structlog.get_logger(__name__)` then
  `logger.info("chrono", function=..., duration_ms=...)`,
- a `try/finally` so the duration is logged **even when the wrapped function raises**.

This mirrors the existing request-timing in
`src/kano/middleware/structured_logging.py` (which times requests and logs `duration_ms`).

---

## Using `@chrono` in the real codebase (optional)

Once step 9's tests pass, you can promote it for real:

1. Copy the capstone into `src/kano/decorators.py`.
2. Add `tests/unit/test_chrono.py` using `structlog.testing.capture_logs()` to assert the
   `chrono` event is emitted with a `duration_ms` key (see `solutions/09_chrono_final.py` for
   the capture pattern).
3. Decorate a real service method, e.g. in `src/kano/services/analysis.py`:

   ```python
   from kano.decorators import chrono

   @chrono
   def compute_kano_matrix(...): ...
   ```

   Because logging flows through structlog's contextvars, each `chrono` line automatically
   carries the active `request_id` — no extra wiring.

---

## Linting and type-checking

The **reference solutions** are written to the project's standard — they pass cleanly:

```bash
ruff check tutorials/decorators/solutions
mypy tutorials/decorators/solutions          # strict mode, per pyproject.toml
```

The **exercise stubs** intentionally contain not-yet-used imports and variables (the pieces
you'll wire up in the TODOs), so `ruff`/`mypy` will report warnings on them *until you finish
each one*. Once your completed exercise matches the solution, it lints and type-checks clean
too. Two production touches worth noting in the solutions:

- Steps 7 and 9 use `typing.overload` to describe the **dual form** (`@chrono` vs
  `@chrono(unit="s")`) to mypy — without it, `mypy --strict` reports "untyped decorator" at the
  parametrised call site.
- The capstone stores nothing on the wrapper; earlier steps that stash `last_duration` on the
  wrapper use a small `# type: ignore[attr-defined]` (mypy can't see attributes added at runtime).

## Reference: the finished `@chrono`

See `solutions/09_chrono_final.py`. It passes `ruff check` and `mypy --strict` under the
project's config (Python 3.12, 100-char lines).
