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

```bash
# Backend (Python 3.12, Poetry)
cd kano-backend
poetry install

# Frontend (Node 24.x)
cd ../kano-frontend
npm install
```

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
