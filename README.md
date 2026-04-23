# Kano

Kano is an internal Tixeo tool for running product-prioritization studies using
the Kano model. It lets a PM author a feature list per project, generate a
short-lived respondent poll, collect functional/dysfunctional Likert pairs, and
view a categorized analysis.

The repo is a monorepo with a Python/Flask backend and a Vue/Vuetify frontend.

## Quickstart

```bash
# Backend (Python 3.12, Poetry)
cd kano-backend
poetry install

# Frontend (Node 24.x)
cd ../kano-frontend
npm install
```

Full one-command local boot (`docker compose up`) is wired up in Story 1.9.

## Repository layout

- `kano-backend/` — Flask 3 + SQLAlchemy 2 + Alembic API service
- `kano-frontend/` — Vue 3.5 + Vuetify 4 + Vite 6 SPA
- `_bmad/`, `_bmad-output/` — planning, architecture, and sprint artifacts
- `docs/` — additional project documentation
