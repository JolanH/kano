"""Initial schema: projects, features, polls, submissions, responses.

This migration is the most irreversible artifact in the project. All future
schema changes ship as new migrations; never edit this file in place.

Revision ID: 0001
Revises:
Create Date: 2026-04-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("current_epoch", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_projects")),
    )

    op.create_table(
        "features",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("epoch", sa.Integer(), nullable=False),
        sa.Column("feature_key", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("TRUE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_features_project_id_projects"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_features")),
        sa.UniqueConstraint(
            "project_id",
            "epoch",
            "feature_key",
            name=op.f("uq_features_project_id_epoch_feature_key"),
        ),
    )
    op.create_index(
        op.f("ix_features_project_id_epoch"),
        "features",
        ["project_id", "epoch"],
        unique=False,
    )

    # polls.(project_id, epoch) is the logical feature-set-snapshot identifier.
    # PostgreSQL cannot enforce it as a true composite FK against features
    # because (project_id, epoch) is not unique on its own there. project_id
    # is a real FK to projects.id; epoch is a plain INTEGER NOT NULL written
    # from project.current_epoch at poll creation, with mutation gated by
    # epoch_service.bump_epoch_on_feature_change() in Story 2.6.
    op.create_table(
        "polls",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("epoch", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_polls_project_id_projects"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_polls")),
    )
    op.create_index(
        op.f("ix_polls_project_id_epoch"),
        "polls",
        ["project_id", "epoch"],
        unique=False,
    )
    # Index on expires_at — supports efficient "non-expired polls" queries
    # via WHERE expires_at > now(). The story spec called for a partial
    # index `WHERE expires_at > now()`, but PostgreSQL rejects that
    # predicate because now() is STABLE, not IMMUTABLE, and partial-index
    # predicates must be IMMUTABLE. A plain B-tree index on expires_at is
    # equally usable by the planner for that query shape and is the
    # standard idiom for "now()-based" expiry filtering in PG.
    # Authored via op.execute to keep this index name stable across any
    # future autogenerate runs that might rename it.
    op.execute("CREATE INDEX ix_polls_expires_at ON polls (expires_at)")

    op.create_table(
        "submissions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("poll_id", sa.Uuid(), nullable=False),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["poll_id"],
            ["polls.id"],
            name=op.f("fk_submissions_poll_id_polls"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_submissions")),
    )
    op.create_index(
        op.f("ix_submissions_poll_id"),
        "submissions",
        ["poll_id"],
        unique=False,
    )

    op.create_table(
        "responses",
        sa.Column("submission_id", sa.Uuid(), nullable=False),
        sa.Column("feature_id", sa.Uuid(), nullable=False),
        sa.Column("fq_answer", sa.SmallInteger(), nullable=False),
        sa.Column("dq_answer", sa.SmallInteger(), nullable=False),
        sa.Column("category", sa.CHAR(length=1), nullable=False),
        sa.CheckConstraint(
            "fq_answer BETWEEN 1 AND 5",
            name=op.f("ck_responses_fq_answer_range"),
        ),
        sa.CheckConstraint(
            "dq_answer BETWEEN 1 AND 5",
            name=op.f("ck_responses_dq_answer_range"),
        ),
        sa.CheckConstraint(
            "category IN ('M', 'L', 'E', 'I', 'C', 'D')",
            name=op.f("ck_responses_category_enum"),
        ),
        sa.ForeignKeyConstraint(
            ["feature_id"],
            ["features.id"],
            name=op.f("fk_responses_feature_id_features"),
        ),
        sa.ForeignKeyConstraint(
            ["submission_id"],
            ["submissions.id"],
            name=op.f("fk_responses_submission_id_submissions"),
        ),
        sa.PrimaryKeyConstraint(
            "submission_id",
            "feature_id",
            name=op.f("pk_responses"),
        ),
    )


def downgrade() -> None:
    op.drop_table("responses")
    op.drop_index(op.f("ix_submissions_poll_id"), table_name="submissions")
    op.drop_table("submissions")
    op.execute("DROP INDEX IF EXISTS ix_polls_expires_at")
    op.drop_index(op.f("ix_polls_project_id_epoch"), table_name="polls")
    op.drop_table("polls")
    op.drop_index(op.f("ix_features_project_id_epoch"), table_name="features")
    op.drop_table("features")
    op.drop_table("projects")
