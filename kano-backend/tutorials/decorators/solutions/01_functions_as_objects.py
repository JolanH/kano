"""Step 1 — reference solution."""

from collections.abc import Callable


def apply(func: Callable[[int], int], value: int) -> int:
    return func(value)


def make_adder(n: int) -> Callable[[int], int]:
    def adder(value: int) -> int:
        return value + n

    return adder


if __name__ == "__main__":
    print("apply(square, 3) =", apply(lambda x: x * x, 3))
    print("make_adder(5)(10) =", make_adder(5)(10))
