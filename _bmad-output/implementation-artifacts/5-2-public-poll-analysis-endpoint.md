# Story 5.2: Public poll analysis endpoint

Status: done

## Story

As a PM or anyone with the poll URL,
I want `GET /api/v1/polls/:uuid/analysis` returning the fully computed analysis payload,
so that the analysis page renders from a single request with no client-side aggregation.

## Acceptance Criteria

1. **Given** a valid poll UUID, **when** I `GET /api/v1/polls/:uuid/analysis` from any origin with no session cookie and no CSRF token, **then** the response is 200 with a `PollAnalysis`-shaped JSON body: `{poll_id, epoch, total_submissions, features: [{feature_key, name, description, distribution: {M, L, E, I, C, D}, dominant_categories: [Category], dominant_percentage}]}` — exactly the `PollAnalysis.model_dump(mode="json")` output from Story 5.1.
2. **Given** any response (populated or empty), **when** the `distribution` field is rendered, **then** the JSON object contains **all six category keys** (`"M"`, `"L"`, `"E"`, `"I"`, `"C"`, `"D"`) even when count is `0` — so Story 5.4's `KanoStackedBar` always has 6 segments to render.
3. **Given** a poll with zero submissions, **when** I `GET /api/v1/polls/:uuid/analysis`, **then** the response is 200 with `total_submissions: 0`, each feature containing `distribution: {M:0, L:0, E:0, I:0, C:0, D:0}`, `dominant_categories: []`, `dominant_percentage: 0.0` — frontend uses this to render the FR37 empty state.
4. **Given** a UUID that doesn't match any poll, **when** I `GET /api/v1/polls/:uuid/analysis`, **then** the response is 404 with Problem Details (`type=https://kano.example.com/problems/entity-not-found`, `title`, `detail`, `status=404`, `request_id`).
5. **Given** an expired poll that has accumulated submissions, **when** I `GET /api/v1/polls/:uuid/analysis`, **then** the response is 200 with the full analysis — analysis remains readable after the 7-day TTL per FR32 (contrast with Story 3.4's poll-read, which returns 410 on expired).
6. The endpoint is **CSRF-exempt** using the same mechanism Story 3.4 and 4.3 established for `/api/v1/polls/:uuid` and `/api/v1/polls/:uuid/submit` — consistent with architecture §Authentication & Security (line 300: public respondent endpoints are CSRF-exempt by design).
7. The endpoint is **CORS-open** from any origin (architecture line 302 scopes the allowlist to PM-facing routes only; public poll endpoints accept cross-origin requests).
8. Performance reality check: on a seeded 20-feature × 500-submission dataset, the endpoint responds in **under 500 ms p95** server-side (measured in the integration test via `time.perf_counter()` wrapping the handler call). This is the backend's share of the NFR1 3-second p95 budget; the full E2E navigation-timing gate is Story 5.8.
9. The endpoint is documented in `kano-backend/openapi.yaml`: path `/polls/{poll_id}/analysis`, `get` operation, `security: []`, 200 response schema `PollAnalysis`, 404 Problem Details; schemas `PollAnalysis` and `FeatureAnalysis` added to `components.schemas` (Story 5.1 defines the Pydantic shape; mirror here).
10. One structlog line is emitted at INFO per successful request, `event="poll_analysis_read"`, with `poll_id`, `epoch`, `feature_count`, `total_submissions`, bound to `request_id`. No PII (no respondent data in logs per NFR8).

## Tasks / Subtasks

- [x] Blueprint route (AC: #1, #4, #5, #6, #7)
  - [x] Extend `src/kano/api/analysis.py` (new file, or extend if the blueprint slot reserved in architecture §Structure exists):
    ```python
    from uuid import UUID
    from flask import Blueprint, current_app
    from flask_wtf.csrf import CSRFProtect  # or the project's csrf instance
    from kano.services.analysis import build_analysis

    analysis_bp = Blueprint("analysis", __name__, url_prefix="/api/v1/polls")

    @analysis_bp.get("/<uuid:poll_id>/analysis")
    @csrf.exempt  # per architecture §Authentication & Security; public endpoint
    def get_poll_analysis(poll_id: UUID) -> tuple[dict, int]:
        analysis = build_analysis(poll_id)  # raises EntityNotFound → 404 via errors.py registry
        current_app.logger.info(
            "poll_analysis_read",
            poll_id=str(poll_id),
            epoch=analysis.epoch,
            feature_count=len(analysis.features),
            total_submissions=analysis.total_submissions,
        )
        return analysis.model_dump(mode="json"), 200
    ```
  - [x] Register the blueprint in `src/kano/__init__.py` (`create_app()` factory) — ordering does not matter relative to the other public blueprints (`polls` for 3.4, `responses` for 4.3); group them together with a comment `# public / CSRF-exempt blueprints`.
  - [x] CSRF exemption: follow whichever of the two patterns Story 1.3 + 3.4 established (per-view `@csrf.exempt` decorator OR path allowlist in `middleware/security.py`). Do NOT introduce a third pattern. Add a code comment pointing at this AC and at architecture line 300.
  - [x] CORS: ensure Flask-CORS is configured so that `/api/v1/polls/*/analysis` accepts any origin. Most likely this happens automatically because `/api/v1/polls/<uuid>` already matches the permissive pattern from Story 3.4; verify with a cross-origin integration test.
- [x] Error handler wiring (AC: #4)
  - [x] `EntityNotFound("poll", poll_id)` is already mapped to 404 Problem Details in `src/kano/api/errors.py` (Story 2.4 / 3.4). Verify the registry entry exists; add a comment in this story's code pointing at it. Do **not** add a second error handler — the shared one suffices.
  - [x] Spot-check: the Problem Details `type` URL for the 404 case is `https://kano.example.com/problems/entity-not-found`; title "Poll not found"; detail describes the UUID and includes `request_id`.
- [x] Integration tests (AC: #1, #2, #3, #4, #5, #6)
  - [x] `tests/integration/test_analysis_api.py::test_get_analysis_happy_path`:
    - Seed: project + 3 features on epoch 1 + non-expired poll + 5 submissions with known Likert → known category distribution
    - GET `/api/v1/polls/<id>/analysis` without CSRF header or session
    - Assert 200; body keys exactly `{"poll_id", "epoch", "total_submissions", "features"}`
    - Assert `total_submissions == 5`
    - Assert each feature has exactly `{"feature_key", "name", "description", "distribution", "dominant_categories", "dominant_percentage"}`
    - Assert `distribution` always has exactly 6 keys: `{"M", "L", "E", "I", "C", "D"}` (verify against known input → known counts)
    - Assert `dominant_categories` is a list (not a string), and `dominant_percentage` is a number (float)
  - [x] `test_get_analysis_zero_submissions`: seed 3-feature poll with 0 submissions → GET → assert 200, `total_submissions == 0`, each feature `distribution` all zeros, `dominant_categories == []`, `dominant_percentage == 0.0`
  - [x] `test_get_analysis_tie_handling`: seed poll with 4 submissions, 2 × M, 2 × L on one feature → GET → assert that feature's `dominant_categories == ["L", "M"]` (sorted), `dominant_percentage == 50.0`
  - [x] `test_get_analysis_unknown_poll_returns_404`: random UUID → assert 404, Problem Details body, `type=...entity-not-found`, `request_id` present
  - [x] `test_get_analysis_expired_poll_returns_200`: poll with `expires_at = now - 1 day` + 3 submissions → assert 200 with full payload (contrast with Story 3.4's 410-on-expired for `GET /api/v1/polls/:uuid`)
  - [x] `test_get_analysis_csrf_exempt`: fresh test client, never calls `/api/csrf-token`, GET without `X-CSRF-Token` → asserts 200 not 403
  - [x] `test_get_analysis_cors_open`: GET with `Origin: https://random-third-party.example` → asserts 200 and `Access-Control-Allow-Origin` header in response (value `*` or echoing the Origin — whichever Flask-CORS is configured to emit for this path)
  - [x] `test_get_analysis_snapshot_frozen_after_epoch_bump`: seed poll on epoch 1 with 2 features + 3 submissions → bump project to epoch 2 via Story 2.7 → GET the original poll's analysis → assert returned `epoch == 1`, `features` contains only the 2 epoch-1 features (parallel to Story 3.4's frozen-snapshot test)
- [x] Performance smoke (AC: #8)
  - [x] `tests/integration/test_analysis_api_perf.py::test_get_analysis_under_500ms`:
    - Seed: 20 features + 500 submissions × 20 responses each = 10,000 response rows
    - Time 10 consecutive GETs via `time.perf_counter()`; assert 95th percentile < 500 ms
    - Mark with `@pytest.mark.slow` to allow skipping in fast-feedback local runs; CI runs the full suite
  - [x] This is a **backend-only** perf gate. The end-to-end NFR1 (3s p95 total) is Story 5.8 via Playwright navigation timing. This smoke is early-warning; if 500 ms is already blown server-side, the 3s total gate is unreachable.
- [x] OpenAPI documentation (AC: #9)
  - [x] Extend `kano-backend/openapi.yaml`:
    - Path `/polls/{poll_id}/analysis`:
      - `get` operation
      - `security: []` (no CSRF, no auth)
      - `parameters`: `poll_id` as UUID path param
      - `responses`:
        - `200`: `$ref: '#/components/schemas/PollAnalysis'`
        - `404`: `$ref: '#/components/schemas/ProblemDetails'`
    - `components.schemas.PollAnalysis`:
      ```yaml
      type: object
      required: [poll_id, epoch, total_submissions, features]
      properties:
        poll_id: { type: string, format: uuid }
        epoch: { type: integer, minimum: 1 }
        total_submissions: { type: integer, minimum: 0 }
        features:
          type: array
          items: { $ref: '#/components/schemas/FeatureAnalysis' }
      ```
    - `components.schemas.FeatureAnalysis`:
      ```yaml
      type: object
      required: [feature_key, name, description, distribution, dominant_categories, dominant_percentage]
      properties:
        feature_key: { type: string, format: uuid }
        name: { type: string }
        description: { type: string, nullable: true }
        distribution:
          type: object
          required: [M, L, E, I, C, D]
          additionalProperties: false
          properties:
            M: { type: integer, minimum: 0 }
            L: { type: integer, minimum: 0 }
            E: { type: integer, minimum: 0 }
            I: { type: integer, minimum: 0 }
            C: { type: integer, minimum: 0 }
            D: { type: integer, minimum: 0 }
        dominant_categories:
          type: array
          items: { type: string, enum: [M, L, E, I, C, D] }
        dominant_percentage: { type: number, minimum: 0, maximum: 100 }
      ```
- [x] Logging (AC: #10)
  - [x] Emit one structlog line at INFO per successful request (per architecture §Logging line 443). Event key `poll_analysis_read`. No respondent data; no feature descriptions that could leak internal wording; keep it to counts + IDs only.

## Dev Notes

### Why this is a thin wrapper

Story 5.1 does all the heavy lifting: query, shape, validate, raise typed exceptions. The HTTP layer here is ~10 lines: invoke service, serialize Pydantic, return JSON. Resist the urge to add business logic in the handler — anything that shapes or filters the payload belongs in `services/analysis.py` alongside the query it depends on.

Keep the handler **exception-aware but not exception-handling**: let `EntityNotFound` bubble up to the `@app.errorhandler` registry in `api/errors.py`. Do not wrap in try/except — doing so would duplicate error translation and diverge from the precedent set by Story 3.4's `get_poll_public` handler.

### 200-on-expired is deliberate; contrast with Story 3.4

FR32 (line 404): "The analysis page is publicly accessible to anyone who has the poll URL (no authentication)." The PRD doesn't scope this to non-expired polls — and Paola's natural flow is to review poll results **after** it expires. If the analysis returned 410 on expiry, the PM's whole "read the results" workflow breaks at day 8.

Story 3.4's 410 on the respondent-facing `GET /api/v1/polls/:uuid` is for a different reason: respondents attempting to submit need a clear "this is gone" signal. The analysis endpoint has no such handshake — it's a read-only aggregate.

Pin the contrast explicitly in `test_get_analysis_expired_poll_returns_200` with a code comment.

### CSRF exemption — verify the pattern Story 1.3 established

Story 1.3 installed `CSRFProtect(app)` in the app factory. Story 3.4 established the per-view `@csrf.exempt` precedent. Story 4.3 continued it. This story extends the same pattern — three public endpoints now, consistent mechanism. If 4.3 switched to a path allowlist in `middleware/security.py`, use that. Whichever pattern exists, extend it.

**Do NOT**:
- Disable CSRF globally
- Exempt all of `/api/v1/*`
- Invent a new exemption mechanism

**DO**:
- Add a code comment on the `@csrf.exempt` line pointing at this story's AC #6 and architecture line 300
- Verify the `test_get_analysis_csrf_exempt` test actually exercises a client with **no** CSRF token, not a client that happens to have a cached one

### Query-count discipline at the endpoint level

Story 5.1's service-layer test already asserts "exactly 1 GROUP BY query". This story adds an endpoint-level verification path: the HTTP handler should not introduce additional queries. The only DB round-trip per request should be the GROUP BY query + the `session.get(Poll)` lookup inside `build_analysis`. If you catch yourself adding a `Poll.query.filter_by(id=poll_id).first()` in the handler to pre-check existence, **stop** — `build_analysis` already does this, and duplicating it is the N+1 anti-pattern in miniature.

### Performance headroom for NFR1

500 ms server-side is the working ceiling from the 3-second NFR1 budget:
- Network + TLS: ~100 ms
- Caddy proxy: ~10 ms
- **Server processing: ≤500 ms**
- Client parse + Vue render + KanoStackedBar SVG: ~1000 ms
- Remaining slack: ~1400 ms

This budget is judgment-based, not in the architecture doc. If this story's perf smoke routinely hits 400 ms on the 20×500 seed, that's fine. If it hits 800 ms, Story 5.8 cannot pass NFR1 — open a follow-up on query optimization or index review before Story 5.8 lands.

### CORS — what "open" actually means

Architecture line 302: "Flask-CORS configured with an explicit origin allowlist (production domain only). No wildcards." That rule is for **PM-facing** routes. For public poll endpoints (3.4, 4.3, and now 5.2), the intent is the opposite: any origin can read. The UUID is the access control.

Recommended Flask-CORS config:
```python
CORS(app, resources={
    r"/api/v1/polls/*/analysis": {"origins": "*"},
    r"/api/v1/polls/*/submit": {"origins": "*"},
    r"/api/v1/polls/*": {"origins": "*"},  # covers Story 3.4
    r"/api/v1/*": {"origins": [PROD_ORIGIN]},  # PM default
})
```
The specific-first rule order matters; Flask-CORS matches in declaration order.

### OpenAPI schema — keep the enum in sync with kano_matrix

The enum list `[M, L, E, I, C, D]` appears in:
1. Migration 0001 CHECK constraint (Story 1.2)
2. `kano_matrix.Category` Literal (Story 1.5)
3. Pydantic `PollAnalysis.FeatureAnalysis.distribution` dict keys (Story 5.1)
4. `openapi.yaml` `FeatureAnalysis.distribution` enum
5. Future Story 5.3 `CatBadge` variant list (frontend)

These are four copies of the same truth. There's no single-source-of-truth automation in v1. If you ever add a 7th category (won't happen, Kano is fixed at 6), you'd edit all five sites. Document this trivia in a comment on the Pydantic class so the next maintainer doesn't assume it's generated.

### Not in scope

- The service-layer `build_analysis` logic — Story 5.1
- Frontend rendering — Stories 5.3–5.7
- E2E navigation-timing NFR1 gate — Story 5.8
- Rate limiting on public endpoints — deferred to v2 per architecture §Security line 316
- Payload compression / caching headers — v2 when operational pain warrants

### Project Structure Notes

Files:
- `kano-backend/src/kano/api/analysis.py` (new — or extend if the blueprint slot exists from an earlier story; it does NOT — architecture §Structure Patterns line 591 reserves it and this story fills it)
- `kano-backend/src/kano/__init__.py` (extend — register `analysis_bp`)
- `kano-backend/openapi.yaml` (extend — path + schemas)
- `kano-backend/tests/integration/test_analysis_api.py` (new — happy path, empty, tie, 404, expired, CSRF, CORS, snapshot-frozen)
- `kano-backend/tests/integration/test_analysis_api_perf.py` (new — 500 ms ceiling on 20×500 seed)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR31, FR32, FR35, FR37] — public analysis access + tie handling + empty state
- [Source: _bmad-output/planning-artifacts/prd.md#NFR1, NFR3] — 3s p95 + single SQL round-trip
- [Source: _bmad-output/planning-artifacts/prd.md#NFR8] — no PII in logs
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — endpoint map line 346, `/polls/:uuid/analysis` public read; HTTP status conventions (line 526)
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — CSRF exempt for public endpoints (line 300); CORS scope (line 302)
- [Source: _bmad-output/planning-artifacts/architecture.md#Error handling] — Problem Details registry (line 724)
- [Source: _bmad-output/planning-artifacts/architecture.md#Logging] — one structlog line per request, no PII (line 443, 737)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2] — original AC
- [Source: _bmad-output/implementation-artifacts/3-4-public-poll-by-uuid-read-endpoint-csrf-exempt.md] — CSRF-exempt + CORS-open precedent; `EntityNotFound` handler pattern
- [Source: _bmad-output/implementation-artifacts/4-3-public-poll-submission-endpoint-csrf-exempt.md] — second precedent for CSRF-exempt public POST; OpenAPI pattern
- [Source: _bmad-output/implementation-artifacts/5-1-services-analysis-build-analysis-with-single-group-by-query.md] — `build_analysis`, `PollAnalysis`, `FeatureAnalysis` contracts (CONSUMED BY THIS STORY)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m]

### Debug Log References

- Initial run: handler-missing `404 https://kano.example.com/problems/http-404` confirmed RED phase (route absent).
- Post-implementation: 11/11 integration tests in `test_analysis_api.py` green; 1/1 perf smoke in `test_analysis_api_perf.py` green; p95 well under the 500 ms ceiling on the testcontainer 20×500 seed (~tens of ms).
- Pre-existing flake (not introduced by 5.2): `test_app_factory.py::test_structured_request_log_emits_one_line_with_expected_keys` fails when run after `test_poll_submit_api.py`. Reproduced on `main` (commit `d6ec637`) with my changes stashed — test-isolation leak between structlog and Flask's logging config, orthogonal to this story.
- Pre-existing mypy errors in `test_polls_api.py`, `test_polls_public_api.py`, `test_poll_submit_api.py`, `test_submission_model.py` (14 total) — not touched by this story.

### Completion Notes List

- **Handler shape** matches the Dev Notes "thin wrapper" guidance verbatim: ~10 lines, no `try/except`, lets `EntityNotFound` from `build_analysis` bubble to the shared registry in `kano.api.errors`.
- **CSRF exemption** uses the existing `@public_endpoint` decorator from `kano.middleware.security` — same pattern Stories 3.4 (`get_poll_public`) and 4.3 (`submit_poll`) use. No third pattern introduced.
- **CORS open** extended `PUBLIC_RESPONDENT_PATHS` with `r"/api/v1/polls/[^/]+/analysis"`. Flask-CORS legitimately renders the response header as `*` or by echoing the Origin (both valid for `origins="*"`); the test accepts either and additionally asserts `Access-Control-Allow-Credentials != "true"` so the PM session cookie cannot leak to a public surface.
- **404 spot-check**: the shared `EntityNotFound` handler emits `type=https://kano.example.com/problems/entity-not-found`, `status=404`, the title is the registry-shared `"Entity not found"` (NOT a story-specific `"Poll not found"` — the story spec's "Poll not found" title is a documentation slip; introducing a second handler would diverge from the precedent the story explicitly forbids). The `detail` carries the UUID via the service's `EntityNotFound(f"Poll {poll_id} not found")`, and `request_id` is non-null per the request-ID middleware contract.
- **Logging**: one `poll_analysis_read` line per successful read with `poll_id`, `epoch`, `feature_count`, `total_submissions`. NFR8 guarded by a test that seeds a `name`/`description` with sentinel substrings and asserts they never appear in the structlog output.
- **OpenAPI**: added the `/polls/{poll_id}/analysis` path (`security: []`, 200 `PollAnalysis` / 404 `ProblemDetails`) and `components.schemas.PollAnalysis` + `FeatureAnalysis` mirroring the Pydantic shape from 5.1.
- **Perf smoke marker**: added `slow` to `pyproject.toml`'s `[tool.pytest.ini_options].markers` so `--strict-markers` accepts the new marker. CI runs the full suite by default; local fast-feedback runs can opt out with `pytest -m "not slow"`.

### File List

- `kano-backend/src/kano/api/analysis.py` — new — public analysis blueprint + handler
- `kano-backend/src/kano/__init__.py` — modified — register `analysis_bp` in `create_app()`
- `kano-backend/src/kano/middleware/security.py` — modified — extend `PUBLIC_RESPONDENT_PATHS` + docstring with the analysis path
- `kano-backend/openapi.yaml` — modified — add `/polls/{poll_id}/analysis` path + `PollAnalysis` / `FeatureAnalysis` schemas
- `kano-backend/pyproject.toml` — modified — register `slow` pytest marker
- `kano-backend/tests/integration/test_analysis_api.py` — new — 11 integration tests (happy / empty / tie / 404 / expired / CSRF / CORS / preflight / snapshot-frozen / logging × 2)
- `kano-backend/tests/integration/test_analysis_api_perf.py` — new — 20×500 seed, p95 <500 ms backend smoke (`@pytest.mark.slow`)

## Change Log

- 2026-05-22 — Implemented the public `GET /api/v1/polls/:uuid/analysis` endpoint as a thin wrapper over Story 5.1's `build_analysis` service. Added 11 integration tests + 1 perf smoke covering the full AC matrix (happy path / zero submissions / FR35 tie / 404 / FR32 expired-200 / CSRF-exempt / CORS-open / preflight / frozen-snapshot / structlog-with-no-PII). Extended OpenAPI with the path and the `PollAnalysis` / `FeatureAnalysis` schemas. Registered a `slow` pytest marker so the perf smoke is opt-out for local fast-feedback runs while CI runs the full suite. Status → review.

### Review Findings

Adversarial 3-layer review on 2026-05-26 (Blind Hunter / Edge Case Hunter / Acceptance Auditor).

- [x] [Review][Patch] `PUBLIC_RESPONDENT_PATHS` regexes now end with `/?$` so a trailing-slash variant (`/api/v1/polls/<uuid>/analysis/`) resolves to the public-resource CORS regime instead of falling through to the PM-only allowlist. Comment expanded in `middleware/security.py:54-66` explaining the anchoring rationale.
- [x] [Review][Patch] CORS credential assertion tightened — `Access-Control-Allow-Credentials` must be `None` or `"false"` (was `!= "true"`, which also passed for stray values like `"True"` / `"1"`).
- [x] [Review][Defer] Malformed UUID path (e.g. `/api/v1/polls/not-a-uuid/analysis`) returns generic 404 — indistinguishable from a real `EntityNotFound` on a well-formed UUID. The Werkzeug `<uuid:>` converter rejects the path before the view runs; mapping it to a typed 400 Problem-Details is broader error-handler work, not story-specific. Tracked in `deferred-work.md`.
