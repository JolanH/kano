# Story 1.2: Alembic migration #1 locks the five-table domain schema

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a solo dev,
I want the full domain schema (`projects`, `features`, `polls`, `submissions`, `responses`) expressed as Alembic migration `0001_initial_schema.py` with all FKs, CHECK constraints, indexes, and `TIMESTAMPTZ` columns,
so that the most irreversible artifact in the project is locked in one reviewable artifact and all future schema changes ship as migrations.

## Acceptance Criteria

1. **Given** `kano-backend/alembic.ini` and `kano-backend/migrations/env.py` are bootstrapped (env.py wires SQLAlchemy metadata, target URL from config, `TIMESTAMPTZ` default naming convention) **and** a clean PostgreSQL 17 database, **when** I run `alembic upgrade head`, **then** all 5 tables are created with application-generated UUID primary keys (no `DEFAULT gen_random_uuid()`).
2. `features` has unique constraint on `(project_id, epoch, feature_key)`, `is_active` boolean, TIMESTAMPTZ `created_at`.
3. `polls` foreign-keys `(project_id, epoch)` to pin to an immutable feature set snapshot; includes TIMESTAMPTZ `expires_at` and a partial index on non-expired polls.
4. `responses` has CHECK constraints `fq_answer BETWEEN 1 AND 5`, `dq_answer BETWEEN 1 AND 5`, `category IN ('M','L','E','I','C','D')`, composite PK `(submission_id, feature_id)`.
5. All required indexes exist: `feature(project_id, epoch)`, `poll(project_id, epoch)`, `poll(expires_at)` partial, `submission(poll_id)`.
6. Running `alembic downgrade -1 && alembic upgrade head` completes without error.
7. `tests/integration/test_timestamptz.py` asserts every timestamp column is `TIMESTAMPTZ`, not `TIMESTAMP`.

## Tasks / Subtasks

