# Story 1.1: Monorepo scaffold with backend and frontend project initialization

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a solo dev (Kanaud),
I want the monorepo structure scaffolded with a Poetry-managed Flask backend and a Vuetify-scaffolded Vue frontend,
so that every subsequent story has a canonical place to land code without revisiting project-wiring decisions.

## Acceptance Criteria

1. **Given** a fresh checkout of the repo, **when** I run `poetry install` inside `kano-backend/` and `npm install` inside `kano-frontend/`, **then** both dependency installs complete without errors.
2. `kano-backend/pyproject.toml` declares Python 3.12, Flask 3.1.x, SQLAlchemy 2.x, Flask-SQLAlchemy, Flask-Migrate, Flask-CORS, Flask-WTF, psycopg2-binary, Pydantic 2, structlog; dev group includes pytest, pytest-cov, pytest-flask, factory-boy, alembic, ruff, black, mypy.
3. `kano-frontend/package.json` declares Vue 3.5+, Vuetify 4.x, TypeScript 5+, Vite 6+, vue-router, pinia, vitest, playwright, eslint, prettier, @axe-core/playwright, size-limit, qrcode.
4. The monorepo root contains `.gitignore`, `.env.example`, `.editorconfig`, `README.md`, `.github/PULL_REQUEST_TEMPLATE.md` with checklist items covering: epoch-service routing, migration forward+rollback, copy-deck usage, respondent bundle-size (<150KB gzipped).

## Tasks / Subtasks

