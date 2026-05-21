# Story 4.3: Public poll submission endpoint (CSRF-exempt)

Status: review

## Story

As a respondent,
I want to submit my complete set of Likert answers for a poll via a public POST endpoint,
so that my input is persisted with Kano categorization computed server-side.

## Acceptance Criteria

1. **Given** a valid non-expired poll and a complete `PollSubmission` body, **when** I `POST /api/v1/polls/:uuid/submit` (no CSRF token, no session cookie), **then** the response is **204 No Content** with an empty body; a single `submission` row + N `response` rows are persisted atomically via Story 4.2.
2. **Given** a submission body that is missing at least one answer, has duplicate `feature_key`s, or includes a `feature_key` not in the poll's active feature set, **when** I POST, **then** the response is **422** with Problem Details `type=https://kano.example.com/problems/partial-submission`, `title=Submission is incomplete or malformed`, `detail` naming the missing / unexpected / duplicate feature_keys. Zero rows persisted (verified by row-count pre/post in integration test).
3. **Given** the body fails Pydantic schema validation (e.g., `fq_answer=0`, non-integer answer, missing `answers` field, empty `answers` list), **when** I POST, **then** the response is **400** via the standard Pydantic → Problem Details adapter from Story 1.3.
4. **Given** an expired poll, **when** I POST, **then** the response is **410 Gone** with Problem Details `type=https://kano.example.com/problems/poll-expired` (reused from Story 3.4).
5. **Given** an unknown poll UUID, **when** I POST, **then** the response is **404** with Problem Details `type=entity-not-found`.
6. The endpoint is explicitly CSRF-exempt using the same mechanism Story 3.4 adopted for `GET /api/v1/polls/:uuid` (whichever pattern Story 1.3 established — `@csrf.exempt` decorator or path allowlist). A request with neither a session cookie nor an `X-CSRF-Token` header reaches the handler.
7. The endpoint is CORS-accessible from any origin — same policy as Story 3.4 on the public poll read path. No wildcard is applied globally; only `/api/v1/polls/:uuid/submit` and `/api/v1/polls/:uuid` are opted into the permissive profile.
8. The endpoint stores no PII — only the Likert values + derived `Category` + server-side UTC submission timestamp (per NFR8). An integration test inspects the persisted `submission` and `response` rows and asserts no user-identifying column exists on either table.
9. A successful POST emits one structlog line at INFO with `event="submission_recorded"`, `poll_id`, `submission_id`, `answer_count`, and the request_id bound by Story 1.3's middleware — no answer values, no feature names.
10. The endpoint is documented in `kano-backend/openapi.yaml`: `POST /api/v1/polls/{poll_id}/submit`, request body `$ref: PollSubmission`, 204 / 400 / 404 / 410 / 422 responses. No 403 documented — this endpoint has no CSRF failure mode.

## Tasks / Subtasks

