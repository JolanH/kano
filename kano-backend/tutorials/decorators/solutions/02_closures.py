"""Step 2 — reference solution."""

from collections.abc import Callable


def make_counter() -> Callable[[], int]:
    count = 0

    def increment() -> int:
        nonlocal count
        count += 1
        return count

    return increment


if __name__ == "__main__":
    counter = make_counter()
    print([counter(), counter(), counter()])