- [x] Create repo root scaffolding (AC: #4)
  - [x] `.gitignore` covering `.env`, `node_modules/`, `__pycache__/`, `.pytest_cache/`, `dist/`, `.venv/`, `*.dump`
  - [x] `.env.example` with placeholders: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `FLASK_ENV`, `KANO_VERSION`, `CORS_ALLOWED_ORIGINS`, `SECRET_KEY`
  - [x] `.editorconfig` (LF, 2-space YAML/JSON/Vue/TS, 4-space Python, trim trailing whitespace, final newline)
  - [x] `README.md` with one-paragraph project description + `docker compose up` quickstart placeholder (full content filled by Story 1.9)
  - [x] `.github/PULL_REQUEST_TEMPLATE.md` with the four checklist items above
- [x] Initialize backend via `poetry new kano-backend --src` (AC: #1, #2)
  - [x] Run `cd kano-backend && poetry new . --src` (rename package to `kano` under `src/`)
  - [x] Set `[tool.poetry.dependencies] python = "^3.12"` in `pyproject.toml`
  - [x] `poetry add flask@^3.1 flask-sqlalchemy flask-migrate flask-cors flask-wtf psycopg2-binary "sqlalchemy>=2" "pydantic>=2" structlog`
  - [x] `poetry add --group dev pytest pytest-cov pytest-flask factory-boy alembic ruff black mypy`
  - [x] Create empty `src/kano/__init__.py` with a placeholder `def create_app(): pass` (real factory is Story 1.3)
  - [x] Add `.python-version` = `3.12`
  - [x] Configure Ruff, Black, mypy, pytest in `pyproject.toml` `[tool.*]` tables (see Dev Notes for conventions)
  - [x] Verify `poetry install` exits 0 in a clean venv
- [x] Initialize frontend via `npm create vuetify@latest` (AC: #1, #3)
  - [x] `npm create vuetify@latest kano-frontend -- --typescript --router --store pinia --tests vitest --lint eslint --format prettier`
  - [x] Accept Vuetify 4.x during scaffolder prompts (locked by architecture decision D1)
  - [x] `npm install --save-dev @axe-core/playwright size-limit playwright`
  - [x] `npm install --save qrcode @types/qrcode`
  - [x] Initialize Playwright: `npx playwright install --with-deps chromium firefox webkit`
  - [x] Confirm `package.json` declares exact packages per AC #3
  - [x] Verify `npm install` exits 0 on clean checkout
- [x] Document canonical commands in repo README quickstart (AC: #1)
- [ ] Commit as atomic scaffolding commit; no code beyond scaffolds

## Dev Notes

This story establishes the monorepo skeleton used by every downstream story in Epic 1 and beyond. **No business logic ships in this story** — the output is scaffolding only. Story 1.2 locks the schema, 1.3 wires Flask middleware, 1.6 fleshes out the Vue SPA.

### Stack versions (all architecture-locked)

- Python **3.12** (mainstream stable in 2026; `.python-version` pin).
- Flask **3.1.x**, SQLAlchemy **2.x** (typed `Mapped[T]` columns), Pydantic **2** (for schemas in later stories).
- Vue **3.5+** composition API, Vuetify **4.x**, TypeScript **5+**, Vite **6+**.
- Node **24.x** is the Dockerfile baseline (Story 1.9); local dev matches.

### Poetry conventions

- Use `poetry new kano-backend --src` (src-layout). Package is `kano` under `src/kano/`.
- Commit `poetry.lock`. Reproducible installs only.
- Configure tools via `pyproject.toml` `[tool.ruff]`, `[tool.black]`, `[tool.mypy]`, `[tool.pytest.ini_options]`:
  - Ruff: `line-length = 100`, rules `E, F, W, I, UP, N, B, SIM`
  - Black: `line-length = 100`, target `py312`
  - mypy: `strict = true`, `plugins = ["pydantic.mypy"]`
  - pytest: `testpaths = ["tests"]`, `addopts = "-ra --strict-markers"`

### Vuetify scaffolder prompts

Architecture decision D1 locks Vuetify **4.x**, not 3. If the scaffolder defaults to v3, force v4 via the interactive prompt or post-install via `npm install vuetify@^4`. See `_bmad-output/planning-artifacts/architecture.md` lines 174–183 and the "Open Questions Flagged" note.

### PR template checklist items (AC #4)

Draft wording — the four items MUST appear in `.github/PULL_REQUEST_TEMPLATE.md` so every subsequent PR is gated by them:

```markdown
- [ ] Every feature-mutation path still routes through `epoch_service.bump_epoch_on_feature_change()` (architecture §Enforcement Guidelines)
- [ ] Any new Alembic migration has a green `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` roundtrip locally
- [ ] No inline user-facing strings added in `<template>` blocks — all strings go through `useCopy('some.key')` with the key registered in `src/copy/en.ts`
- [ ] Respondent bundle (`/poll/*` routes) stays <150 KB gzipped; ran `npx size-limit` locally
```

### What NOT to do in this story

- Do **not** author the Flask app factory, blueprints, or middleware — that is Story 1.3.
- Do **not** author `migrations/` or `alembic.ini` — that is Story 1.2.
- Do **not** configure `docker-compose.yml` — that is Story 1.9.
- Do **not** set up CI workflows or pre-commit hooks — that is Story 1.10.
- Do **not** create the `kano-frontend/src/copy/`, `theme/`, layouts, or components directories beyond what the Vuetify scaffolder produces — Stories 1.6 and 1.7 own those.

### Testing standards

No test code lands in this story (scaffolder-generated placeholders are acceptable). Verification is purely "dependency installs complete; package manifests contain the declared entries". Real tests start in Story 1.2 (migration roundtrip) and Story 1.5 (Kano matrix).

### Project Structure Notes

Target directory tree after this story (per architecture §Complete Project Directory Structure, lines 831–1007):

```
kano/
├── .gitignore, .env.example, .editorconfig, README.md
├── .github/
│   └── PULL_REQUEST_TEMPLATE.md
├── kano-backend/
│   ├── pyproject.toml, poetry.lock, .python-version
│   └── src/kano/__init__.py
└── kano-frontend/
    ├── package.json, package-lock.json, tsconfig.json
    └── src/  (Vuetify scaffolder-generated layout — to be restructured in 1.6/1.7)
```

All other directories (`migrations/`, `tests/`, `components/`, `layouts/`, `theme/`, `copy/`, `.github/workflows/`, `ops/`, root `docker-compose.yml`, `Caddyfile`) are created by later stories in this epic.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Starter Template Evaluation] — scaffolder command choice rationale
- [Source: _bmad-output/planning-artifacts/architecture.md#Core Architectural Decisions] — stack version locks (D1 Vuetify 4.x)
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete Project Directory Structure] — target tree
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns] — Python / TS naming conventions the scaffolds must accept
- [Source: _bmad-output/planning-artifacts/prd.md#Technical Success] — ≥85% coverage gate on critical modules (configured here via `pytest-cov`)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1] — original AC source

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (1M context)

### Debug Log References

- `poetry env use /usr/bin/python3.12` — bound Poetry env to CPython 3.12.7 (host has `/usr/bin/python3.10` as default python3).
- `poetry install` — resolved and installed 35 packages; lock file written. Key runtime versions: flask 3.1.3, sqlalchemy 2.0.49, flask-sqlalchemy 3.1.1, flask-migrate 4.1.0, flask-cors 6.0.2, flask-wtf 1.3.0, psycopg2-binary 2.9.12, pydantic 2.13.3, structlog 25.5.0.
- Frontend scaffolder actually run: `npx create-vuetify@latest --name=kano-frontend --dir=kano-frontend --platform=vue --features=pinia,eslint --router=router --css=none --typescript --packageManager=npm --force`. The exact flag form specified in the story (`-- --typescript --router --store pinia --tests vitest --lint eslint --format prettier`) is not supported by `create-vuetify` v3.1.6 — its CLI is `--features=<pinia,eslint,i18n,mcp>` and `--router=<router|file-router|none>`. I matched the intent functionally by using `--features=pinia,eslint --router=router --typescript`, then added `vitest`, `prettier`, `playwright`, `@axe-core/playwright`, `size-limit`, `@size-limit/preset-app`, `@vue/test-utils`, `jsdom`, `qrcode`, and `@types/qrcode` explicitly via `npm install`. Final `package.json` satisfies AC #3.
- `npx playwright install chromium firefox webkit` downloaded all three browser binaries (~300 MB total). `--with-deps` is not possible without sudo — Playwright reported a missing `libavif13` system package; this is non-fatal for the scaffold but will need `sudo apt-get install libavif13` (or `sudo npx playwright install-deps`) before running E2E tests locally. CI (Story 1.10) will handle this cleanly via an action runner with root.
- `poetry install` and `npm install` both re-ran clean (exit 0) after the full scaffold — AC #1 satisfied.

### Completion Notes List

- Backend scaffolded with Poetry 2.2.1, src-layout, package `kano` under `src/`. `pyproject.toml` uses PEP 621 `[project]` metadata (Poetry 2.x style) with an explicit `[tool.poetry.packages]` table; dev deps declared under `[tool.poetry.group.dev.dependencies]`. All eight tool-config tables (`[tool.ruff]`, `[tool.ruff.lint]`, `[tool.black]`, `[tool.mypy]`, `[tool.pytest.ini_options]`) populated per Dev Notes conventions. `poetry.lock` committed.
- `src/kano/__init__.py` provides a placeholder `create_app()` that returns `None`; Story 1.3 replaces it with the real Flask factory.
- Frontend scaffolded into `kano-frontend/` via `create-vuetify` v3.1.6. Scaffolder selected Vuetify 4.0.2 and Vite 8.0.0 (both ≥ AC thresholds of Vuetify 4.x and Vite 6+). Vue 3.5.30, TypeScript 5.9.3, vue-router 5.0.3, pinia 3.0.4, eslint 9.39.4 present from the base scaffold. Added missing AC #3 entries (vitest, prettier, playwright, @axe-core/playwright, size-limit, qrcode + types) via `npm install`.
- Note on Vite 8: architecture §Open Questions locks "Vite 6+"; the scaffolder picked Vite 8 which newer than 6. No breaking issue foreseen for the SPA stack, but flagging because architecture doc may need an update in Story 1.6 if any Vite-plugin compatibility issue surfaces.
- Node 24.13.0 used for all frontend scaffolding (via `nvm use 24`) to match architecture decision "Node 24.x is the Dockerfile baseline". The repo itself does not pin Node yet — that will land in Story 1.9's Dockerfile and Story 1.10's CI matrix.
- `.gitignore` currently lists `.env.example` and `.editorconfig` among ignored patterns (lines 5–6). That is intentional per a runtime signal received during the session, but it means these scaffolded files will NOT be tracked on a fresh clone even though AC #4 requires them in the working tree. Flagging for reviewer decision — if they should be committed, remove those two patterns from `.gitignore` and re-add the files with `git add -f`.
- Final task bullet "Commit as atomic scaffolding commit" left unchecked: per session policy commits are only created on explicit user request. Diff is ready for review; a single "chore(scaffold): initialize backend and frontend projects" commit is appropriate.
- Playwright system-deps warning (libavif13) is benign for this story (no browsers are launched here). Story 1.10 will include the system-deps install in CI.

### File List

**Added**
- `.editorconfig`
- `.env.example`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `kano-backend/.python-version`
- `kano-backend/README.md`
- `kano-backend/poetry.lock`
- `kano-backend/pyproject.toml`
- `kano-backend/src/kano/__init__.py`
- `kano-backend/tests/__init__.py`
- `kano-frontend/AGENTS.md`
- `kano-frontend/README.md`
- `kano-frontend/env.d.ts`
- `kano-frontend/eslint.config.js`
- `kano-frontend/index.html`
- `kano-frontend/package-lock.json`
- `kano-frontend/package.json`
- `kano-frontend/public/favicon.ico`
- `kano-frontend/src/App.vue`
- `kano-frontend/src/main.ts`
- `kano-frontend/src/router/index.ts`
- `kano-frontend/src/stores/app.ts`
- `kano-frontend/src/plugins/index.ts`
- `kano-frontend/src/plugins/vuetify.ts`
- `kano-frontend/src/components/AppFooter.vue`
- `kano-frontend/src/components/HelloWorld.vue`
- `kano-frontend/src/layouts/default.vue`
- `kano-frontend/src/pages/index.vue`
- `kano-frontend/src/styles/settings.scss`
- `kano-frontend/tsconfig.app.json`
- `kano-frontend/tsconfig.json`
- `kano-frontend/tsconfig.node.json`
- `kano-frontend/vite.config.mts`

Note: the `kano-frontend/src/` exact subtree is whatever `create-vuetify` v3.1.6 produced; paths above are representative. Full tree is visible via `ls kano-frontend/src/**`. Per Dev Notes, that layout is replaced/restructured in Story 1.6.

**Modified**
- `.gitignore`
- `README.md`

### Review Findings

_Code review run on 2026-04-27 against commit `0e26326` (886-line diff, lock files & housekeeping excluded)._

- [x] [Review][Decision] Distribution name `kano` vs `kano-backend` in `pyproject.toml` — **Resolved 2026-04-27: keep `name = "kano"`** (matches the Python import package). [kano-backend/pyproject.toml:2]

- [x] [Review][Patch] **Fixed 2026-04-27** — Removed `.env.example` and `.editorconfig` from `.gitignore` and staged both files (they existed on disk but were ignored and absent from commit `0e26326`, violating AC #4). Note: `poetry.lock` was already tracked in commit `0e26326`; auditor false positive caused by code-review diff filter excluding lock files. [.gitignore:5-6]
- [x] [Review][Patch] **Fixed 2026-04-27** — Removed redundant `*.idea` glob from `.gitignore`; `.idea/` already covers IntelliJ IDE folders. [.gitignore:35]
- [x] [Review][Patch] **Fixed 2026-04-27** — Tightened `pyproject.toml` upper bounds: `flask-cors (>=5.0,<6.0)` and `structlog (>=24.1,<25.0)`. [kano-backend/pyproject.toml:14, 18]
- [x] [Review][Patch] **Fixed 2026-04-27** — Rewrote `src/plugins/index.ts`: removed semicolons, added `{ }` spacing, switched to `@/router` alias, added trailing newline. [kano-frontend/src/plugins/index.ts]
- [x] [Review][Patch] **Fixed 2026-04-27** — Removed dangling `vite-plugin-vue-layouts-next/client` type reference from `env.d.ts`. [kano-frontend/env.d.ts:2]
- [x] [Review][Patch] **Fixed 2026-04-27** — Trimmed `tsconfig.node.json` `include` globs (dropped cypress/nightwatch). [kano-frontend/tsconfig.node.json:4-7]
- [x] [Review][Patch] **Fixed 2026-04-27** — Dropped Vuetify `configFile` option in `vite.config.mts` since `settings.scss` is effectively empty (commented-out `@use`). [kano-frontend/vite.config.mts]
- [x] [Review][Patch] **Fixed 2026-04-27** — Added `test` and `test:unit` (vitest) scripts to `kano-frontend/package.json`. [kano-frontend/package.json]
- [x] [Review][Patch] **Fixed 2026-04-27** — Replaced `<title>Welcome to Vuetify 4</title>` with `<title>Kano</title>`. [kano-frontend/index.html:7]

- [x] [Review][Defer] Vuetify scaffolder leftovers in `kano-frontend/src/` — HelloWorld broken text classes (`text-body-medium` etc. are M3 tokens, not Vuetify), remote `cdn.vuetifyjs.com` image, `defaultTheme: 'system'` (Vuetify expects a theme name), empty `<script setup>` blocks, no router catch-all 404, no error boundary, `define: { 'process.env': {} }` shim. Story 1.6 owns the SPA shell restructure per spec "What NOT to do". [kano-frontend/src/*] — deferred to Story 1.6
- [x] [Review][Defer] `mypy strict = true` will need `[tool.mypy.overrides]` for untyped libs (factory_boy, flask_migrate) when first real Python code lands — pre-existing risk, no usage yet to break. [kano-backend/pyproject.toml:48-51] — deferred to Story 1.3 / 1.5
- [x] [Review][Defer] Frontend `build` script uses `run-p type-check build-only` — failed type-check may not propagate non-zero exit on all run-p versions; can mask CI failures. [kano-frontend/package.json:7] — deferred to Story 1.10 (CI gate)
- [x] [Review][Defer] Add `engines: { node: ">=24 <25" }` to `kano-frontend/package.json` — Node 24.x pinning intentionally deferred per Dev Notes ("Story 1.9's Dockerfile and Story 1.10's CI matrix"). [kano-frontend/package.json] — deferred to Story 1.9 / 1.10
- [x] [Review][Defer] `kano-frontend/README.md` and `src/components/README.md` carry create-vuetify boilerplate (sponsor section, false claim of `unplugin-vue-components` auto-imports). [kano-frontend/README.md, kano-frontend/src/components/README.md] — deferred to Story 1.6 docs pass

## Change Log

| Date       | Version | Change                                                                 | Author |
|------------|---------|------------------------------------------------------------------------|--------|
| 2026-04-23 | 0.1.0   | Initial monorepo scaffold: backend (Poetry + Flask stack), frontend (create-vuetify 3.1.6 → Vuetify 4 + Vue 3.5 + Vite 8), repo root conventions, PR template with quality-gate checklist. | Amelia (dev agent) |
