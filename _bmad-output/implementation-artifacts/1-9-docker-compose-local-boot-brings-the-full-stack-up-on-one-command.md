# Story 1.9: docker-compose local boot brings the full stack up on one command

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a solo dev,
I want `docker-compose.yml` composing `web` (Vite dev), `api` (Flask dev with automatic alembic upgrade on start), `db` (postgres:17), and `backup` (idle in dev) services with a single `docker compose up` boot on a clean checkout,
so that NFR17 is satisfied from day one and every downstream story inherits the same reproducible local environment.

## Acceptance Criteria

1. **Given** a clean checkout of the repo with a populated `.env` (copied from `.env.example`), **when** I run `docker compose up` from the repo root, **then** all four services start cleanly.
2. The `api` container's entrypoint runs `alembic upgrade head` automatically before launching `flask run --debug`.
3. `curl http://localhost:5000/api/v1/health` returns 200 `{"status": "ok", ...}`.
4. `curl http://localhost:5173/` returns 200 with the Vue SPA shell.
5. The Vite dev server proxies `/api/*` to the Flask container.
6. Source directories (`kano-backend/src`, `kano-frontend/src`) are volume-mounted for live reload; Vite HMR and Flask debug mode both respond to file changes without container restart.
7. `docker compose down -v` cleans up all volumes and state.

## Tasks / Subtasks

