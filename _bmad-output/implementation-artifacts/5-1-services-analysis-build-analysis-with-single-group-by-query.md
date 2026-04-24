# Story 5.1: services/analysis.build_analysis with single GROUP BY query

Status: ready-for-dev

## Story

As a solo dev,
I want `services/analysis.build_analysis(poll_id) -> PollAnalysis` executing a single `GROUP BY feature_id, category` SQL round-trip and shaping the result in Python,
so that NFR3 is enforced by construction — no per-feature iteration in the application layer.

## Acceptance Criteria

1. **Given** a poll whose `(project_id, epoch)` snapshot pins N active features, and M submissions have been recorded against it, **when** `services.analysis.build_analysis(poll_id)` is invoked, **then** the function emits **exactly one** SQL query of the shape:
   ```sql
   SELECT f.id, f.feature_key, f.name, f.description, r.category, COUNT(*) AS cnt
   FROM feature f
   LEFT JOIN submission s ON s.poll_id = :poll_id
   LEFT JOIN response r ON r.submission_id = s.id AND r.feature_id = f.id
   WHERE f.project_id = :project_id AND f.epoch = :epoch AND f.is_active = TRUE
   GROUP BY f.id, f.feature_key, f.name, f.description, r.category
   ORDER BY f.id, r.category;
   ```
   The LEFT JOINs ensure features with zero responses still appear (with `r.category IS NULL`, which the Python shaping step drops from the distribution).
2. **Given** the grouped rows returned by the query, **when** the function shapes them in pure Python, **then** it returns a `PollAnalysis` Pydantic object: `poll_id: UUID`, `epoch: int`, `total_submissions: int`, `features: list[FeatureAnalysis]` where `FeatureAnalysis = { feature_key: UUID, name: str, description: str | None, distribution: dict[Category, int], dominant_categories: list[Category], dominant_percentage: float }`.
3. **Given** any `FeatureAnalysis.distribution`, **when** the shape is assembled, **then** the dict always contains **all six `Category` keys** (`M`, `L`, `E`, `I`, `C`, `D`) with value `0` for categories not seen in the grouped rows — so the stacked bar always has 6 segments to render (FR33, FR37 hand-off).
4. **Given** a feature with responses, **when** `dominant_categories` is computed, **then** it is a list of **1 or more** `Category` values — a single winner when one category is strictly dominant, or all tied winners when 2+ categories share the top count (FR35). `dominant_percentage` is the shared percentage (rounded per Dev Notes) of that tied count against the feature's response total. When a feature has zero responses, `dominant_categories == []` and `dominant_percentage == 0.0`.
5. **Given** a poll with zero submissions, **when** `build_analysis(poll_id)` is invoked, **then** `total_submissions == 0`, every `FeatureAnalysis` has `distribution={M:0, L:0, E:0, I:0, C:0, D:0}`, `dominant_categories == []`, `dominant_percentage == 0.0` — the frontend uses this to render FR37's empty state.
6. **Given** an unknown `poll_id`, **when** `build_analysis` is invoked, **then** the function raises `EntityNotFound("poll", poll_id)` (reused from Story 2.4 / 3.4); no query is executed beyond the `session.get(Poll, poll_id)` lookup.
7. **Given** an expired poll that has accumulated submissions, **when** `build_analysis` is invoked, **then** it returns the full analysis — analysis remains readable after TTL expiry per FR32 (expiry only blocks **submission** and the public poll-read, not analysis).
8. `tests/integration/test_analysis_service.py` uses SQLAlchemy `event.listen(Engine, "before_cursor_execute", ...)` to count queries executed during one `build_analysis()` call and asserts the count is **exactly 1** SELECT (discounting the `session.get(Poll)` lookup, which is a separate ORM load; see Dev Notes for the counting pattern).
9. A parametrized integration test covers: zero submissions → empty distributions; single dominant category; 2-way tied dominants; 3-way tied dominants; all-same-category (full dominance); zero-total-but-active-feature (LEFT JOIN correctness).
10. An `EXPLAIN` inspection test (`tests/integration/test_analysis_query_plan.py`) runs `EXPLAIN` on the built query and asserts the plan uses the `ix_feature_project_id_epoch` index created in migration 0001 (Story 1.2) — not a sequential scan. Accepts `Index Scan` or `Index Only Scan`; fails on `Seq Scan`.

## Tasks / Subtasks

