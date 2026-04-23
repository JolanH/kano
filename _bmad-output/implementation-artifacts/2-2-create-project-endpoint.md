# Story 2.2: Create project endpoint

Status: ready-for-dev

## Story

As a PM,
I want to create a project by supplying a name and a version,
so that I can begin authoring features toward a future poll.

## Acceptance Criteria

1. **Given** a PM SPA client with a valid CSRF token, **when** I `POST /api/v1/projects` with `{"name": "Q3 Prioritization", "version": "1.0"}`, **then** the response is 201 Created with a `Location: /api/v1/projects/:id` header and body matching `ProjectResponse` including `current_epoch: 1`.
2. A row is persisted in `projects` with an app-generated UUIDv4.
3. Posting an invalid body (missing name, or name exceeding max length) returns 400 with a Problem Details envelope describing the validation failure.
4. Posting without the `X-CSRF-Token` header returns 403 with a Problem Details envelope.
5. The endpoint is documented in `kano-backend/openapi.yaml`.

## Tasks / Subtasks

- [ ] `services/project_service.py` (AC: #1, #2)
  - [ ] `def create_project(data: ProjectCreate) -> Project:` — `project = Project(id=uuid4(), name=data.name, version=data.version); db.session.add(project); db.session.commit(); return project`
  - [ ] No epoch logic here — `current_epoch` defaults to 1 via the model
- [ ] `api/projects.py` blueprint (AC: #1, #3, #4)
  - [ ] `projects_bp = Blueprint("projects", __name__, url_prefix="/api/v1/projects")`
  - [ ] `@projects_bp.post("/")` handler:
    - `body = ProjectCreate.model_validate(request.get_json())` — on `ValidationError`, domain exception middleware converts to 400 Problem Details
    - `project = project_service.create_project(body)`
    - Return `ProjectResponse.model_validate(project).model_dump(mode="json"), 201, {"Location": f"/api/v1/projects/{project.id}"}`
  - [ ] CSRF protection is automatic via Story 1.3's `CSRFProtect(app)` on state-changing `/api/v1/*` endpoints — no per-route decorator needed
  - [ ] Register the blueprint in `create_app()`
- [ ] ValidationError → Problem Details mapping
  - [ ] Ensure `api/errors.py` (from Story 1.3) has a handler for Pydantic `ValidationError` → 400 with `type=validation-error`, `detail` containing the Pydantic error path(s)
- [ ] OpenAPI documentation (AC: #5)
  - [ ] `kano-backend/openapi.yaml` — add path `/api/v1/projects` with `post` operation: request body schema referencing `ProjectCreate`, 201 response with `ProjectResponse`, 400 response referencing a shared `ProblemDetails` component
- [ ] Integration tests
  - [ ] `tests/integration/test_projects_api.py::test_create_project_success` — POST with valid body + CSRF header + session cookie; assert 201, `Location` header, body keys match `ProjectResponse`, `current_epoch==1`, row in DB
  - [ ] `test_create_project_validation_error` — POST without `name`; assert 400, Problem Details body with `type=validation-error`
  - [ ] `test_create_project_without_csrf` — POST with no `X-CSRF-Token`; assert 403 / Problem Details

## Dev Notes

### CSRF testing helper

Add a test fixture that: (1) GETs `/api/v1/csrf-token` to prime the session, (2) extracts the token, (3) returns both the token and the cookie jar for reuse. Reused across every CSRF-protected endpoint test in this epic.

### Why a Location header

HTTP semantics (RFC 9110): 201 responses pointing to a new resource should include `Location`. Cheap to emit; makes clients that follow it (or just log it) robust.

### Not in scope

- No list/get/patch — Stories 2-3, 2-4, 2-5.
- No feature authoring — Story 2-6 onwards.

### Project Structure Notes

Files:
- `kano-backend/src/kano/services/project_service.py`
- `kano-backend/src/kano/api/projects.py`
- Register blueprint in `kano-backend/src/kano/__init__.py`
- Extend/create `kano-backend/openapi.yaml`
- `kano-backend/tests/integration/test_projects_api.py`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — endpoint map line 332
- [Source: _bmad-output/planning-artifacts/architecture.md#Pattern Examples] — "Good — creating a project" code sample line 765
- [Source: _bmad-output/planning-artifacts/prd.md#FR1] — PM creates a project
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2] — original AC
- [Source: _bmad-output/implementation-artifacts/1-3-flask-app-factory-*.md] — CSRF + Problem Details middleware
- [Source: _bmad-output/implementation-artifacts/2-1-project-sqlalchemy-model-and-pydantic-schemas.md] — schemas consumed here

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
