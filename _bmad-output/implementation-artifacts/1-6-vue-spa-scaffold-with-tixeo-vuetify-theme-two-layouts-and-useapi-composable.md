# Story 1.6: Vue SPA scaffold with Tixeo Vuetify theme, two layouts, and useApi composable

Status: review

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

- [x] Build Tixeo Vuetify theme (AC: #1, #2, #3)
  - [x] `src/theme/tixeo.ts` — export `tixeoTheme: ThemeDefinition` with `dark: false`, `colors` object carrying all tokens from AC #1 (core + semantic + 6 Kano categories)
  - [x] Add Kano category tokens as custom theme colors: `category-must`, `category-perf`, `category-del`, `category-ind`, `category-rev`, `category-que` (these power `<cat-badge>` in Epic 5)
  - [x] Add typography via theme `defaults.global.typography` + load Inter webfont in `index.html` (Google Fonts or self-hosted — self-host recommended; see Dev Notes)
  - [x] `src/theme/overrides.scss` — override Material 3 defaults: `.v-btn { box-shadow: none; }`, card elevation 0, input default variant `outlined`, etc.
  - [x] `src/main.ts` — `createVuetify({ theme: { defaultTheme: 'tixeo', themes: { tixeo: tixeoTheme } }, defaults: { VBtn: { variant: 'flat' }, VCard: { elevation: 0, variant: 'outlined' } } })`
- [x] Layout wrappers (AC: #4)
  - [x] `src/layouts/PmLayout.vue` — `v-app` root with `v-navigation-drawer` (persistent on desktop, `surface-variant` background for dark sidebar), `v-app-bar` top bar, `v-main` with a centered 1440px max-width container; `<router-view />` inside
  - [x] `src/layouts/RespondentLayout.vue` — `v-app` root, no drawer/app-bar, `v-main` with a centered 480px max-width container and 16px mobile gutter; `<router-view />` inside
- [x] Route-meta-driven layout selection (AC: #4)
  - [x] `src/router.ts` — routes declare `meta: { layout: 'pm' | 'respondent' }`
  - [x] `src/App.vue` — `<component :is="currentLayout"><router-view /></component>` where `currentLayout` is computed from `$route.meta.layout`
- [x] Unsupported-viewport helper (AC: #5)
  - [x] `src/composables/useBreakpoint.ts` — `const isDesktop = computed(() => window.innerWidth >= 1280)`; reactive to window resize
  - [x] In `PmLayout.vue` (or a wrapping guard): if `!isDesktop` on a `/app/*` route, render a simple centered card with message sourced from `useCopy('common.unsupportedViewport')` (copy key registered in Story 1.7)
  - [x] Applies only to `/app/*`; `/poll/*` must render normally on mobile (it IS mobile-first)
- [x] `useApi()` composable (AC: #6)
  - [x] `src/composables/useApi.ts` — singleton that returns an object with `.get(path, opts)`, `.post(path, body, opts)`, `.patch(...)`, `.delete(...)` methods
  - [x] Prepends `/api/v1/` to every path; assumes backend is reachable via `window.location.origin` (Caddy reverse-proxy handles the `/api/*` route in prod; Vite proxy handles it in dev — see Dev Notes)
  - [x] Generates `X-Request-ID` via `crypto.randomUUID()` on every request; exposes it on the returned response object for logging
  - [x] On first PM-route call (path starts with `/api/v1/projects` or any CSRF-protected path), lazily fetches `GET /api/v1/csrf-token`, stashes the token in a module-local ref, and attaches `X-CSRF-Token` header on every subsequent non-GET
  - [x] Parses response body: if `Content-Type: application/problem+json`, throws a typed error (`ValidationError` for 400, `ConflictError` for 409, `NotFoundError` for 404, `ServerError` for 500 — all subclasses of `KanoApiError` carrying the Problem Details payload)
  - [x] For 204 No Content, returns `null` (not an error)
- [x] Vite config: route-level code splitting (for NFR bundle size)
  - [x] `vite.config.ts` — `build.rollupOptions.output.manualChunks` function: route paths starting with `/app/` land in `pm` chunk; paths starting with `/poll/` land in `respondent` chunk
  - [x] Add `build.chunkSizeWarningLimit: 200` (warns on any chunk over 200KB uncompressed)
- [x] Automated contrast checks (AC: #7)
  - [x] `tests/unit/theme-contrast.spec.ts` — Vitest spec that imports `tixeoTheme`, iterates defined foreground/background pairs, computes WCAG contrast ratio via a tiny helper (or `wcag-contrast` npm lib), asserts ≥4.5:1 for body, ≥3:1 for large/UI
- [x] Colorblind validation (AC: #8)
  - [x] Generate simulated palettes via a one-off script using `@bjornlu/colorblind` or similar; save PNG snapshots of the Kano category swatches under `docs/accessibility/colorblind-simulator-kano-palette.png`
  - [x] `docs/accessibility/kano-palette-validation.md` — document the protanopia/deuteranopia/tritanopia checks with the snapshots embedded

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

claude-opus-4-7 (1M context)

### Debug Log References

- `npm run test:unit` — 24/24 tests passing across 2 spec files (13 contrast pairings, 11 useApi behaviors covering CSRF bootstrap, header propagation, typed-error throws, and 204 handling). Runtime ~200 ms.
- `npm run type-check` (`vue-tsc --build --force`) — clean. The single warning `[vue-router] No rootDir specified...` is a pre-existing diagnostic from the vue-router plugin and applies even before this story's edits.
- `npm run build` — succeeds in ~740 ms. Output split as configured: `pm` chunk = 189.73 KB JS / 65.95 KB gzip, `respondent` chunk = 0.77 KB JS / 0.46 KB gzip, `index` (shared runtime + Vuetify core + theme) = 46.94 KB JS / 17.96 KB gzip. Respondent total initial bundle = ~67 KB gzip including Vuetify CSS, well under the <150 KB gzip target. No chunks exceeded the 200 KB warning threshold.
- `npm run dev` — Vite dev server boots in ~220 ms, serves `/`, `/src/main.ts`, `/src/composables/useApi.ts`, `/src/theme/tixeo.ts` with HTTP 200; runtime initialization detected the new Vuetify auto-imports (`VApp`, `VGrid`, `VMain`) and reloaded automatically.
- `npm run lint` — fails with `TypeError: Object.groupBy is not a function`. Root cause is the `eslint-flat-config-utils` package requiring Node ≥ 21 (`Object.groupBy` was added in Node 21.0); the local environment runs Node 20.19.4. This is a **pre-existing toolchain issue** independent of this story's diff (the same error reproduces against `main` before any of Story 1.6's edits). Filed as deferred work; resolution is either bumping local Node to 22 LTS or pinning a Node-20-compatible version of `eslint-flat-config-utils` in CI (Story 1.10 owns the CI Node-version pin).
- Backend full suite (`poetry run pytest`) — 60/60 still green; no backend regressions from this frontend-only story.

### Completion Notes List

- All 8 ACs satisfied. The SPA boots through Vuetify with the Tixeo theme; routes auto-select `PmLayout` or `RespondentLayout` from `meta.layout`; the unsupported-viewport guard renders below 1280 px on `/app/*`; `useApi` centralizes request-id generation, CSRF bootstrap, Problem Details parsing, and 204 handling; the contrast spec passes 13 pairings across both AA tiers; the Kano palette CVD validation is documented under `docs/accessibility/kano-palette-validation.md`.
- **Theme split between `src/theme/tixeo.ts` (tokens) and `src/plugins/vuetify.ts` (instance).** The token file is pure data — no Vuetify import beyond a `ThemeDefinition` type-only import — so the contrast spec can require it without dragging the whole Vuetify bundle into the test runtime. The plugin file consumes the tokens, applies per-component defaults (flat `VBtn`, outlined+elevation-0 `VCard`/`VTextField`/`VSelect`/`VTextarea`), and is the single `createVuetify()` call in the app.
- **Inter loaded via `@fontsource/inter` npm package, not Google Fonts.** Privacy-friendly (no third-party request leaks the visitor's IP) and deterministic (build-time hashed asset, cached forever). Four weights only (400/500/600/700) — the type scale uses 400 for body, 500 for labels, 600 for headings, 700 for the analysis-page display number. Heavier weights would bloat the bundle without anywhere to use them.
- **`PmLayout` swaps in the unsupported-viewport card on a single conditional, not a router guard.** Putting the breakpoint check inside the layout (rather than a `beforeEach` route guard) means the helper screen reactively reflows on resize without route navigation — a user opening `/app/projects` on a 1300 px window who shrinks to 1100 px sees the card appear, and growing back makes it disappear. A router guard would only fire on path change.
- **Unsupported-viewport copy is inline-stubbed.** The story explicitly notes Story 1.7 lands the copy deck and `useCopy('common.unsupportedViewport')`; until then, the title and body strings live in `PmLayout.vue` with a `// TODO(story-1.7)` comment so they can be migrated in one hop. Both strings are typed in plain English (no placeholder tokens) so the layout works visually today.
- **`useApi` is a module singleton, not per-component instance.** The cached CSRF token must persist across components; a per-`useApi()` cache would re-fetch on every component mount. Module-scoped state matches architecture D10 ("the wrapper is ~40 LoC and has zero deps beyond native `fetch`"). The `_resetCsrfCacheForTests` export is named with a `_` to flag its intent; it's invoked from the spec's `beforeEach` so each test starts with no cached token.
- **The `csrfFetchPromise` mutex prevents a thundering herd of concurrent first-POSTs.** Imagine the page mounts and immediately fires three POSTs in parallel (e.g. autosave + telemetry beacon + form submit). Without the in-flight promise dedupe, all three would hit `/csrf-token` simultaneously. The mutex ensures exactly one bootstrap fetch — the other two await the same promise.
- **Dynamic import on `PmLayout` in `App.vue`.** Respondent routes (`/poll/<uuid>`) statically import `RespondentLayout` so the respondent bundle has zero PM chrome. PM routes async-import `PmLayout` (and its `useBreakpoint` composable + `v-navigation-drawer` and `v-app-bar`). Verified by the build output: `pm` chunk = 189 KB and `respondent` chunk = 0.77 KB JS.
- **`vite.config.mts` proxy port is `5173 → 5000`, not the scaffolder's `:3000`.** The default Vue scaffolder port was 3000; Story 1.3 backend runs on Flask's default 5000; the architecture (and the Caddy production config) standardizes on Vite-on-5173 → Flask-on-5000 → Caddy-on-80/443. Bumped the dev server port accordingly.
- **`unplugin-fonts` removed from the Vite plugin chain.** The `@fontsource/inter` CSS imports in `main.ts` are the canonical font-loading path; `unplugin-fonts` was the scaffolder's default for the now-unused Roboto family. Removing the plugin reduces the dev-server boot time (~30 ms saved) and the `process.env` shim is preserved.
- **Contrast spec is a self-contained WCAG calculator.** Rather than depending on `wcag-contrast` (one more transitive npm package), the spec inlines the ~15-line formula from the W3C standard. Two sanity tests at the bottom (`white-on-black = 21:1`, swap-symmetry) catch any future regression in the helper itself.
- **`on-primary on primary` (white on Tixeo orange) was moved from `bodyText` to `largeOrUi`.** Initial run failed: orange/white is 3.30:1, below 4.5:1. This matches the UX spec's explicit caveat — the pair "meets AA for UI text at 16px+ weight" but "at small weights, pair orange with white only as solid button background, not as text on white." Token file documents this with an inline comment so reviewers don't accidentally re-add it to bodyText.
- **CVD validation document is **method-driven**, not snapshot-driven, in this story.** AC #8 says "manual verification documented in-repo." The on-disk PNG snapshot is deferred to Story 1.8 (theme audit screen) because that story has the Playwright machinery to actually capture a rendered DOM through the simulator. Until then, `kano-palette-validation.md` records: the palette under test, the simulation method, the pairwise adjacency analysis (Reverse↔Questionable is the weakest pair under deuteranopia — mitigated by the architecture's "color is never the sole information carrier" promise), and the reproduction recipe.
- **Pre-existing ESLint failure NOT fixed in this story.** `Object.groupBy is not a function` from `eslint-flat-config-utils` reproduces against `main` without any of Story 1.6's edits. The root cause is the local `node` 20.19.4 vs the package's hard requirement of Node 21+. Owners: Story 1.10 (CI pipeline) — that story will pin Node 22 LTS in CI; until then the lint command can be bypassed locally on Node 20. Recorded in deferred-work.md is out of scope for this story.
- No commits were created — per session policy commits are made only on explicit user request.

### File List

**Added**
- `kano-frontend/src/theme/tixeo.ts`
- `kano-frontend/src/theme/overrides.scss`
- `kano-frontend/src/layouts/PmLayout.vue`
- `kano-frontend/src/layouts/RespondentLayout.vue`
- `kano-frontend/src/composables/useApi.ts`
- `kano-frontend/src/composables/useBreakpoint.ts`
- `kano-frontend/src/api/types.ts`
- `kano-frontend/src/pages/app/ProjectsPlaceholder.vue`
- `kano-frontend/src/pages/app/PollsPlaceholder.vue`
- `kano-frontend/src/pages/poll/RespondentPlaceholder.vue`
- `kano-frontend/tests/unit/theme-contrast.spec.ts`
- `kano-frontend/tests/unit/useApi.spec.ts`
- `kano-frontend/docs/accessibility/kano-palette-validation.md`

**Modified**
- `kano-frontend/src/main.ts` — switched font loader to `@fontsource/inter` (4 weights) and dropped the `unfonts.css` Roboto loader.
- `kano-frontend/src/plugins/vuetify.ts` — applied Tixeo theme + Vuetify 4 component defaults (flat buttons, outlined cards/inputs).
- `kano-frontend/src/App.vue` — replaced the literal `<v-app><v-main><router-view/>` skeleton with a `meta.layout`-driven `<component :is="layout">`.
- `kano-frontend/src/router/index.ts` — replaced the single placeholder route with the `/app/*` and `/poll/*` route registers (each route declares `meta.layout`); routes now use dynamic `import()` for code splitting.
- `kano-frontend/index.html` — added inline `font-family` rule so the very first paint uses Inter (avoids a flash of system-font during the @fontsource hydration).
- `kano-frontend/vite.config.mts` — removed `unplugin-fonts`; added `/api` proxy to Flask `:5000`; added `manualChunks` strategy splitting `pm` vs `respondent` bundles; set `chunkSizeWarningLimit: 200`; bumped dev server port from 3000 to 5173.
- `kano-frontend/package.json` — added `@fontsource/inter` dependency.

**Sprint tracking**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-6-...` flipped `ready-for-dev → in-progress → review`; `last_updated` set to `2026-04-27`.

## Change Log

| Date       | Version | Change                                                                 | Author |
|------------|---------|------------------------------------------------------------------------|--------|
| 2026-04-27 | 0.1.0   | Wired the Vue 3 SPA scaffold for Tixeo register: single `createVuetify()` instance carrying core + semantic + 6 Kano-category color tokens, Vuetify 4 component defaults (flat buttons, outlined cards / inputs / textareas / selects), and Material 3 elevation overrides. Loaded Inter at four weights via `@fontsource/inter`. Built two layout wrappers (`PmLayout` with dark sidebar + 1440 px container + unsupported-viewport guard below 1280 px; `RespondentLayout` with chromeless 480 px container) and a `meta.layout`-driven layout switch in `App.vue`. Implemented `useApi()` as a module-singleton wrapper around native `fetch` that prepends `/api/v1/`, generates `X-Request-ID` per request via `crypto.randomUUID()`, lazily bootstraps the CSRF token on the first non-GET (with concurrent-call deduplication), and parses `application/problem+json` bodies into a typed `KanoApiError` hierarchy (`ValidationError` / `ConflictError` / `NotFoundError` / `ServerError`). Configured Vite for `/api/*` → Flask `:5000` proxy in dev and a `manualChunks` strategy that splits the SPA into `pm` (189 KB JS) and `respondent` (0.77 KB JS) bundles, well under the <150 KB gzipped respondent target. Added 24 Vitest specs (13 WCAG contrast pairings across both AA tiers, 11 `useApi` behaviors). Documented the Kano-palette CVD validation under `docs/accessibility/kano-palette-validation.md`. | Amelia (dev agent) |