- [ ] Pydantic schemas (AC: #2, #3, #4, #5)
  - [ ] New file `src/kano/schemas/analysis.py`:
    ```python
    from pydantic import BaseModel, ConfigDict
    from uuid import UUID
    from kano.services.kano_matrix import Category  # Literal["M","L","E","I","C","D"]

    class FeatureAnalysis(BaseModel):
        feature_key: UUID
        name: str
        description: str | None
        distribution: dict[Category, int]  # always all 6 keys
        dominant_categories: list[Category]
        dominant_percentage: float

    class PollAnalysis(BaseModel):
        poll_id: UUID
        epoch: int
        total_submissions: int
        features: list[FeatureAnalysis]

        model_config = ConfigDict(frozen=True)
    ```
  - [ ] Do NOT use `from_attributes=True` — `PollAnalysis` is a service-layer DTO assembled explicitly from query rows, not an ORM projection (mirrors `PollPublic` precedent from Story 3.1 line 54–56).
  - [ ] `Category` reuses the `Literal["M","L","E","I","C","D"]` alias from `kano.services.kano_matrix` (Story 1.5). Do **not** redefine.
- [ ] Service function (AC: #1, #2, #3, #4, #5, #6, #7)
  - [ ] New file `src/kano/services/analysis.py`:
    ```python
    from uuid import UUID
    from sqlalchemy import select, func, literal
    from kano.db import db
    from kano.models import Poll, Feature, Submission, Response
    from kano.exceptions import EntityNotFound
    from kano.schemas.analysis import PollAnalysis, FeatureAnalysis

    _ALL_CATEGORIES: tuple[str, ...] = ("M", "L", "E", "I", "C", "D")

    def build_analysis(poll_id: UUID) -> PollAnalysis:
        poll = db.session.get(Poll, poll_id)
        if poll is None:
            raise EntityNotFound("poll", poll_id)

        # Single GROUP BY round-trip — NFR3 gate.
        stmt = (
            select(
                Feature.id,
                Feature.feature_key,
                Feature.name,
                Feature.description,
                Response.category,
                func.count().label("cnt"),
            )
            .select_from(Feature)
            .outerjoin(Submission, Submission.poll_id == poll_id)
            .outerjoin(
                Response,
                (Response.submission_id == Submission.id)
                & (Response.feature_id == Feature.id),
            )
            .where(
                Feature.project_id == poll.project_id,
                Feature.epoch == poll.epoch,
                Feature.is_active.is_(True),
            )
            .group_by(
                Feature.id,
                Feature.feature_key,
                Feature.name,
                Feature.description,
                Response.category,
            )
            .order_by(Feature.id, Response.category)
        )
        rows = db.session.execute(stmt).all()

        # total_submissions: one count per poll (do NOT add a second query — derive
        # it from the distinct submission_id count in the shaped result).
        # BUT: the grouped query collapses submissions into per-feature/category
        # counts, so we cannot recover distinct submission_ids from it.
        # Resolution: compute total_submissions as the max feature-level total
        # across all features. All features in a complete poll should share the
        # same submission count; ties are per-feature partial data. See Dev Notes
        # for why this is correct and how AC #5 zero-case interacts.
        # ...shape rows → FeatureAnalysis list, then:
        total = _max_feature_total(features_list)
        return PollAnalysis(
            poll_id=poll.id,
            epoch=poll.epoch,
            total_submissions=total,
            features=features_list,
        )
    ```
  - [ ] Shape helper (pure, testable separately):
    ```python
    def _shape_rows(rows) -> list[FeatureAnalysis]:
        """Group DB rows by feature_id, pad distribution with zeros for all 6
        categories, compute dominant_categories (ties → multiple) and
        dominant_percentage (rounded to 1 decimal).
        Rows with category=None (feature has zero responses) contribute 0 to
        the feature's total and are filtered out of the distribution dict.
        """
        ...
    ```
  - [ ] `total_submissions` strategy — pick ONE in Dev Notes and implement; prefer **max-per-feature** (no extra query) with a correctness proof via the AC #9 full-poll test. If max-per-feature proves brittle under partials, fall back to an explicit second query (`SELECT COUNT(*) FROM submissions WHERE poll_id = :poll_id`) and relax AC #1's "exactly 1 query" to "exactly 1 GROUP BY query" — but do NOT cross that bridge without evidence.
- [ ] Dominant-category computation (AC: #4)
  - [ ] Pure function `_dominant(distribution: dict[Category, int], total: int) -> tuple[list[Category], float]`:
    - If `total == 0`: return `([], 0.0)`
    - Find `max_count = max(distribution.values())`
    - If `max_count == 0`: return `([], 0.0)` (defensive; should not occur when total > 0)
    - `winners = sorted([cat for cat, count in distribution.items() if count == max_count])` — sort stable for deterministic wire output
    - `pct = round(max_count / total * 100, 1)` — 1 decimal place (see Dev Notes on rounding)
    - Return `(winners, pct)`
  - [ ] Unit-test this helper directly in `tests/unit/test_analysis_dominant.py` — zero, single winner, 2-tie, 3-tie, 6-way tie (degenerate), rounding edge cases (33.3333 → 33.3)
- [ ] Integration tests — query-count gate (AC: #8)
  - [ ] `tests/integration/test_analysis_service.py::test_build_analysis_single_group_by_query`:
    ```python
    import pytest
    from sqlalchemy import event
    from sqlalchemy.engine import Engine

    @pytest.fixture
    def query_recorder():
        captured = []
        def before_cursor(conn, cursor, statement, parameters, context, executemany):
            captured.append(statement)
        event.listen(Engine, "before_cursor_execute", before_cursor)
        yield captured
        event.remove(Engine, "before_cursor_execute", before_cursor)

    def test_build_analysis_single_group_by_query(seeded_poll, query_recorder):
        # Seed: 3-feature poll with 5 submissions
        build_analysis(seeded_poll.id)
        group_by_queries = [q for q in query_recorder if "GROUP BY" in q.upper()]
        assert len(group_by_queries) == 1, f"Expected 1 GROUP BY query, got {len(group_by_queries)}: {group_by_queries}"
    ```
  - [ ] Separate the `session.get(Poll)` from the count — the fixture discounts `SELECT ... FROM polls WHERE id = ...` queries (filter for `GROUP BY` in the statement). Document the pattern in a code comment.
- [ ] Integration tests — correctness matrix (AC: #5, #7, #9)
  - [ ] Parametrize `tests/integration/test_analysis_service.py::test_build_analysis_shapes`:
    ```python
    @pytest.mark.parametrize("scenario", [
        "zero_submissions",
        "single_dominant",
        "two_way_tie",
        "three_way_tie",
        "all_same_category",
        "zero_responses_for_some_features",  # LEFT JOIN correctness
    ])
    def test_build_analysis_shapes(scenario, db_session):
        ...
    ```
  - [ ] `zero_submissions`: seed poll with 3 features, 0 submissions → assert `total_submissions == 0`, each feature has `distribution={M:0, L:0, E:0, I:0, C:0, D:0}`, `dominant_categories == []`, `dominant_percentage == 0.0`
  - [ ] `single_dominant`: 1 feature, 10 submissions, 7 with category=M, 2 with P, 1 with D → `dominant_categories == [M]`, `dominant_percentage == 70.0`, `distribution` includes all 6 keys with correct counts (M:7, L:0, E:2, I:0, C:0, D:1 — assuming P=Performance=L, Delighter=E; verify against the matrix)
  - [ ] `two_way_tie`: 5 submissions, 2×M, 2×L, 1×E → `dominant_categories == [L, M]` sorted, `dominant_percentage == 40.0`
  - [ ] `three_way_tie`: 3 submissions, 1×M, 1×L, 1×E → `dominant_categories == [E, L, M]` sorted, `dominant_percentage` ≈ `33.3`
  - [ ] `all_same_category`: 5 submissions all Indifferent (I) → `dominant_categories == [I]`, `dominant_percentage == 100.0`, other categories 0
  - [ ] `zero_responses_for_some_features`: 3-feature poll, 2 submissions that only covered features 1 and 2 (not possible under the full-submission contract of Story 4.2, but simulate via direct DB insert to test the query layer resiliency) → feature 3's distribution is all zeros, `dominant_categories == []`, but features 1 and 2 have correct data
  - [ ] `test_build_analysis_expired_poll`: poll with `expires_at = now - 1 day` + 3 submissions → assert `build_analysis` returns full analysis (FR32 — analysis outlives expiry)
  - [ ] `test_build_analysis_unknown_poll_raises_entity_not_found`: random UUID → assert `EntityNotFound` raised, message includes `"poll"` and the UUID
  - [ ] `test_build_analysis_snapshot_frozen_after_epoch_bump`: seed poll at epoch 1 with 2 features + 3 submissions → bump project to epoch 2 (adding a feature via Story 2.7's path) → call `build_analysis` on the original poll → assert returned `features` contains only the 2 epoch-1 features, not the 3 epoch-2 features; mirrors the snapshot-frozen tests in Stories 3.2/3.4/4.2
- [ ] Query plan assertion (AC: #10)
  - [ ] `tests/integration/test_analysis_query_plan.py`:
    ```python
    def test_analysis_query_uses_feature_index(seeded_poll, db_session):
        # Build the same statement the service builds; extract compiled SQL
        stmt = _build_statement_for_test(seeded_poll)
        compiled = stmt.compile(db_session.bind, compile_kwargs={"literal_binds": True})
        explain_sql = f"EXPLAIN {compiled}"
        result = db_session.execute(text(explain_sql)).scalars().all()
        plan = "\n".join(result)
        assert "ix_feature_project_id_epoch" in plan or "Index Scan" in plan, plan
        assert "Seq Scan on feature" not in plan, f"Analysis query fell back to Seq Scan: {plan}"
    ```
  - [ ] Note: the assertion needs a seeded dataset large enough that the planner picks the index over a seq scan on tiny tables. Seed ≥50 features and ≥200 responses across ≥5 polls (reuse the Story 5.8 seeder if it lands before this test; otherwise add a small helper in `tests/conftest.py` — document the reuse intent).
- [ ] Logging (per architecture §Process Patterns)
  - [ ] Emit one structlog line at INFO on the service entry/exit — `event="build_analysis"`, `poll_id=...`, `feature_count=...`, `total_submissions=...`, bound to `request_id`. No PII.

## Dev Notes

### The single-query discipline is THE NFR3 gate

Architecture §Data Architecture (line 260–270) and PRD NFR3 (line 422) make the single round-trip a **construction guarantee**, not a performance target. This story is where that guarantee is realized. Any reviewer who sees a loop of per-feature `.execute()` calls in `analysis.py` should reject the PR on sight — the single GROUP BY is the defining property of this module.

Resist these anti-patterns:
- **Per-feature `COUNT(*)` loop**: "for each feature, count responses by category" — that's N+1 queries, silently drifts past NFR3.
- **Fetching submissions + responses separately and joining in Python**: two round-trips, still violates NFR3's letter even if fast in practice.
- **ORM-level relationship access in the shape step**: `feature.responses` lazy-load inside the loop would re-query. Build the Pydantic objects from the tuple `rows`, not from ORM instances with relationships.

### `total_submissions` — why max-per-feature works under the FR25 contract

Story 4.2's `record_full_submission` ensures every submission has **exactly one response per active feature** (FR24). So for a complete poll, every feature's total-responses count equals the poll's submission count. `total_submissions = max(feature_totals)` is therefore correct under the system invariant.

**What if the invariant is violated?** A partial response slipped through (DB corruption, manual SQL, a future bug). Three outcomes:
1. All features have the same total → answer is correct.
2. One feature is over-counted → `max` picks the inflated number, but that's also the "most submitted count" which is a defensible display choice.
3. One feature is under-counted → `max` still picks the correct ceiling from the healthy features.

This is good enough for v1 analysis (FR31–FR34). If a future bug creates divergent per-feature counts, the integration test for `zero_responses_for_some_features` catches it because `max` would flag the mismatch against the explicitly-seeded row count. Document the choice in the function docstring.

**If you discover during implementation that max-per-feature produces wrong results on any AC scenario**, fall back to an explicit `SELECT COUNT(*) FROM submissions WHERE poll_id = :poll_id`. Update AC #1 to say "exactly 1 GROUP BY query plus 1 COUNT query = 2 round-trips" — NFR3's spirit (no per-feature iteration) is preserved, and the query count test asserts `GROUP BY queries == 1`, which this story's test already does (see AC #8). **Do not** cross that bridge speculatively — only if the parametrized tests fail on max-per-feature.

### Dominant-percentage rounding

**Rule**: 1 decimal place, banker's-rounding disabled (plain `round()` in Python uses banker's rounding via IEEE 754 — use the standard `round(x, 1)` which is fine for display; percentages in the wire format are `float`, not `Decimal`).

Edge cases the tests must pin:
- `33.3333...` → `33.3` (3-way tie, round down)
- `66.6666...` → `66.7` (2:1 split, round up)
- `50.0` → `50.0` (exact, 2:2 tie)
- `0 / 0` → do not call `round` on a division by zero; the `if total == 0` guard prevents this.

The wire format represents this as `"dominant_percentage": 33.3`. Story 5.5's table composition consumes this value verbatim; do not pre-format as string.

### Why ORDER BY inside the query

`ORDER BY f.id, r.category` is deliberate: the shape step iterates the grouped rows once, accumulating per-feature distributions as it goes. A stable ordering means `_shape_rows` can use a "current feature" state machine with `O(rows)` complexity and no dict-based regrouping. If you change the ORDER BY, the shape step must be rewritten to group-by-dict.

### `is_active=TRUE` filter — defense-in-depth

Story 2.7's epoch-bump contract ensures soft-deleted features in the **current** epoch don't get cloned into epoch N+1; they remain `is_active=FALSE` in their originating epoch. For a poll pinned to epoch N, `is_active` was TRUE at creation and stays TRUE — bumping epoch doesn't retroactively flip it. So in practice, the filter is always TRUE. Include it anyway: if a future migration ever does retro-edit `is_active`, the analysis query quietly does the right thing.

### `Category` Literal vs the database CHAR(1)

`kano_matrix.Category` (Story 1.5) is `Literal["M","L","E","I","C","D"]`. The DB stores CHAR(1) with a CHECK constraint (migration 0001). SQLAlchemy's `Response.category: Mapped[str]` comes back as plain `str`; Pydantic's `dict[Category, int]` coerces at validation. Do NOT introduce an enum type in the DB (architecture §Naming line 517: CHECK constraints, not PG ENUMs).

### Story 5.2 couples to this shape tightly

The endpoint in Story 5.2 is a thin wrapper: `return build_analysis(poll_id).model_dump(mode="json"), 200`. Every field in `PollAnalysis` / `FeatureAnalysis` is wire-exposed. Breaking changes to this shape ripple to 5.2, 5.4 (`KanoStackedBar` consumes `distribution`), 5.5 (page table consumes `dominant_categories` + `dominant_percentage`), 5.6 (`PerCategoryPanels` groups by `dominant_categories`), 5.8 (perf test asserts payload timing). Get the shape right **here**; do not iterate it in 5.2.

### Coverage gate

Per PRD §Technical Success (line 94) and architecture §Cross-Cutting Concerns item 10 (line 79): `analysis` is on the **≥85% line / 100% branch coverage** list. Every error path (`EntityNotFound`, empty features, empty submissions) needs an explicit test. The dominant-category computation is a pure function — hit every branch in `_dominant`.

### Not in scope

- The HTTP endpoint + CSRF-exempt wiring — Story 5.2
- Frontend rendering of any analysis shape — Stories 5.3 through 5.7
- Performance benchmark (3s p95 on 20×500) — Story 5.8
- Caching / materialized views — architecture §Data Architecture line 290–292 defers Redis to v2

### Project Structure Notes

Files:
- `kano-backend/src/kano/schemas/analysis.py` (new — `PollAnalysis`, `FeatureAnalysis`)
- `kano-backend/src/kano/services/analysis.py` (new — `build_analysis`, `_shape_rows`, `_dominant`)
- `kano-backend/tests/integration/test_analysis_service.py` (new — query-count, scenario matrix, snapshot-frozen)
- `kano-backend/tests/integration/test_analysis_query_plan.py` (new — EXPLAIN assertion)
- `kano-backend/tests/unit/test_analysis_dominant.py` (new — pure function coverage)

The `services/analysis.py` slot is reserved in architecture §Structure Patterns (line 585) and is currently unoccupied — this story creates it.

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR31–FR37] — analysis requirements + tie handling + empty state
- [Source: _bmad-output/planning-artifacts/prd.md#NFR1, NFR3] — 3s p95 + single SQL round-trip
- [Source: _bmad-output/planning-artifacts/prd.md#Technical Success] — coverage gate on analysis service
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — single-query analysis pattern (lines 260–270), `feature(project_id, epoch)` index (line 274)
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — endpoint map locks `/polls/:uuid/analysis` shape (line 346)
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision Impact Analysis] — "Schema → Analysis query → NFR3" invariant (line 476)
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines] — parameterized queries only, no raw SQL outside migrations (line 751); Pydantic validation discipline (line 748)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1] — original AC
- [Source: _bmad-output/implementation-artifacts/1-2-alembic-migration-1-locks-the-five-table-domain-schema.md] — schema + `ix_feature_project_id_epoch` index
- [Source: _bmad-output/implementation-artifacts/1-5-kano-categorization-matrix-pure-function-module-with-25-cell-parametrized-test.md] — `Category` Literal + 25-cell matrix (source of truth for category tokens)
- [Source: _bmad-output/implementation-artifacts/3-1-poll-sqlalchemy-model-and-pydantic-schemas.md] — `Poll` model + `PollPublic` DTO precedent (no from_attributes, explicit service-layer assembly)
- [Source: _bmad-output/implementation-artifacts/3-4-public-poll-by-uuid-read-endpoint-csrf-exempt.md] — `EntityNotFound("poll", …)` reuse pattern; snapshot-frozen test precedent
- [Source: _bmad-output/implementation-artifacts/4-2-poll-service-record-full-submission-atomic-transaction.md] — FR24/FR25 full-submission invariant underpinning `total_submissions = max(feature_totals)`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