- [ ] Wire Alembic (AC: #1)
  - [ ] Create `kano-backend/alembic.ini` with `script_location = migrations`, `sqlalchemy.url = %(DATABASE_URL)s` (read from env), `file_template = %%(year)d_%%(month).2d_%%(day).2d_%%(hour).2d%%(minute).2d-%%(rev)s_%%(slug)s`
  - [ ] `poetry run alembic init --template generic migrations`
  - [ ] Customize `migrations/env.py`:
    - Import `kano.db` metadata (naming convention defined here)
    - `target_metadata = Base.metadata` via `kano.models`
    - Resolve `sqlalchemy.url` from `os.environ["DATABASE_URL"]` at runtime
    - Enable `compare_type=True`, `compare_server_default=True` for autogenerate accuracy
- [ ] Define `kano.db` with naming convention and declarative `Base` (AC: #1)
  - [ ] `src/kano/db.py` — create `MetaData(naming_convention={"ix": "ix_%(table_name)s_%(column_0_N_name)s", "uq": "uq_%(table_name)s_%(column_0_N_name)s", "ck": "ck_%(table_name)s_%(constraint_name)s", "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s", "pk": "pk_%(table_name)s"})`
  - [ ] `Base = declarative_base(metadata=metadata)`
- [ ] Define SQLAlchemy 2.x typed models in `src/kano/models/` (AC: #1–5)
  - [ ] `project.py` — `Project`: `id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)`, `name: Mapped[str]`, `version: Mapped[str]`, `current_epoch: Mapped[int] = mapped_column(default=1)`, `created_at`, `updated_at` both `TIMESTAMPTZ` with `server_default=func.now()` / `onupdate=func.now()`
  - [ ] `feature.py` — `Feature`: `id`, `project_id` FK → projects(id), `epoch: int`, `feature_key: UUID` (stable cross-epoch identity), `name`, `description`, `is_active: bool NOT NULL DEFAULT TRUE`, `created_at TIMESTAMPTZ`; `__table_args__ = (UniqueConstraint("project_id", "epoch", "feature_key"), Index("ix_feature_project_id_epoch", "project_id", "epoch"))`
  - [ ] `poll.py` — `Poll`: `id`, `project_id`, `epoch`, FK `(project_id, epoch)` → features via composite constraint (see Dev Notes), `created_at`, `expires_at TIMESTAMPTZ NOT NULL`; partial index `CREATE INDEX ix_poll_expires_at ON poll(expires_at) WHERE expires_at > now()` — expressed in the migration manually since Alembic autogenerate doesn't detect partial indexes
  - [ ] `submission.py` — `Submission`: `id`, `poll_id` FK, `submitted_at TIMESTAMPTZ`; index on `poll_id`
  - [ ] `response.py` — `Response`: `submission_id` FK, `feature_id` FK, `fq_answer SMALLINT NOT NULL CHECK (fq_answer BETWEEN 1 AND 5)`, `dq_answer SMALLINT NOT NULL CHECK (dq_answer BETWEEN 1 AND 5)`, `category CHAR(1) NOT NULL CHECK (category IN ('M','L','E','I','C','D'))`, composite PK `(submission_id, feature_id)`
  - [ ] `models/__init__.py` re-exports all five classes and `Base`
- [ ] Author `migrations/versions/0001_initial_schema.py` (AC: #1–5)
  - [ ] Generate skeleton via `alembic revision --autogenerate -m "initial_schema"` then **hand-edit** for: partial index on `poll(expires_at)`, explicit CHECK constraint SQL for composite conditions, correct column order
  - [ ] Verify the migration body contains: all 5 `op.create_table()` calls, all CHECK constraints as string expressions (`"fq_answer BETWEEN 1 AND 5"`), the composite FK `ForeignKeyConstraint(["project_id", "epoch"], ["features.project_id", "features.epoch"])` on `polls`, partial index via `op.execute("CREATE INDEX ix_poll_expires_at ON polls(expires_at) WHERE expires_at > now()")`, `downgrade()` drops in reverse order
- [ ] Integration tests (AC: #6, #7)
  - [ ] `tests/integration/test_timestamptz.py` — query `information_schema.columns` for every `*_at` column across all 5 tables; assert `data_type = 'timestamp with time zone'`
  - [ ] `tests/integration/test_alembic_roundtrip.py` — run `alembic upgrade head`, `alembic downgrade -1`, `alembic upgrade head` against an ephemeral Postgres (use pytest fixture with `testcontainers` or Docker-based `postgres:17`), assert no errors and final schema matches head state
  - [ ] `tests/conftest.py` — fixture `db_url` that provisions a clean ephemeral Postgres and yields its URL; `alembic_head` fixture that runs `alembic upgrade head` against it

## Dev Notes

**This story locks the most irreversible artifact in the project.** Pair-review the migration before merge per PRD risk-mitigation guidance. Every downstream story either depends on this schema or extends it via new migrations — never by editing 0001.

### Schema contract (architecture §Data Architecture, lines 222–279)

```
project    (id PK, name, version, current_epoch DEFAULT 1, created_at, updated_at)
feature    (id PK, project_id FK, epoch, feature_key, name, description, is_active DEFAULT TRUE, created_at,
            UNIQUE(project_id, epoch, feature_key))
poll       (id PK, project_id, epoch, created_at, expires_at,
            FK(project_id, epoch) → feature(project_id, epoch) via composite reference)
submission (id PK, poll_id FK, submitted_at)
response   (submission_id FK, feature_id FK, fq_answer, dq_answer, category, PK(submission_id, feature_id))
```

### Composite FK on `poll(project_id, epoch)` — non-trivial

PostgreSQL requires the referenced columns to be covered by a **unique constraint or primary key**. `feature(project_id, epoch, feature_key)` is unique but the FK would reference only `(project_id, epoch)` — not unique on its own.

**Resolution (architecture-approved):** the composite FK on `poll` does not need to reference `feature` directly. Instead, treat `(project_id, epoch)` as a logical snapshot identifier — enforce epoch immutability via **application invariant** (`epoch_service.bump_epoch_on_feature_change()` in Story 2.6) plus the unique-per-feature constraint. In the migration, declare `poll.project_id` as a single-column FK to `projects(id)`; the `epoch` column is a plain `INTEGER NOT NULL` with no FK but is always written from `project.current_epoch` at poll creation time. Document this contract as a comment in both `models/poll.py` and `migrations/versions/0001_*.py`.

### Application-generated UUIDs (architecture §Enforcement Guidelines, line 512)

- Mapped columns use `default=uuid4` (imported `from uuid import uuid4`), **not** `server_default=text("gen_random_uuid()")`.
- Test that new rows have client-generated UUIDs by inspecting one row after insert in `test_timestamptz.py` or a sibling assertion.

### TIMESTAMPTZ discipline (NFR14, architecture §Format Patterns)

- Every timestamp column declared as `TIMESTAMPTZ` via `sqlalchemy.DateTime(timezone=True)`.
- Never use naive `DateTime()`. Never use `DATE` + `TIME` split.
- `test_timestamptz.py` is the schema-level guard; it runs on every CI build after migration apply.

### Partial index on `poll(expires_at)`

Alembic autogenerate does not emit partial indexes. Hand-author in the migration body:

```python
op.execute("CREATE INDEX ix_poll_expires_at ON polls (expires_at) WHERE expires_at > now()")
# and in downgrade():
op.execute("DROP INDEX IF EXISTS ix_poll_expires_at")
```

### What this story does NOT include

- No data access layer or session factory wiring into Flask — that's Story 1.3 (`create_app()` wires `db.init_app(app)`).
- No domain services, no `epoch_service`, no business logic on top of the schema — those land in Epic 2.
- No seed data — Story 1.9 may add a dev-only seed script.

### Testing standards

- Integration tests only; no unit tests in this story (nothing pure to unit-test).
- `tests/integration/conftest.py` should bring up an ephemeral Postgres 17 per test session (either `testcontainers[postgres]` or a pre-existing `docker-compose` service with a test DB). Architecture §Testing framework calls out `pytest` + `pytest-flask` + `factory-boy` — no `factory-boy` usage in this story, but fixtures get registered here for later stories.
- CI gate: the roundtrip test runs on every PR that touches `migrations/` (enforced by `.github/workflows/ci.yml` in Story 1.10).

### Project Structure Notes

Files created in this story:
- `kano-backend/alembic.ini`
- `kano-backend/migrations/env.py`, `migrations/script.py.mako`
- `kano-backend/migrations/versions/0001_initial_schema.py` (hand-tuned)
- `kano-backend/src/kano/db.py`
- `kano-backend/src/kano/models/__init__.py`, `project.py`, `feature.py`, `poll.py`, `submission.py`, `response.py`
- `kano-backend/tests/conftest.py` (shared DB fixtures)
- `kano-backend/tests/integration/test_timestamptz.py`
- `kano-backend/tests/integration/test_alembic_roundtrip.py`

No conflicts with Story 1.1's scaffold; this story adds on top.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — full schema spec + index list
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns] — table/column/index naming conventions
- [Source: _bmad-output/planning-artifacts/prd.md#FR8–12] — epoch integrity requirements driving the schema shape
- [Source: _bmad-output/planning-artifacts/prd.md#NFR14] — TIMESTAMPTZ UTC-everywhere
- [Source: _bmad-output/planning-artifacts/prd.md#NFR18] — Alembic from commit #1
- [Source: _bmad-output/planning-artifacts/prd.md#Risk Mitigation Strategy] — data model lock-in risk + mitigations
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2] — original AC source

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