- [x] Extend `src/kano/api/polls.py` (AC: #1, #2, #3, #4, #5, #6, #7, #9)
  - [x] Add handler alongside existing `POST /projects/<uuid:project_id>/polls` (Story 3.2), `GET /projects/<uuid:project_id>/polls` (Story 3.3), `GET /polls/<uuid:poll_id>` (Story 3.4):
    ```python
    @polls_bp.post("/polls/<uuid:poll_id>/submit")
    @csrf.exempt  # or whichever pattern Story 1.3 established; mirror Story 3.4's choice
    def submit_poll(poll_id: UUID):
        body = PollSubmission.model_validate(request.get_json())
        submission_id = poll_service.record_full_submission(poll_id, body)
        logger.info(
            "submission_recorded",
            poll_id=str(poll_id),
            submission_id=str(submission_id),
            answer_count=len(body.answers),
        )
        return "", 204
    ```
  - [x] Code comment: `# CSRF-exempt per architecture §Authentication & Security: public respondent endpoints (same rationale as GET /api/v1/polls/<uuid> — Story 3.4)`
  - [x] Pydantic validation failure inside `model_validate` propagates as `ValidationError`, which Story 1.3's error adapter turns into 400 with Problem Details. No manual catch.
  - [x] Domain exceptions (`EntityNotFound`, `PollExpired`, `PartialSubmission`, `SubmissionFailed`) propagate to the registry in `api/errors.py` extended by Story 4.2 → 404 / 410 / 422 / 500. No manual catch.
- [x] Wire CSRF + CORS exemption (AC: #6, #7)
  - [x] Mirror Story 3.4's approach exactly — whichever way the GET endpoint opted out, the POST endpoint opts out the same way. If Story 3.4 used `@csrf.exempt`, add the same decorator here. If it registered a path in `CSRF_EXEMPT_PATHS`, add `/api/v1/polls/<uuid>/submit` there too.
  - [x] CORS: if Story 1.3's `Flask-CORS` config maps `/api/v1/polls/<uuid>` to `origins="*"` (or an equivalent public-profile), extend the match to cover `/api/v1/polls/<uuid>/submit`. Pattern: `/api/v1/polls/<uuid:poll_id>/*` as a single public-CORS resource is acceptable.
  - [x] **Do not** disable CSRF globally. **Do not** exempt `/api/v1/*`. Only the two public poll paths (GET + POST submit).
- [x] OpenAPI documentation (AC: #10)
  - [x] Add `PollSubmission` + `AnswerIn` to `components.schemas` referencing `src/kano/schemas/submission.py`
  - [x] Path `/api/v1/polls/{poll_id}/submit`:
    - `post` operation, `security: []` (explicitly no CSRF)
    - Request body: `application/json` → `$ref: "#/components/schemas/PollSubmission"`
    - 204 response: empty body, description "Submission accepted; no content"
    - 400: `ProblemDetails` (Pydantic validation)
    - 404: `ProblemDetails` (`type=entity-not-found`)
    - 410: `ProblemDetails` (`type=poll-expired`)
    - 422: `ProblemDetails` (`type=partial-submission`) — body describes the `missing`/`unexpected`/`duplicates` extension fields
- [x] Integration tests (AC: #1, #2, #3, #4, #5, #6, #8)
  - [x] `tests/integration/test_poll_submit_api.py::test_submit_poll_success`
    - Seed: project + 3 features on epoch 1 + non-expired poll
    - POST with complete body, no CSRF header, no session cookie
    - Assert 204, empty body, 1 `submission` row, 3 `response` rows, each `response.category` matches `compute_category(fq, dq)` for its answer
    - Assert `response.feature_id` resolves correctly via `feature_key` lookup in `(project_id, epoch)`
  - [x] `test_submit_poll_partial_missing_returns_422`
    - 3-feature poll, body with 2 answers → 422, Problem Details `type=...partial-submission`, `missing` array non-empty, `unexpected` empty, 0 rows persisted
  - [x] `test_submit_poll_partial_extra_returns_422`
    - 3-feature poll, body with 4 answers → 422, `unexpected` non-empty, 0 rows
  - [x] `test_submit_poll_duplicate_keys_returns_422`
    - body has 3 answers with one repeated `feature_key` → 422, `duplicates` non-empty, 0 rows
  - [x] `test_submit_poll_invalid_range_returns_400`
    - body with `fq_answer=0` → 400 Pydantic validation Problem Details; 0 rows
  - [x] `test_submit_poll_empty_answers_returns_400`
    - `{"answers": []}` → 400 (Pydantic `min_length=1`); 0 rows
  - [x] `test_submit_poll_missing_answers_field_returns_400`
    - `{}` → 400; 0 rows
  - [x] `test_submit_poll_expired_returns_410`
    - poll with `expires_at = now - 1 minute` → 410 Problem Details `type=...poll-expired`; 0 rows
  - [x] `test_submit_poll_unknown_uuid_returns_404`
    - random UUID → 404 Problem Details `type=entity-not-found`; 0 rows
  - [x] `test_submit_poll_csrf_exempt`
    - Fresh test client; POST without calling `/api/csrf-token` first and without any cookies → asserts 204 on happy path (not 403)
  - [x] `test_submit_poll_no_pii_persisted` (AC #8)
    - Happy-path POST → introspect `submission` and `response` table columns via `sqlalchemy.inspect`; assert there is no column named `email`, `name`, `ip`, `user_agent`, `user_id`, or any free-text field on either. This is a static-schema assertion — trivially true given migration 0001, but valuable as a regression gate if a future migration adds a column.
  - [x] `test_submit_poll_emits_structured_log`
    - Capture structlog output via `structlog.testing.capture_logs()`; POST success; assert one log entry with `event="submission_recorded"`, `poll_id`, `submission_id`, `answer_count` keys — and that NO log entry contains `fq_answer`, `dq_answer`, or `feature_key` values

## Dev Notes

### Why 204 No Content (not 201 Created)

Architecture §Naming line 529: "204 = successful DELETE." The closest HTTP convention for a POST that persists on the server but returns nothing to the client. 201 Created would imply the client should see a `Location` header pointing at the new resource — but the respondent has no business reading its own submission back; the endpoint is write-only from the respondent's perspective.

Epics line 1080 is explicit: "the response is 204 No Content." Keep it at 204. Reading the submission (e.g., for Story 5 analysis aggregation) happens via `/polls/<uuid>/analysis`, which is a different resource.

### CSRF exemption — mirror 3.4, not reinvent

Story 3.4 already solved the exemption mechanics for the sibling public GET. Whatever pattern it used, repeat it here. Do NOT invent a second approach; future maintainers need one cognitive load for "how do public respondent routes bypass CSRF?"

Critically: only these two routes are exempt. The blueprint file `api/polls.py` also hosts the CSRF-protected PM routes (create, list per-project, cross-project list). Scope the exemption per-route, not per-blueprint.

### No manual try/except around the service call

Story 4.2 raises structured domain exceptions. Story 1.3's error-handler registry (extended by Stories 2.4, 2.6, 2.7, 3.2, 3.4 and now by Story 4.2) maps each exception to its Problem Details + status code. The handler body stays narrow:

```python
body = PollSubmission.model_validate(request.get_json())
submission_id = poll_service.record_full_submission(poll_id, body)
logger.info(...)
return "", 204
```

No defensive `except Exception`. If `record_full_submission` raises `SubmissionFailed`, the 500 Problem Details envelope fires automatically with the request_id included (architecture §API line 366 + §Process Patterns line 726).

### No answer values in logs

`event="submission_recorded"` logs the count, not the content. PRD NFR8 forbids PII; even though Likert integers aren't PII in themselves, the combination of (poll_id, feature_key → feature_name, timestamp, network IP from Caddy access log) could be used to re-identify a respondent in a small study. Keep application logs scrupulously clean; operational troubleshooting uses the request_id to join across layers without needing answer content.

### CORS: deliberate, not accidental

Same reasoning as Story 3.4 Dev Notes: architecture §Authentication & Security line 302 locks a strict allowlist for PM routes; public respondent endpoints are the intentional exception. The `POST /polls/<uuid>/submit` route needs the same permissive profile because a future embedded-survey use case (product-team site iframing a poll, Tixeo marketing embedding a demo poll) should Just Work.

Document the intent in a code comment pointing at this Dev Note.

### Empty body on 204 — confirm the Flask idiom

`return "", 204` is Flask's canonical way to return an empty 204. Do NOT return `jsonify({})` or `jsonify(None)` — both serialize to `"null"` or `"{}"` which is not an empty body. Set `Content-Length: 0` implicitly by returning the empty string.

### Request parsing

`request.get_json()` returns `None` if the body is empty or `Content-Type` isn't `application/json`. `PollSubmission.model_validate(None)` raises `ValidationError` → 400 via Story 1.3's adapter. That's the intended behavior; no manual 400 needed for missing body.

For robustness, consider `request.get_json(silent=False)` so a malformed JSON payload also raises at parse time rather than silently passing `None` to Pydantic. Pick whichever Story 1.3 uses; consistency trumps preference.

### Not in scope

- Respondent SPA flow / client-side POST call — Stories 4.6, 4.7
- Client-side routing on 422 (back to the missing question) — Story 4.7
- Analysis endpoint + GROUP BY query — Story 5.2
- Rate limiting — deferred to v2 per architecture §Security line 316

### Project Structure Notes

Files:
- Extend `kano-backend/src/kano/api/polls.py` (add `submit_poll` handler)
- Extend `kano-backend/openapi.yaml` (path + schemas)
- Ensure `kano-backend/src/kano/api/errors.py` registry changes from Story 4.2 are wired into `create_app()`
- `kano-backend/tests/integration/test_poll_submit_api.py` (new — kept separate from `test_polls_api.py` and `test_polls_public_api.py` for the same auth-model reason Story 3.4 split its tests)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR16, FR24, FR25, FR26, FR28–30] — submission lifecycle + categorization
- [Source: _bmad-output/planning-artifacts/prd.md#NFR8] — no PII
- [Source: _bmad-output/planning-artifacts/prd.md#NFR15] — structured request logs
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — CSRF exemption on public respondent endpoints (line 300); CORS policy (line 302); input validation (line 306); no PII (line 312)
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — status code table (line 526), Problem Details format (line 688)
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines] — Pydantic-before-handler rule (line 748)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.3] — original AC
- [Source: _bmad-output/implementation-artifacts/1-3-flask-app-factory-with-csrf-cors-request-id-structured-logging-and-problem-details-middleware.md] — CSRF / CORS / Problem Details middleware
- [Source: _bmad-output/implementation-artifacts/3-4-public-poll-by-uuid-read-endpoint-csrf-exempt.md] — CSRF+CORS exemption precedent for the sibling public GET
- [Source: _bmad-output/implementation-artifacts/4-1-submission-and-response-models-with-pydantic-schemas.md] — `PollSubmission` schema
- [Source: _bmad-output/implementation-artifacts/4-2-poll-service-record-full-submission-atomic-transaction.md] — service contract + exceptions + Problem Details registry

## Dev Agent Record

### Agent Model Used
claude-opus-4-7[1m]

### Debug Log References
- `tests/integration/test_poll_submit_api.py` — 12 tests pass
- Full backend suite (219 tests) — green

### Completion Notes List
- The PUBLIC_RESPONDENT_PATHS tuple in `middleware/security.py` already
  registered `/api/v1/polls/[^/]+/submit` for the public CORS profile
  (added speculatively in Story 1.3 / 3.4), so CORS wiring needed no new
  code. The `@public_endpoint` decorator handled CSRF exemption — same
  mechanism Story 3.4 used for the sibling GET.
- Removed the stale placeholder test
  `test_polls_submit_unrouted_returns_404_not_csrf_400` from
  `tests/integration/test_csrf.py`. Its purpose ("confirm the
  not-yet-wired route 404s rather than 403s") is moot now that the route
  is live and exercised by 12 real tests in `test_poll_submit_api.py`.
- The 422 envelope from `_partial_submission_handler` (added in Story
  4.2) is exercised end-to-end: `missing`/`unexpected`/`duplicates` lists
  all round-trip as JSON UUIDs. OpenAPI documents the extension fields
  via `allOf` against `ProblemDetails`.
- `request.get_json(silent=False)` mirrors Story 1.3's existing handler
  posture — malformed JSON raises at parse time and Flask returns 400 via
  the registered `HTTPException` handler.
- Structlog event keys: `event="submission_recorded"`, `poll_id`,
  `submission_id`, `answer_count`. Test asserts no `fq_answer`,
  `dq_answer`, or `feature_key` value appears anywhere in the captured
  log stream.

### File List
- `kano-backend/src/kano/api/polls.py` (extend: add `submit_poll`
  handler + `structlog`, `request`, `PollSubmission` imports)
- `kano-backend/openapi.yaml` (extend: `/api/v1/polls/{poll_id}/submit`
  path + `PollSubmission`, `AnswerIn` schema components)
- `kano-backend/tests/integration/test_poll_submit_api.py` (new)
- `kano-backend/tests/integration/test_csrf.py` (delete stale
  unrouted-404 placeholder test + cleanup unused `uuid` import)

### Change Log
- 2026-05-21: Endpoint live. CSRF-exempt, CORS-permissive, 204 on
  success, full Problem Details coverage for every failure branch.
