# Story 1.6: Vue SPA scaffold with Tixeo Vuetify theme, two layouts, and useApi composable

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a solo dev,
I want the Vue SPA wired with `createVuetify()` carrying Tixeo theme tokens, both layout wrappers (`PmLayout`, `RespondentLayout`), the unsupported-viewport helper, route-meta-driven layout selection, and a `useApi()` composable,
so that every feature story inherits a themed, responsive shell and makes backend calls through a single CSRF-aware and Problem-Details-aware client.

## Acceptance Criteria

1. **Given** the Vue SPA boots, **when** any page renders, **then** a single `createVuetify()` instance is applied with Tixeo theme tokens: `primary` orange `#E36A2F`, `surface`, `surface-variant` `#1C1F26`, semantic success/warning/error/info, the 6 Kano-category colors (Must-have indigo-800 `#1E3A8A`, Performance teal-600 `#0D9488`, Delighter violet-600 `#7C3AED`, Indifferent gray-500 `#6B7280`, Reverse amber-700 `#B45309`, Questionable stone-500 `#78716C`).
2. Typography uses the Tixeo sans-serif family with Inter fallback, rem-based scale (14px PM body, 16px respondent body), tabular numerals enabled in statistics contexts.
3. Spacing uses the 4px base unit scale; elevation shadows are overridden to minimal (0 on cards, borders for separation).
4. Navigating to `/app/*` renders inside `PmLayout` (dark sidebar + top bar, content container 1440px centered); navigating to `/poll/*` renders inside `RespondentLayout` (chromeless, 480px container centered, 16px mobile gutter).
5. Visiting any `/app/*` route from a viewport <1280px renders the unsupported-viewport helper screen with a single centered message sourced from the copy deck.
6. `useApi()` prepends `/api/v1/`, generates an `X-Request-ID` header client-side, fetches the CSRF token lazily on first PM-route entry and injects `X-CSRF-Token` on non-GETs, parses Problem Details responses into typed errors (`ValidationError`, `ConflictError`, `NotFoundError`, `ServerError`).
7. Automated contrast checks pass at 4.5:1 for body text and 3:1 for large text and non-text UI on all defined token pairings.
8. The Kano category palette passes protanopia/deuteranopia/tritanopia simulator checks (manual verification documented in-repo).

## Tasks / Subtasks

