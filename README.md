# Kano

Kano is an internal Tixeo tool for running product-prioritization studies using
the Kano model. It lets a PM author a feature list per project, generate a
short-lived respondent poll, collect functional/dysfunctional Likert pairs, and
view a categorized analysis.

The repo is a monorepo with a Python/Flask backend and a Vue/Vuetify frontend.

## Quickstart

The full local stack — Postgres 17, Flask API (with auto-migrations), Vite
dev server, and a backup-volume placeholder — boots with one command:

```bash
cp .env.example .env
docker compose up --build
```

Then open:

- SPA: <http://localhost:5173/>
- API: <http://localhost:5000/api/v1/health>

Tear down (including volumes):

```bash
docker compose down -v
```

Detailed runbook (smoke checklist, log tailing, psql access,
troubleshooting): [`docs/ops/runbook.md`](docs/ops/runbook.md).

### Without Docker

Docker compose is the supported path. If you genuinely need to run the
stack without containers — e.g. attaching a host-side debugger, profiling
the Python process, or working on a machine where Docker isn't available —
this is the recipe. Be aware that nothing in CI exercises this path; if
something breaks here, file an issue rather than working around it.

**Prerequisites** — Python 3.12 + Poetry 2.x, Node 24.x + npm 11.x, and a
running Postgres 17 instance you have full credentials for (Docker Desktop
including a standalone container is fine).

```bash
# 1. Bring up a Postgres 17 instance (skip if you already have one):
docker run -d --name kano-pg -p 5432:5432 \
    -e POSTGRES_USER=kano -e POSTGRES_PASSWORD=change-me -e POSTGRES_DB=kano \
    postgres:17

# 2. Backend
cd kano-backend
poetry install
export DATABASE_URL="postgresql+psycopg2://kano:change-me@localhost:5432/kano"
export FLASK_ENV=development
export SECRET_KEY=dev-only-not-for-prod
export CORS_ALLOWED_ORIGINS=http://localhost:5173
export KANO_VERSION=0.1.0
poetry run alembic upgrade head
poetry run flask --app kano run --host=0.0.0.0 --port=5000 --debug

# 3. Frontend (in a second terminal)
cd kano-frontend
npm install
npm run dev    # serves on http://localhost:5173/, proxies /api to :5000
```

To smoke-test: `curl http://localhost:5000/api/v1/health` should return
`{"status": "ok", ...}`.

### Pre-commit hooks

Local hooks mirror the CI gates (lint + typecheck + format) and block the
commit on any failure. Install once per clone:

```bash
pip install pre-commit
pre-commit install
```

To run all hooks against the whole tree (useful before opening a PR):

```bash
pre-commit run --all-files
```

## Repository layout

- `kano-backend/` — Flask 3 + SQLAlchemy 2 + Alembic API service
- `kano-frontend/` — Vue 3.5 + Vuetify 4 + Vite 6 SPA
- `_bmad/`, `_bmad-output/` — planning, architecture, and sprint artifacts
- `docs/` — additional project documentation

## License

MIT — see [LICENSE](LICENSE).
