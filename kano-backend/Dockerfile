# syntax=docker/dockerfile:1.7
#
# Multi-stage Dockerfile for the Kano Flask API.
#
# - `builder`: pulls Poetry, exports a frozen `requirements.txt` from
#   `pyproject.toml` + `poetry.lock` so the runtime image never carries Poetry
#   itself.
# - `runtime`: Python 3.12-slim, installs the locked dependencies, copies the
#   application source, runs as a non-root user, and uses `entrypoint.sh` to
#   apply Alembic migrations before launching Flask.
#
# Build:    docker build -t kano-api .
# Run:      docker run --rm -p 5000:5000 --env-file .env kano-api
# Compose:  see `docker-compose.yml` at the repo root (Story 1.9).

# ----------------------------------------------------------------------------
# Stage 1 — builder: produce a hash-locked requirements.txt
# ----------------------------------------------------------------------------
FROM python:3.12-slim AS builder

ENV POETRY_VERSION=2.1.4 \
    POETRY_VIRTUALENVS_CREATE=false \
    POETRY_NO_INTERACTION=1 \
    PIP_NO_CACHE_DIR=1

RUN pip install --no-cache-dir "poetry==${POETRY_VERSION}" "poetry-plugin-export"

WORKDIR /build
COPY pyproject.toml poetry.lock ./
RUN poetry export --without-hashes --without dev -o requirements.txt

# ----------------------------------------------------------------------------
# Stage 2 — runtime: thin image, non-root user, in-tree app
# ----------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FLASK_APP=kano

# Non-root user. The HEALTHCHECK below uses python's stdlib `urllib.request`
# rather than curl/wget so we don't have to install (and audit + supply-
# chain) an extra system package just to read one URL — `python3` is
# already in the base image, and the dependency hits zero.
RUN addgroup --system kano && adduser --system --group kano

WORKDIR /app

COPY --from=builder /build/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the package + migrations + alembic.ini + entrypoint. We install the
# package in editable mode so a bind-mounted `./src` (dev compose volume)
# replaces the baked-in copy at boot without breaking the import path.
COPY pyproject.toml README.md alembic.ini entrypoint.sh ./
COPY src ./src
COPY migrations ./migrations
RUN pip install --no-cache-dir --no-deps -e . \
    && chmod +x /app/entrypoint.sh \
    && chown -R kano:kano /app

USER kano

EXPOSE 5000

ARG KANO_VERSION=dev
ENV KANO_VERSION=${KANO_VERSION}

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
    CMD python -c "import urllib.request, sys; \
sys.exit(0 if urllib.request.urlopen('http://localhost:5000/api/v1/health', timeout=2).status == 200 else 1)"

ENTRYPOINT ["/app/entrypoint.sh"]
