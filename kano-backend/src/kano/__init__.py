"""Kano backend package.

The real Flask app factory lands in Story 1.3. This placeholder exists so
downstream stories can import ``kano`` and so ``poetry install`` has a valid
package to point at during scaffolding.
"""


def create_app() -> None:
    """Placeholder app factory; Story 1.3 replaces this with the real factory."""
    return None
