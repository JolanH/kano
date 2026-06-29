"""Step 1 — Functions are first-class objects.

Goal: get comfortable passing functions as arguments and returning them from
other functions. This is the seed of every decorator.

Fill in the TODOs, then run:
    pytest tutorials/decorators/test_exercises.py -v -k step1
"""

from collections.abc import Callable


def apply(func: Callable[[int], int], value: int) -> int:
    """Call ``func`` with ``value`` and return the result.

    Example: ``apply(lambda x: x * x, 3)`` should return ``9``.
    """
    return func(value)



def make_adder(n: int) -> Callable[[int], int]:
    """Return a NEW function that adds ``n`` to whatever it is given.

    Example: ``make_adder(5)(10)`` should return ``15``.
    The returned function "remembers" ``n`` — that's a closure (next step).
    """
    # TODO: define an inner function that adds n, and return that function.
    def adder(value: int):
        return n + value
    return adder


if __name__ == "__main__":
    print("apply(square, 3) =", apply(lambda x: x * x, 3))
    add5 = make_adder(5)
    print("make_adder(5)(10) =", add5(10))