- [ ] Build Tixeo Vuetify theme (AC: #1, #2, #3)
  - [ ] `src/theme/tixeo.ts` — export `tixeoTheme: ThemeDefinition` with `dark: false`, `colors` object carrying all tokens from AC #1 (core + semantic + 6 Kano categories)
  - [ ] Add Kano category tokens as custom theme colors: `category-must`, `category-perf`, `category-del`, `category-ind`, `category-rev`, `category-que` (these power `<cat-badge>` in Epic 5)
  - [ ] Add typography via theme `defaults.global.typography` + load Inter webfont in `index.html` (Google Fonts or self-hosted — self-host recommended; see Dev Notes)
  - [ ] `src/theme/overrides.scss` — override Material 3 defaults: `.v-btn { box-shadow: none; }`, card elevation 0, input default variant `outlined`, etc.
  - [ ] `src/main.ts` — `createVuetify({ theme: { defaultTheme: 'tixeo', themes: { tixeo: tixeoTheme } }, defaults: { VBtn: { variant: 'flat' }, VCard: { elevation: 0, variant: 'outlined' } } })`
- [ ] Layout wrappers (AC: #4)
  - [ ] `src/layouts/PmLayout.vue` — `v-app` root with `v-navigation-drawer` (persistent on desktop, `surface-variant` background for dark sidebar), `v-app-bar` top bar, `v-main` with a centered 1440px max-width container; `<router-view />` inside
  - [ ] `src/layouts/RespondentLayout.vue` — `v-app` root, no drawer/app-bar, `v-main` with a centered 480px max-width container and 16px mobile gutter; `<router-view />` inside
- [ ] Route-meta-driven layout selection (AC: #4)
  - [ ] `src/router.ts` — routes declare `meta: { layout: 'pm' | 'respondent' }`
  - [ ] `src/App.vue` — `<component :is="currentLayout"><router-view /></component>` where `currentLayout` is computed from `$route.meta.layout`
- [ ] Unsupported-viewport helper (AC: #5)
  - [ ] `src/composables/useBreakpoint.ts` — `const isDesktop = computed(() => window.innerWidth >= 1280)`; reactive to window resize
  - [ ] In `PmLayout.vue` (or a wrapping guard): if `!isDesktop` on a `/app/*` route, render a simple centered card with message sourced from `useCopy('common.unsupportedViewport')` (copy key registered in Story 1.7)
  - [ ] Applies only to `/app/*`; `/poll/*` must render normally on mobile (it IS mobile-first)
- [ ] `useApi()` composable (AC: #6)
  - [ ] `src/composables/useApi.ts` — singleton that returns an object with `.get(path, opts)`, `.post(path, body, opts)`, `.patch(...)`, `.delete(...)` methods
  - [ ] Prepends `/api/v1/` to every path; assumes backend is reachable via `window.location.origin` (Caddy reverse-proxy handles the `/api/*` route in prod; Vite proxy handles it in dev — see Dev Notes)
  - [ ] Generates `X-Request-ID` via `crypto.randomUUID()` on every request; exposes it on the returned response object for logging
  - [ ] On first PM-route call (path starts with `/api/v1/projects` or any CSRF-protected path), lazily fetches `GET /api/v1/csrf-token`, stashes the token in a module-local ref, and attaches `X-CSRF-Token` header on every subsequent non-GET
  - [ ] Parses response body: if `Content-Type: application/problem+json`, throws a typed error (`ValidationError` for 400, `ConflictError` for 409, `NotFoundError` for 404, `ServerError` for 500 — all subclasses of `KanoApiError` carrying the Problem Details payload)
  - [ ] For 204 No Content, returns `null` (not an error)
- [ ] Vite config: route-level code splitting (for NFR bundle size)
  - [ ] `vite.config.ts` — `build.rollupOptions.output.manualChunks` function: route paths starting with `/app/` land in `pm` chunk; paths starting with `/poll/` land in `respondent` chunk
  - [ ] Add `build.chunkSizeWarningLimit: 200` (warns on any chunk over 200KB uncompressed)
- [ ] Automated contrast checks (AC: #7)
  - [ ] `tests/unit/theme-contrast.spec.ts` — Vitest spec that imports `tixeoTheme`, iterates defined foreground/background pairs, computes WCAG contrast ratio via a tiny helper (or `wcag-contrast` npm lib), asserts ≥4.5:1 for body, ≥3:1 for large/UI
- [ ] Colorblind validation (AC: #8)
  - [ ] Generate simulated palettes via a one-off script using `@bjornlu/colorblind` or similar; save PNG snapshots of the Kano category swatches under `docs/accessibility/colorblind-simulator-kano-palette.png`
  - [ ] `docs/accessibility/kano-palette-validation.md` — document the protanopia/deuteranopia/tritanopia checks with the snapshots embedded

## Dev Notes

### Why this story is foundational

Two downstream concerns hang off this story:

1. **Every feature story** mounts routes under `/app/*` or `/poll/*` and expects the layout chrome + theme to be in place. No PR after this one should need to touch `main.ts` or the theme.
2. **Every backend call** from the frontend flows through `useApi`. This is the one place where request-id, CSRF, and Problem Details parsing are centralized — per architecture D10, the wrapper is ~40 LoC and has zero deps beyond native `fetch`.

### Vuetify 4 vs 3 — architecture decision

Architecture decision D1 locks **Vuetify 4.x** (stable Feb 2026). If Story 1.1's scaffolder defaulted to v3, upgrade here: `npm install vuetify@^4`. Vuetify 4 changed the theme composition slightly; confirm the `ThemeDefinition` shape against Vuetify 4 docs at implementation time.

### Font loading

Self-host Inter (preferred over Google Fonts for privacy / reliability on a public deployment). Use `@fontsource/inter` npm package: `npm install @fontsource/inter` then import in `main.ts`: `import '@fontsource/inter/400.css'; import '@fontsource/inter/500.css'; import '@fontsource/inter/600.css'; import '@fontsource/inter/700.css'`.

Tabular numerals (AC #2) — apply via a CSS class `.tabular-nums { font-variant-numeric: tabular-nums; }` and use in the Analysis page components (Epic 5).

### Vite dev proxy for `/api/*`

```ts
// vite.config.ts
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:5000',
      changeOrigin: true,
    },
  },
}
```

In production, Caddy handles the `/api/*` reverse-proxy (Story 7.2). The Vue app always calls `/api/v1/...` — never the full origin.

### `useApi` typed errors

```ts
export class KanoApiError extends Error {
  constructor(public problem: ProblemDetails, public status: number) {
    super(problem.title);
  }
}
export class ValidationError extends KanoApiError {}
export class ConflictError extends KanoApiError {}
export class NotFoundError extends KanoApiError {}
export class ServerError extends KanoApiError {}
```

Component code then does:

```ts
try { await api.post('projects', body); }
catch (e) {
  if (e instanceof ValidationError) { /* inline form errors */ }
  else if (e instanceof ConflictError) { /* epoch-bump banner */ }
  else throw e; // bubble to global handler
}
```

### Route-level code-split and respondent bundle

Per NFR and architecture §Frontend Architecture, the respondent initial bundle target is **<150 KB gzipped**. The `manualChunks` strategy plus route-level dynamic imports (`component: () => import('./routes/poll/Landing.vue')`) enforce the split. **Respondent routes must not statically import `src/routes/app/**` components or PM-only Vuetify components** (like `v-data-table`). Verify after CI bundle-size check lands in Story 1.10.

### Not in scope

- The copy deck and `useCopy` composable — Story 1.7. In this story, reference `useCopy('common.unsupportedViewport')` as a placeholder; it will resolve once 1.7 lands. If that's awkward, coordinate ordering with the user — 1.7 may need to land alongside or before 1.6.
- Actual `/app/*` and `/poll/*` page components — Epic 2 (PM), Epic 3 (poll stub), Epic 4 (respondent). In this story, register placeholder routes (`<div>PM Projects placeholder</div>`) so the layout selection can be E2E-verified.
- The theme audit screen — Story 1.8.
- Custom components (`KanoLikert`, `KanoStackedBar`, etc.) — Epics 4 and 5.

### Testing standards

- Vitest specs co-located with components (`PmLayout.vue` + `PmLayout.spec.ts`).
- Theme contrast spec is a pure unit test; no DOM needed.
- Playwright E2E deferred to Story 1.8 (theme audit) which exercises the full theme + accessibility scan together.

### Project Structure Notes

Files created:
- `kano-frontend/src/main.ts` (replaces/extends Vuetify scaffolder's default)
- `kano-frontend/src/App.vue` (simplify to `<component :is="layout"><router-view /></component>`)
- `kano-frontend/src/router.ts`
- `kano-frontend/src/theme/tixeo.ts`, `overrides.scss`
- `kano-frontend/src/layouts/PmLayout.vue`, `RespondentLayout.vue`
- `kano-frontend/src/composables/useApi.ts`, `useBreakpoint.ts`
- `kano-frontend/src/api/types.ts` (shared `ProblemDetails` type + error classes)
- `kano-frontend/vite.config.ts` (add chunk strategy + proxy)
- `kano-frontend/src/theme/tixeo.spec.ts` or `tests/unit/theme-contrast.spec.ts`
- `kano-frontend/docs/accessibility/kano-palette-validation.md` + image

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Color System] — full Tixeo + Kano palette with hex values
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Typography System] — rem-based scale, two body sizes
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Spacing & Layout Foundation] — 4px base unit, container widths
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design System Foundation] — Vuetify adoption strategy
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — route structure + layout + code-split contract
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — `useApi` behavioral contract (D10)
- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — WCAG 2.1 AA + axe-core gate (contrast checks here feed the CI gate)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.6] — original AC source

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
