# Story 4.1: Submission and Response models with Pydantic schemas

Status: ready-for-dev

## Story

As a solo dev,
I want the `Submission` and `Response` SQLAlchemy models and the inbound `PollSubmission` Pydantic schema,
so that the respondent submission endpoint has a typed contract that mirrors the schema locked in migration 0001.

## Acceptance Criteria

1. **Given** `src/kano/models/submission.py`, **when** a submission row exists, **then** `Submission` maps (`id: UUID` PK `default=uuid4`, `poll_id: UUID` FK `polls(id)` `NOT NULL`, `submitted_at: datetime` TIMESTAMPTZ `server_default=func.now()` `NOT NULL`) — exactly matching migration 0001; `__tablename__ = "submissions"`.
2. **Given** `src/kano/models/response.py` (extended, not rewritten — Story 2.6 already placed `Category` here), **when** a response row exists, **then** `Response` maps (`submission_id: UUID` FK `submissions(id)` `NOT NULL`, `feature_id: UUID` FK `features(id)` `NOT NULL`, `fq_answer: int` SMALLINT CHECK 1–5, `dq_answer: int` SMALLINT CHECK 1–5, `category: Category` CHAR(1) CHECK `IN ('M','L','E','I','C','D')`) with composite PK `(submission_id, feature_id)`; `__tablename__ = "responses"`.
3. The `Response.category` column reuses the `Category` enum already defined in `src/kano/models/response.py` by Story 2.6 — do not redefine.
4. `src/kano/schemas/submission.py` exposes:
   - `AnswerIn(BaseModel)` — one answer entry: `feature_key: UUID`, `fq_answer: int` (ge=1, le=5), `dq_answer: int` (ge=1, le=5).
   - `PollSubmission(BaseModel)` — inbound body: `answers: list[AnswerIn]` (min_length=1).
5. Pydantic validates each answer's `fq_answer` and `dq_answer` are integers in 1–5 at the schema layer; violations produce 400 via the standard Pydantic → Problem Details adapter from Story 1.3.
6. Wire format is snake_case end-to-end — no `Field(alias=...)` anywhere (architecture §Format Patterns).
7. `src/kano/models/__init__.py` re-exports `Submission` and `Response` alongside existing `Project`, `Feature`, `Poll`, `Category`.

## Tasks / Subtasks

