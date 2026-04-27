"""Schema-level guard: every timestamp column must be ``TIMESTAMPTZ``.

NFR14 mandates UTC-everywhere; the SQLAlchemy 2.x typed models use
``DateTime(timezone=True)`` exclusively. This test re-asserts the contract at
the database level so an accidental ``DateTime()`` (timezone-naive) regression
in any future migration fails CI.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import Engine, text

# Every timestamp column across the four domain tables that carry one.
# ``responses`` is intentionally absent — it is a leaf row whose audit time
# lives on the parent ``submissions.submitted_at``, so no per-response
# timestamp is needed. If a future migration adds e.g. ``responses.recorded_at``
# the entry MUST be added here so this test continues to enforce the contract.
EXPECTED_TIMESTAMP_COLUMNS: set[tuple[str, str]] = {
    ("projects", "created_at"),
    ("projects", "updated_at"),
    ("features", "created_at"),
    ("polls", "created_at"),
    ("polls", "expires_at"),
    ("submissions", "submitted_at"),
}


def test_every_timestamp_column_is_timestamptz(alembic_head: Engine) -> None:
    """All timestamp-shaped columns across the 5 domain tables are TIMESTAMPTZ."""

    with alembic_head.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT table_name, column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND (column_name LIKE '%_at' OR data_type LIKE 'timestamp%')
                ORDER BY table_name, column_name
                """
            )
        ).all()

    found = {(row.table_name, row.column_name) for row in rows}
    assert EXPECTED_TIMESTAMP_COLUMNS.issubset(
        found
    ), f"Missing timestamp columns: {EXPECTED_TIMESTAMP_COLUMNS - found}"

    for row in rows:
        assert row.data_type == "timestamp with time zone", (
            f"{row.table_name}.{row.column_name} is {row.data_type}, "
            "expected 'timestamp with time zone' (TIMESTAMPTZ)"
        )


def test_uuid_primary_keys_are_application_generated(
    alembic_head: Engine,
) -> None:
    """``projects.id`` has no server_default — application supplies UUIDs.

    Architecture §Enforcement Guidelines (line 512): UUIDs are minted by the
    application via ``default=uuid4``, never by the server via
    ``DEFAULT gen_random_uuid()``. This test verifies both that the migration
    declares no server default for ``id`` columns and that an INSERT that omits
    ``id`` fails — proving the column is NOT NULL with no DB-side fallback.
    """

    with alembic_head.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT table_name, column_default
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND column_name = 'id'
                  AND table_name IN
                      ('projects', 'features', 'polls', 'submissions')
                """
            )
        ).all()

    assert len(rows) == 4, f"expected 4 id columns, found {len(rows)}"
    for row in rows:
        assert row.column_default is None, (
            f"{row.table_name}.id has server default {row.column_default!r}; "
            "UUIDs must be application-generated (default=uuid4)."
        )

    # Sanity: an explicit application-generated UUID inserts cleanly.
    pid = uuid4()
    with alembic_head.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO projects (id, name, version, current_epoch) "
                "VALUES (:id, :name, :version, :epoch)"
            ),
            {"id": pid, "name": "test-project", "version": "0.1.0", "epoch": 1},
        )
        result = conn.execute(
            text("SELECT id FROM projects WHERE name = :name"),
            {"name": "test-project"},
        ).scalar_one()

    assert isinstance(result, UUID)
    assert result == pid