- [ ] Root `docker-compose.yml` (AC: #1, #6, #7)
  - [ ] Four services: `web`, `api`, `db`, `backup`
  - [ ] Named volumes: `db_data` (persistent Postgres), `backup_data` (idle-but-exists in dev)
  - [ ] Volume mounts: `./kano-backend/src:/app/src:ro` (or rw for editor convenience — use rw), `./kano-frontend/src:/app/src:ro` — both bind-mounted from host for live reload
  - [ ] Port mappings: `5173:5173` (web), `5000:5000` (api), `5432:5432` (db exposed for local psql; optional)
- [ ] `db` service (AC: #1, #7)
  - [ ] Image: `postgres:17`
  - [ ] Env: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` from `.env`
  - [ ] Volume: `db_data:/var/lib/postgresql/data`
  - [ ] `healthcheck`: `pg_isready -U ${POSTGRES_USER}`
  - [ ] Postgres command extension: `command: ["postgres", "-c", "log_min_duration_statement=500"]` (fulfills NFR16 from day one in dev; prod applies the same)
- [ ] `api` service (AC: #2, #3, #6)
  - [ ] Build: `./kano-backend` (Dockerfile in that directory — multi-stage per architecture §Infrastructure)
  - [ ] `kano-backend/Dockerfile` — multi-stage:
    - Stage 1 `builder`: `FROM python:3.12-slim`; install Poetry; `poetry export --without-hashes -o requirements.txt`
    - Stage 2 `runtime`: `FROM python:3.12-slim`; `pip install -r requirements.txt` from stage 1; copy `src/`; create non-root user; `CMD ["./entrypoint.sh"]`
  - [ ] `kano-backend/entrypoint.sh` — shell script:
    ```sh
    #!/bin/sh
    set -e
    alembic upgrade head
    exec flask --app kano run --host=0.0.0.0 --port=5000 --debug
    ```
    (`flask --app kano` resolves `create_app` auto-discovery via `src/kano/__init__.py`)
  - [ ] depends_on: `db` with `condition: service_healthy`
  - [ ] env: `DATABASE_URL=postgresql+psycopg2://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}`, `FLASK_ENV=development`, `SECRET_KEY`, `CORS_ALLOWED_ORIGINS=http://localhost:5173`, `KANO_VERSION=dev`
  - [ ] Volume mount: `./kano-backend/src:/app/src` (for live reload; Flask `--debug` watches for changes)
- [ ] `web` service (AC: #4, #5, #6)
  - [ ] Build: `./kano-frontend` (dev-oriented Dockerfile — a separate target from the production multi-stage)
  - [ ] `kano-frontend/Dockerfile` — multi-stage with two targets:
    - `dev` stage: `FROM node:24-alpine`; `WORKDIR /app`; `COPY package*.json ./`; `RUN npm ci`; `CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]`
    - `build` stage: `FROM node:24-alpine AS build`; `npm ci && npm run build`
    - `runtime` stage: `FROM caddy:2-alpine`; copies `/dist` from `build` and a `Caddyfile` configuring SPA fallback + `/api/*` reverse proxy (this target is used by production compose overlay in Story 7.1)
  - [ ] `docker-compose.yml` web service: `build: { context: ./kano-frontend, target: dev }`
  - [ ] Volume mounts: `./kano-frontend/src:/app/src`, `./kano-frontend/index.html:/app/index.html`, named volume `frontend_node_modules:/app/node_modules` (prevents host-OS modules overriding container's)
  - [ ] Port: `5173:5173`; Vite dev server config (from Story 1.6) already proxies `/api/*` → `http://api:5000`
  - [ ] depends_on: `api`
- [ ] `backup` service (AC: #1, #7)
  - [ ] Build: `./ops/backup` (placeholder Dockerfile for now — full backup logic lands in Story 6-1)
  - [ ] `ops/backup/Dockerfile` — minimal: `FROM alpine:latest`; `CMD ["sleep", "infinity"]` — idle-in-dev per the AC wording
  - [ ] In dev, this service exists to reserve the volume mount point (`backup_data:/backups`) so the volume is created; real cron and `pg_dump` are wired in Story 6-1
- [ ] `.env.example` update (AC: #1)
  - [ ] Ensure all vars used in `docker-compose.yml` appear: `POSTGRES_USER=kano`, `POSTGRES_PASSWORD=devpass`, `POSTGRES_DB=kano_dev`, `SECRET_KEY=<placeholder-64-hex>`, `CORS_ALLOWED_ORIGINS=http://localhost:5173`, `FLASK_ENV=development`, `KANO_VERSION=dev`
  - [ ] Document in `README.md` quickstart: `cp .env.example .env && docker compose up`
- [ ] Smoke verification (AC: #3, #4, #6, #7)
  - [ ] Local manual verification checklist (document in `docs/ops/runbook.md` stub or README):
    - `cp .env.example .env`
    - `docker compose up --build` — all four services start
    - `curl -s http://localhost:5000/api/v1/health | jq .status` → `"ok"`
    - `curl -sI http://localhost:5173/` → HTTP 200
    - Edit `kano-backend/src/kano/api/health.py` (add a no-op log line) — Flask debug reloads within 2s
    - Edit `kano-frontend/src/main.ts` (trivial change) — Vite HMR pushes the change within 1s
    - `docker compose down -v` — all containers stop, named volumes `db_data`, `backup_data`, `frontend_node_modules` removed

## Dev Notes

### docker-compose.yml shape (target)

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER}"]
      interval: 5s
      timeout: 3s
      retries: 5
    command: ["postgres", "-c", "log_min_duration_statement=500"]
    ports:
      - "5432:5432"

  api:
    build:
      context: ./kano-backend
    environment:
      DATABASE_URL: postgresql+psycopg2://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      FLASK_ENV: development
      SECRET_KEY: ${SECRET_KEY}
      CORS_ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS}
      KANO_VERSION: ${KANO_VERSION:-dev}
    volumes:
      - ./kano-backend/src:/app/src
      - ./kano-backend/migrations:/app/migrations
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "5000:5000"

  web:
    build:
      context: ./kano-frontend
      target: dev
    environment:
      VITE_API_PROXY: http://api:5000
    volumes:
      - ./kano-frontend/src:/app/src
      - ./kano-frontend/index.html:/app/index.html
      - frontend_node_modules:/app/node_modules
    depends_on:
      - api
    ports:
      - "5173:5173"

  backup:
    build: ./ops/backup
    volumes:
      - backup_data:/backups
    # real backup logic lands in Story 6-1

volumes:
  db_data:
  backup_data:
  frontend_node_modules:
```

### Flask `--app` resolution

With `src`-layout and Poetry, the import path is `kano` (package) exposing `create_app()`. Flask auto-discovers: running `flask --app kano run` inside the container works because `pip install -e . && python -c "import kano"` succeeds. The Dockerfile should `RUN pip install -e .` in the runtime stage so the package is importable.

### Frontend Dockerfile with multi-target

The `target: dev` pattern means the same Dockerfile produces both dev and production images:

```dockerfile
FROM node:24-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine AS runtime
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
```

Dev compose targets `dev`; prod compose overlay (Story 7.1) targets `runtime`.

### Vite proxy in dev

From Story 1.6's `vite.config.ts`:

```ts
server: {
  port: 5173,
  host: '0.0.0.0',  // required for Docker port exposure
  proxy: {
    '/api': {
      target: process.env.VITE_API_PROXY || 'http://localhost:5000',
      changeOrigin: true,
    },
  },
}
```

Override via `VITE_API_PROXY=http://api:5000` in compose — lets the browser hit the Vite server directly while `/api/*` requests route through Vite's proxy to the `api` container over Docker DNS.

### Healthcheck ordering

`db` healthcheck prevents `api` from starting before Postgres accepts connections — eliminates the flaky startup race where Alembic fires before Postgres is ready. Do not use `restart: on-failure` as a substitute; healthcheck + `depends_on: condition` is cleaner.

### What this story does NOT do

- No production compose overlay — that's Story 7-1.
- No CI workflow — Story 1.10 (`compose up -d --wait` smoke test lands there).
- No actual backup cron — Story 6-1.
- No reverse proxy config in dev — Caddy is a production-only concern; dev uses Vite's proxy.

### Testing standards

- Manual smoke test only in this story. Automated `docker compose up -d --wait` smoke is Story 1.10's responsibility.
- Document the smoke-test checklist (above) in `docs/ops/runbook.md` stub so future contributors have a scripted verification.

### Project Structure Notes

Files created:
- `docker-compose.yml` (root)
- `kano-backend/Dockerfile`, `kano-backend/entrypoint.sh`
- `kano-frontend/Dockerfile`, `kano-frontend/Caddyfile` (Caddyfile used by prod `runtime` target)
- `ops/backup/Dockerfile` (placeholder)
- `.env.example` (extend Story 1.1's with all vars from this story)
- `README.md` quickstart section (extend Story 1.1's placeholder)
- `docs/ops/runbook.md` stub

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure & Deployment] — services topology (line 418)
- [Source: _bmad-output/planning-artifacts/architecture.md#Container images] — multi-stage build pattern
- [Source: _bmad-output/planning-artifacts/prd.md#NFR17] — `docker compose up` single-command boot
- [Source: _bmad-output/planning-artifacts/prd.md#NFR16] — PostgreSQL slow-query log (applied here from day one)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9] — original AC source
- [Source: _bmad-output/implementation-artifacts/1-2-alembic-migration-1-*.md] — migration runs via entrypoint.sh
- [Source: _bmad-output/implementation-artifacts/1-3-flask-app-factory-*.md] — `create_app` is the Flask app target
- [Source: _bmad-output/implementation-artifacts/1-4-health-and-csrf-token-endpoints.md] — `/health` is the smoke assertion target

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
