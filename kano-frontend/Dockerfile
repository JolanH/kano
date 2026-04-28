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

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

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
