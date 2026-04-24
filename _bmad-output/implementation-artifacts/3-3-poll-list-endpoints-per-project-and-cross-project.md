# Story 3.3: Poll list endpoints — per-project and cross-project

Status: ready-for-dev

## Story

As a PM,
I want to retrieve the polls for a given project AND the global list of polls across all my projects,
so that I can render both the per-project poll section and the PM home poll-list screen.

## Acceptance Criteria

1. **Given** a project with several polls (mix of active and expired), **when** I `GET /api/v1/projects/:id/polls`, **then** the response is 200 with a bare JSON array of `PollSummary` items for that project, sorted by `created_at` descending; each item carries a computed `response_count` and a derived `is_expired` boolean.
2. **Given** any number of polls across projects, **when** I `GET /api/v1/polls`, **then** the response is 200 with a bare JSON array of `PollSummaryWithProject` items (every field of `PollSummary` plus `project_name` and `project_version`), sorted by `created_at` descending.
3. **Given** a non-existent `project_id`, **when** I `GET /api/v1/projects/:id/polls`, **then** the response is 404 with Problem Details.
4. Expired polls are **included** in both lists (not filtered out) — the UI renders them in muted styling.
5. Both endpoints are CSRF-protected (consistent with all other `/app/*`-consumed endpoints; they are read-only GETs, but the CSRF cookie is still issued and the session is still in play).
6. Both endpoints execute response-count aggregation as a **single SQL round-trip** — no per-poll `COUNT(*)` in a Python loop. Verified via a `sqlalchemy.event.listens_for(Engine, "before_cursor_execute")` spy in the test (or by asserting the total query count with pytest + `sqlalchemy.event`).
7. Both endpoints are documented in `kano-backend/openapi.yaml`.

## Tasks / Subtasks

