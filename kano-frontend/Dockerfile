# syntax=docker/dockerfile:1.7
#
# Multi-target Dockerfile for the Kano Vue 3 SPA.
#
# - `dev`: Vite dev server with HMR. Source is bind-mounted from the host by
#   the dev compose file (Story 1.9), so this stage's `COPY . .` only seeds
#   `node_modules` and the initial config.
# - `build`: produces the static SPA assets via `npm run build`.
# - `runtime`: Caddy 2 serving the built SPA + reverse-proxying `/api/*` to
#   the backend container. This target is consumed by the production compose
#   overlay (Story 7.1); dev compose targets `dev`.
#
# Build dev:    docker build --target dev -t kano-web:dev .
# Build prod:   docker build --target runtime -t kano-web:prod .

# ----------------------------------------------------------------------------
# Stage 1 — dev: Vite dev server (HMR over the host port)
# ----------------------------------------------------------------------------
FROM node:24-alpine AS dev

# `wget` is preinstalled on node:24-alpine and used for the HEALTHCHECK
# below — no extra apk add layer needed.

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# Vite dev server returns 200 on `/` once HMR is up; `wget --spider` is a
# HEAD-only probe so we don't transfer the full page each interval.
# Long start-period covers cold-start: first `npm ci` + Vite warm-up can
# take 30+ seconds on a slow machine. Story 1.10's `docker compose --wait`
# gates on this signal.
HEALTHCHECK --interval=10s --timeout=3s --start-period=45s --retries=3 \
    CMD wget --quiet --spider --tries=1 http://localhost:5173/ || exit 1

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ----------------------------------------------------------------------------
# Stage 2 — build: produce the production-bundled SPA
# ----------------------------------------------------------------------------
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ----------------------------------------------------------------------------
# Stage 3 — runtime: Caddy serving /dist with /api reverse proxy
# ----------------------------------------------------------------------------
FROM caddy:2-alpine AS runtime

COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
