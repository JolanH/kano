"""Self-check tests for the decorators tutorial.

Run all:           pytest tutorials/decorators/test_exercises.py -v
Run one step:      pytest tutorials/decorators/test_exercises.py -v -k step3

The tests load your work from ``exercises/`` by file path (the numeric file
prefixes aren't valid import names). Fill in a stub until its test goes green.
To check your understanding against the reference, point TARGET at "solutions".
"""

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest
import structlog

# Switch to "solutions" to run the same suite against the reference answers.
TARGET = "exercises"

_DIR = Path(__file__).parent / TARGET


def _load(filename: str) -> ModuleType:
    """Import a tutorial file by path (names like ``01_*.py`` aren't importable)."""
    path = _DIR / filename
    spec = importlib.util.spec_from_file_location(path.stem, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestStep1FunctionsAsObjects:
    def test_apply_calls_the_function(self) -> None:
        mod = _load("01_functions_as_objects.py")
        assert mod.apply(lambda x: x * x, 3) == 9

    def test_make_adder_returns_a_function(self) -> None:
        mod = _load("01_functions_as_objects.py")
        add5 = mod.make_adder(5)
        assert callable(add5)
        assert add5(10) == 15


class TestStep2Closures:
    def test_counter_increments_independently(self) -> None:
        mod = _load("02_closures.py")
        counter = mod.make_counter()
        assert [counter(), counter(), counter()] == [1, 2, 3]
        # A second counter has its own private state.
        assert mod.make_counter()() == 1


class TestStep3FirstDecorator:
    def test_records_duration(self) -> None:
        mod = _load("03_first_decorator.py")

        @mod.timed
        def work() -> None:
            sum(range(1000))

        work()
        assert isinstance(work.last_duration, float)
        assert work.last_duration >= 0


class TestStep4FunctoolsWraps:
    def test_preserves_name_and_doc(self) -> None:
        mod = _load("04_functools_wraps.py")

        @mod.documented
        def greet() -> None:
            """Say hello."""

        assert greet.__name__ == "greet"
        assert greet.__doc__ == "Say hello."


class TestStep5ArgsKwargsAndReturn:
    def test_returns_result_and_times(self) -> None:
        mod = _load("05_args_kwargs_and_return.py")

        @mod.timed
        def add(a: int, b: int) -> int:
            return a + b

        assert add(2, 3) == 5
        assert add(a=10, b=20) == 30
        assert add.last_duration >= 0


class TestStep6DecoratingMethods:
    def test_method_decoration(self) -> None:
        mod = _load("06_decorating_methods.py")
        assert mod.Greeter("sam").greet() == "HI SAM"

    def test_stacking_order(self) -> None:
        mod = _load("06_decorating_methods.py")
        # @shout(@exclaim(message)): exclaim runs first -> "hi!", then shout -> "HI!"
        assert mod.message() == "HI!"


class TestStep7DecoratorWithArguments:
    def test_repeat(self) -> None:
        mod = _load("07_decorator_with_arguments.py")

        @mod.repeat(3)
        def roll() -> int:
            return 4

        assert roll() == [4, 4, 4]

    def test_tag_dual_form(self) -> None:
        mod = _load("07_decorator_with_arguments.py")

        @mod.tag
        def a() -> str:
            return "hi"

        @mod.tag("b")
        def c() -> str:
            return "yo"

        assert a() == "<span>hi</span>"
        assert c() == "<b>yo</b>"


class TestStep8TypingDecorators:
    def test_runtime_behaviour_and_metadata(self) -> None:
        mod = _load("08_typing_decorators.py")

        @mod.logcall
        def multiply(a: int, b: int) -> int:
            return a * b

        assert multiply(6, 7) == 42
        assert multiply.__name__ == "multiply"  # wraps preserved
        assert multiply.last_called == "multiply"


class TestStep9Chrono:
    def test_bare_form_logs_duration_ms(self) -> None:
        mod = _load("09_chrono_final.py")

        @mod.chrono
        def busy() -> int:
            return sum(range(1000))

        with structlog.testing.capture_logs() as logs:
            assert busy() == sum(range(1000))

        events = [e for e in logs if e.get("event") == "chrono"]
        assert len(events) == 1
        assert events[0]["function"].endswith("busy")
        assert "duration_ms" in events[0]
        assert events[0]["duration_ms"] >= 0

    def test_parametrised_unit_seconds(self) -> None:
        mod = _load("09_chrono_final.py")

        @mod.chrono(unit="s")
        def quick() -> str:
            return "ok"

        with structlog.testing.capture_logs() as logs:
            assert quick() == "ok"

        event = next(e for e in logs if e.get("event") == "chrono")
        assert "duration_s" in event

    def test_logs_even_when_function_raises(self) -> None:
        mod = _load("09_chrono_final.py")

        @mod.chrono
        def boom() -> None:
            raise ValueError("nope")

        with (
            structlog.testing.capture_logs() as logs,
            pytest.raises(ValueError, match="nope"),
        ):
            boom()

        assert any(e.get("event") == "chrono" for e in logs)


def test_target_is_exercises_by_default() -> None:
    # A guard so a stray edit to TARGET doesn't silently grade the solutions.
    assert TARGET in {"exercises", "solutions"}