- [ ] `src/kano/models/submission.py` (AC: #1, #7)
  - [ ] Declarative model:
    ```python
    class Submission(Base):
        __tablename__ = "submissions"
        id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
        poll_id: Mapped[UUID] = mapped_column(
            ForeignKey("polls.id"), nullable=False
        )
        submitted_at: Mapped[datetime] = mapped_column(
            DateTime(timezone=True),
            server_default=func.now(),
            nullable=False,
        )
    ```
  - [ ] Verify against migration 0001 — no drift (no extra columns, no missed ones)
- [ ] Extend `src/kano/models/response.py` (AC: #2, #3, #7)
  - [ ] The file already defines `Category` (Story 2.6). Append the `Response` model below the enum — do **not** move or rewrite the enum:
    ```python
    class Response(Base):
        __tablename__ = "responses"
        submission_id: Mapped[UUID] = mapped_column(
            ForeignKey("submissions.id"), primary_key=True, nullable=False
        )
        feature_id: Mapped[UUID] = mapped_column(
            ForeignKey("features.id"), primary_key=True, nullable=False
        )
        fq_answer: Mapped[int] = mapped_column(SmallInteger, nullable=False)
        dq_answer: Mapped[int] = mapped_column(SmallInteger, nullable=False)
        category: Mapped[Category] = mapped_column(
            String(1), nullable=False
        )
    ```
  - [ ] `Category` is stored as the 1-char `str` value (`M`/`L`/`E`/`I`/`C`/`D`) — Story 2.6 defined it as `class Category(str, Enum)` so this serialization is direct. Do NOT use PG `ENUM`; the CHECK constraints live in the migration per architecture §Naming line 517.
  - [ ] Composite PK is declared via `primary_key=True` on both columns (SQLAlchemy auto-composes). Range/value CHECK constraints live in migration 0001 — do not redeclare at the ORM layer.
- [ ] `src/kano/models/__init__.py` (AC: #7)
  - [ ] Re-export `Submission` and `Response` (keep ordering alphabetical or match existing convention)
- [ ] `src/kano/schemas/submission.py` (AC: #4, #5, #6)
  - [ ] Classes:
    ```python
    class AnswerIn(BaseModel):
        feature_key: UUID
        fq_answer: int = Field(ge=1, le=5)
        dq_answer: int = Field(ge=1, le=5)

    class PollSubmission(BaseModel):
        answers: list[AnswerIn] = Field(min_length=1)
    ```
  - [ ] No `model_config` needed — this is an inbound DTO, never built from ORM instances.
  - [ ] No `Field(alias=...)` anywhere.
- [ ] Unit tests
  - [ ] `tests/unit/test_submission_schemas.py`:
    - `PollSubmission.model_validate({"answers": [{"feature_key": "018f...", "fq_answer": 3, "dq_answer": 2}]})` succeeds
    - Out-of-range `fq_answer=0` or `fq_answer=6` raises `ValidationError`
    - Non-integer `fq_answer="3"` coerces per Pydantic default (acceptable) OR rejects — pin whichever behavior Pydantic 2 gives us and assert it explicitly so it's frozen
    - Missing `answers` field raises `ValidationError`
    - Empty `answers: []` raises `ValidationError` (min_length=1)
    - Extra unknown keys in an answer entry — assert Pydantic default behavior (ignored by default; explicitly test to pin)
  - [ ] `tests/unit/test_submission_model.py` (lightweight — full behavior lives in Story 4.2 integration tests):
    - Instantiate `Submission(poll_id=uuid4())` — `id` and `submitted_at` populate from defaults on flush

## Dev Notes

### Contract-shaping story

This is the **first** story in Epic 4 and sets the submission contract every downstream E4 story consumes:
- Story 4.2's `record_full_submission` takes a `PollSubmission`
- Story 4.3's public endpoint validates the inbound body with `PollSubmission`
- Story 4.6/4.7's respondent SPA serializes the in-memory draft as `PollSubmission`

Resist over-spec — match migration 0001 exactly, follow architecture naming, move on.

### Why `feature_key` (not `feature_id`) on the inbound schema

The respondent-facing `PollPublic` projection (Story 3.1) exposes `feature_key`, not `feature_id`. Respondent submissions round-trip the same identifier: the SPA reads `PollPublic.features[].feature_key`, answers against those keys, and posts them back. The service layer in Story 4.2 resolves `(project_id, epoch, feature_key) → feature_id` before inserting `response` rows.

This matters because `feature_id` is the per-epoch PK — if an epoch bumps, the PK changes, but `feature_key` is stable. Hardcoding `feature_id` on the respondent wire would leak a PM-side identifier and break the Story 3.4 minimal-disclosure posture.

### Category enum reuse — do not duplicate

`src/kano/models/response.py` already defines `Category` (Story 2.6). Your job here is to add the `Response` model **next to** that enum. Do not redefine; do not move the enum. The cross-check test from Story 2.6 (`assert {c.value for c in models.Category} == {c.value for c in services.kano_matrix.Category}`) stays green.

### Why the CHECK constraints are migration-only

Architecture §Naming line 517: "Enum-like fields: CHECK constraints, not PostgreSQL ENUM types." And per Story 1.2, all schema-level constraints live in the Alembic migration, not the ORM declaration. SQLAlchemy's `CheckConstraint` in `__table_args__` would be redundant with migration 0001's CHECK and risks drift. Keep the ORM lean; let migrations be the schema contract.

### UUIDv4 via app layer

Architecture line 512 + Story 3.1 precedent: `id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)` — never `server_default=text("gen_random_uuid()")`. Application owns ID generation.

### `min_length=1` on `answers`

The PRD says submissions must cover all N features (FR24). But *this schema* validates shape, not completeness. Completeness-against-the-poll is a domain check in Story 4.2 (`PartialSubmission` exception → HTTP 422). Here we just assert the body isn't empty — an empty `answers` list is syntactically valid JSON but obviously wrong; rejecting early at the schema layer gives a clean 400 instead of a misleading 422.

### Not in scope

- `record_full_submission` service + transaction semantics — Story 4.2
- POST endpoint + CSRF exemption + Problem Details for partial/expired — Story 4.3
- Any respondent UI — Stories 4.4–4.8
- Any outbound submission response schema — Story 4.3 returns 204 No Content, so no outbound schema is needed in v1

### Project Structure Notes

Files:
- `kano-backend/src/kano/models/submission.py` (new)
- Extend `kano-backend/src/kano/models/response.py` (append `Response` class; leave `Category` untouched)
- Extend `kano-backend/src/kano/models/__init__.py` (re-export `Submission`, `Response`)
- `kano-backend/src/kano/schemas/submission.py` (new)
- `kano-backend/tests/unit/test_submission_schemas.py` (new)
- `kano-backend/tests/unit/test_submission_model.py` (new; small)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — submission + response schema (lines 242–251)
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns] — Pydantic suffix convention, snake_case wire, CHECK-not-ENUM (lines 517, 545, 666)
- [Source: _bmad-output/planning-artifacts/architecture.md#Format Patterns] — snake_case end-to-end
- [Source: _bmad-output/planning-artifacts/prd.md#FR24, FR25, FR29, FR30] — submission completeness + partial discard + 3-column response schema + single-poll linkage
- [Source: _bmad-output/planning-artifacts/prd.md#NFR8] — no PII on respondent surface (no email/name/IP on the submission wire)
- [Source: _bmad-output/planning-artifacts/prd.md#NFR14] — TIMESTAMPTZ UTC
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1] — original AC
- [Source: _bmad-output/implementation-artifacts/1-2-alembic-migration-1-locks-the-five-table-domain-schema.md] — migration 0001 is the schema contract
- [Source: _bmad-output/implementation-artifacts/2-6-feature-model-category-enum-and-epoch-service-centralized-contract.md] — `Category` enum owner + cross-sync test
- [Source: _bmad-output/implementation-artifacts/3-1-poll-sqlalchemy-model-and-pydantic-schemas.md] — schema style precedent (`Poll`, `PollPublic` boundary via `feature_key`)

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