- [ ] `services/poll_service.py` (AC: #1, #2, #6)
  - [ ] `def list_polls_for_project(project_id: UUID) -> list[Poll]:`
    - Verify the project exists (raise `EntityNotFound` if not — feeds AC #3)
    - Single query with a LEFT OUTER JOIN aggregation:
      ```python
      stmt = (
          select(Poll, func.count(Submission.id).label("response_count"))
          .outerjoin(Submission, Submission.poll_id == Poll.id)
          .where(Poll.project_id == project_id)
          .group_by(Poll.id)
          .order_by(Poll.created_at.desc())
      )
      rows = db.session.execute(stmt).all()
      now = datetime.now(tz=UTC)
      polls = []
      for poll, response_count in rows:
          poll.response_count = response_count
          poll.is_expired = poll.expires_at <= now
          polls.append(poll)
      return polls
      ```
  - [ ] `def list_polls_all_projects() -> list[tuple[Poll, str, str]]:`
    - Single query joining projects for name/version enrichment:
      ```python
      stmt = (
          select(
              Poll,
              func.count(Submission.id).label("response_count"),
              Project.name.label("project_name"),
              Project.version.label("project_version"),
          )
          .join(Project, Project.id == Poll.project_id)
          .outerjoin(Submission, Submission.poll_id == Poll.id)
          .group_by(Poll.id, Project.name, Project.version)
          .order_by(Poll.created_at.desc())
      )
      ```
    - Populate `poll.response_count`, `poll.is_expired`, `poll.project_name`, `poll.project_version` as dynamic attributes; return the list for `PollSummaryWithProject.model_validate(...)` at the blueprint layer
- [ ] Blueprint handlers in `api/polls.py` (AC: #1–5)
  - [ ] `@polls_bp.get("/projects/<uuid:project_id>/polls")` — calls `list_polls_for_project`; returns `[PollSummary.model_validate(p).model_dump(mode="json") for p in polls]`, 200
  - [ ] `@polls_bp.get("/polls")` — calls `list_polls_all_projects`; returns `[PollSummaryWithProject.model_validate(p).model_dump(mode="json") for p in polls]`, 200
  - [ ] Both handlers are plain GET — CSRF middleware allows GET through unconditionally; no decorator needed; session cookie is still issued for subsequent mutating calls
- [ ] OpenAPI (AC: #7)
  - [ ] `GET /api/v1/projects/{project_id}/polls` — 200 `{type: array, items: $ref: PollSummary}`, 404 `ProblemDetails`
  - [ ] `GET /api/v1/polls` — 200 `{type: array, items: $ref: PollSummaryWithProject}`
- [ ] Integration tests (AC: #1–6)
  - [ ] `tests/integration/test_polls_api.py::test_list_polls_for_project_sorted_desc`
    - Seed: 1 project, 3 polls created 3/2/1 minutes ago respectively
    - GET → assert 200, length 3, order matches most-recent-first
  - [ ] `test_list_polls_for_project_includes_expired`
    - Seed: 1 active + 1 poll with `expires_at` in the past
    - GET → assert both present, `is_expired` flags correct
  - [ ] `test_list_polls_for_project_response_counts`
    - Seed: 1 poll with 0 submissions, 1 poll with 3 submissions
    - GET → assert `response_count` values match exactly (3 and 0)
  - [ ] `test_list_polls_for_project_404_on_missing_project`
  - [ ] `test_list_polls_all_projects_enriched`
    - Seed: 2 projects, 2 polls each
    - GET `/api/v1/polls` → assert length 4, each row has `project_name` and `project_version` matching its project, sorted desc
  - [ ] `test_list_polls_all_projects_empty_returns_empty_array`
    - Fresh DB → GET returns `[]` with status 200 (not 404)
  - [ ] `test_list_polls_single_round_trip` (AC #6)
    - Subscribe to `Engine`'s `before_cursor_execute` event; count queries during one `GET /polls` call with 5 polls and 10 submissions; assert the count is constant (≤ 2: one for the aggregate query, plus any session setup) — specifically, assert it does NOT grow linearly with poll count. A regression test: add more polls + submissions and re-run; query count does not increase.

## Dev Notes

### The N+1 trap

The naive implementation is `polls = db.session.query(Poll)...; for p in polls: p.response_count = db.session.query(Submission).filter_by(poll_id=p.id).count()`. That's N+1 queries and will violate AC #6.

The correct pattern is a single LEFT OUTER JOIN aggregation with `GROUP BY Poll.id`. `Submission.id` counted per group gives `response_count`; LEFT OUTER ensures polls with zero submissions still appear (count becomes 0).

This is a mini version of the analysis query pattern in architecture §Data Architecture line 260–270 — same idea, smaller scope. If you find yourself writing a Python loop with per-poll counts, stop and revisit.

### Why `is_expired` stays a derived field, not a column

PRD Risk Mitigation Strategy (line 321) explicitly defers background cleanup of expired polls to Phase 2. Adding a stored `is_expired` column would require a job to update it as polls age — more moving parts than needed. The derived-at-read-time approach is trivially correct and the partial index `ix_poll_expires_at WHERE expires_at > now()` (Story 1.2) keeps read-path filtering fast for any future "only non-expired" query shape.

### Dynamic-attribute pattern reused from Story 3.2

Story 3.2 set `poll.response_count` and `poll.is_expired` on the return of `create_poll()`; this story does the same on each iterated row. Pydantic's `from_attributes=True` (Story 3.1's `PollSummary.model_config`) picks them up. The `project_name` / `project_version` enrichment in `list_polls_all_projects` is the same technique, extended.

### Cross-project list sort order

Architecture §Naming line 515 specifies `_at`-suffixed timestamps. The PM home's "what's alive" framing (Epic 3 intro + Story 3.7 AC) demands most-recent-first. If Paola has 50 polls across 10 projects, the top of the list is the newest — matches the PM mental model of "what did I launch this week."

### Empty-array vs 404

Convention: collection endpoints return an empty array + 200 when the target collection has no items (not 404). 404 is reserved for "the parent entity doesn't exist" (AC #3). This matches Story 2.3 (list projects) precedent.

### CSRF on reads

PRD NFR4 says CSRF on state-changing requests. GETs are not state-changing; Flask-WTF's `CSRFProtect` skips them automatically. That's fine — the session cookie is still present for subsequent mutations. No per-route `@csrf.exempt` needed here.

### Not in scope

- Public poll-by-UUID read — Story 3.4 (separate route, CSRF-exempt).
- PM UI consuming these endpoints — Stories 3.6 (detail page poll section) and 3.7 (home poll list).
- Filtering/search — explicitly excluded in Epic 3 overview + Story 3.7 AC.

### Project Structure Notes

Files:
- Extend `kano-backend/src/kano/services/poll_service.py` (add `list_polls_for_project`, `list_polls_all_projects`)
- Extend `kano-backend/src/kano/api/polls.py` (two GET handlers)
- Extend `kano-backend/openapi.yaml`
- Extend `kano-backend/tests/integration/test_polls_api.py`

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR18] — PM views list of polls for a project, pinned epoch visible
- [Source: _bmad-output/planning-artifacts/prd.md#NFR1, NFR3] — performance contract and single-query discipline
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — single-query analysis pattern (analogous line 260–270)
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — endpoint map line 332–347
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3] — original AC
- [Source: _bmad-output/implementation-artifacts/2-3-list-projects-endpoint.md] — list-endpoint precedent (empty array, sort, filter-out-deleted)
- [Source: _bmad-output/implementation-artifacts/3-1-poll-sqlalchemy-model-and-pydantic-schemas.md] — `PollSummary` / `PollSummaryWithProject` schemas
- [Source: _bmad-output/implementation-artifacts/3-2-create-poll-endpoint-pinned-to-current-epoch-with-7-day-ttl.md] — `response_count` / `is_expired` population pattern

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
