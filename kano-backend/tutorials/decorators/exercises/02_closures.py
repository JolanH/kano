"""Step 2 — Closures.

A closure is an inner function that remembers variables from its enclosing
function even after that function has returned. Use ``nonlocal`` to mutate a
captured variable.

Fill in the TODOs, then run:
    pytest tutorials/decorators/test_exercises.py -v -k step2
"""

from collections.abc import Callable


def make_counter() -> Callable[[], int]:
    """Return a function that returns 1, then 2, then 3, ... on each call.

    The count is private to the closure — there is no global variable.
    Example:
        c = make_counter()
        c()  # 1
        c()  # 2
    """
    # TODO:
    #   1. create a local variable `count` starting at 0
    #   2. define an inner function that uses `nonlocal count`, increments it,
    #      and returns the new value
    #   3. return the inner function
    count = 0
    def increments() -> int:
        nonlocal count
        count+=1
        return count
    return increments


if __name__ == "__main__":
    counter = make_counter()
    print([counter(), counter(), counter()])  # expected: [1, 2, 3]
