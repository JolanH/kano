# Story 1.8: Theme audit screen as day-zero verification artifact

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a solo dev,
I want a developer-only `/dev/theme-audit` route exercising every Vuetify primitive and Tixeo token the product will use,
so that the Tixeo theme is verifiably audited rather than assembled, and any future theme-drift regression is caught on sight.

## Acceptance Criteria

1. **Given** I visit `/dev/theme-audit` in development mode, **when** the page renders, **then** it displays each Vuetify primitive the product depends on: buttons (primary/secondary/tertiary at 32/40/48 sizes), text fields, textareas, radio groups, data tables, dialogs, tooltips, snackbars, progress-linear, alerts (info/success/warning/error), cards, lists, tabs, menus, navigation drawer, app bar, skeleton loaders.
2. Each of the 6 Kano category swatches is displayed with its hex value and category label.
3. The type scale is rendered (Display / H1 / H2 / H3 / Body PM / Body Respondent / Body-large Respondent / Label / Caption) with the Tixeo sans-serif family.
4. A visual sample of the Tixeo spacing scale (4/8/12/16/24/32/48/64 px) is rendered.
5. No Material-3 default styling is visible (default elevation shadows, default orange, default filled buttons, floating-label inputs) — all are Tixeo-overridden.
6. The route is only registered when `import.meta.env.DEV` is true, so it does not ship in production builds.
7. A Playwright test navigates to `/dev/theme-audit`, asserts zero console errors and zero `axe-core` violations, and captures a baseline screenshot committed to the repo as a visual-regression anchor.

## Tasks / Subtasks

- [ ] Theme audit page component (AC: #1–5)
  - [ ] `src/routes/dev/ThemeAudit.vue` — a single scrollable page divided into sections, each heading labeled by `useCopy('dev.themeAudit.<section>')`:
    - **Colors**: 6 Kano swatches (each: 48×48 color tile + hex + category label via `<cat-badge>` or equivalent); primary/surface/surface-variant/semantic swatches
    - **Typography**: one line per scale entry (Display, H1–H3, Body PM, Body Respondent, Body-large, Label, Caption) showing the Lorem-Ipsum text at that scale + font-family inspection note
    - **Spacing**: 8 horizontal bars, each labeled with its token and pixel value, with width equal to the token value for visual anchoring
    - **Buttons**: 3×3 matrix (primary/secondary/tertiary × small/default/large — i.e., 32/40/48px heights per AC #1) — 9 buttons total; states: default / hover (automatic) / disabled (one extra row)
    - **Inputs**: `v-text-field` outlined variant, `v-textarea` outlined, `v-select` outlined, `v-radio-group` (2–3 options), `v-checkbox` row, `v-switch` row
    - **Data table**: a `v-data-table` with 3 columns × 4 rows of placeholder data, demonstrating zebra rows, header, density
    - **Dialogs / menus / tooltips**: a button to open a `v-dialog`; a `v-menu` with 3 items; hover target with `v-tooltip`
    - **Snackbars**: buttons to trigger `success`, `error`, `info` variants
    - **Progress / skeleton / alerts**: `v-progress-linear` at 50%, `v-skeleton-loader` (card + list variants), `v-alert` variants for info/success/warning/error
    - **Lists / tabs**: `v-list` with 3–4 items; `v-tabs` with 3 tabs
    - **Navigation drawer preview**: render a secondary `v-navigation-drawer` inline (not as the page's primary drawer) with 3 demo items — or a static preview image if the inline approach conflicts with `PmLayout`
    - **App bar preview**: render a fragment of `v-app-bar` inline
  - [ ] Dev-only route guard (AC: #6):
    - In `src/router.ts`, conditionally add the route: `if (import.meta.env.DEV) { routes.push({ path: '/dev/theme-audit', component: () => import('./routes/dev/ThemeAudit.vue'), meta: { layout: 'pm' } }) }`
    - Verify: a production build (`npm run build`) does not include `ThemeAudit.vue` in any chunk (inspect `dist/` after build)
- [ ] Tixeo override evidence section (AC: #5)
  - [ ] Add inline comments on the page (or a collapsible "Override Evidence" section) annotating what's Tixeo-modified vs default Material: "Card elevation 0 (default was 1dp shadow)", "Primary button variant 'flat' (default was elevated)", "Input default variant 'outlined' (default was filled)", "TextField has no floating label (default was filled-label)"
- [ ] Playwright E2E + axe-core + baseline screenshot (AC: #7)
  - [ ] `e2e/pm/theme-audit.spec.ts`:
    - Navigate to `http://localhost:5173/dev/theme-audit` (started via `npm run dev` as Playwright `webServer` config)
    - Capture console errors via `page.on('console')` listener; assert zero errors after `page.goto` resolves
    - Run `@axe-core/playwright`: `const results = await new AxeBuilder({ page }).analyze(); expect(results.violations).toEqual([]);`
    - Take screenshot: `await page.screenshot({ path: 'e2e/screenshots/theme-audit-baseline.png', fullPage: true });` — **commit the PNG** to the repo as the visual-regression anchor
    - Subsequent runs compare against baseline via `await expect(page).toHaveScreenshot('theme-audit-baseline.png', { maxDiffPixelRatio: 0.01 });`

## Dev Notes

### Why a theme-audit screen

UX spec §Design System Foundation line 342 calls out: "A Tixeo-theme audit runs at every screen review during downstream UX work: no screen ships with visible Material-3 defaults." The theme-audit route is the continuous verification artifact — once baseline is locked, any future PR that accidentally restores a Material default fails the Playwright visual diff.

This is **development tooling**, not a user-facing feature. It ships only in dev builds (AC #6) — production bundle stays clean.

### Vuetify 4 primitive coverage

Every primitive the product uses (per UX spec §Component Strategy "Adopt directly" list at line 802) must appear on the audit page. If a primitive is added later to the project, add it to the audit page in the same PR.

Primitives to include (full list from AC #1 merged with UX spec §Component Strategy):

- `v-btn` (primary/secondary/tertiary × 3 sizes)
- `v-text-field`, `v-textarea`
- `v-radio-group`, `v-checkbox`, `v-switch`, `v-select`
- `v-data-table`
- `v-dialog`, `v-menu`, `v-tooltip`, `v-snackbar`
- `v-progress-linear`, `v-skeleton-loader`
- `v-alert` (info, success, warning, error)
- `v-card`, `v-list`, `v-tabs`
- `v-navigation-drawer`, `v-app-bar`
- `v-icon` (mdi sample row)

### Route guard pattern

Using `import.meta.env.DEV` rather than `NODE_ENV` — Vite's recommended idiom, statically tree-shakable. In production, the `if` branch dead-codes and the route import is eliminated entirely.

### Screenshot baseline discipline

Commit the baseline PNG. Reviewers of future theme-touching PRs look at the diff screenshot output in Playwright's report. Re-baseline (`--update-snapshots`) requires explicit intent and a PR description note.

### axe-core on the audit page

AC #7 zero-violations is a strong gate because the audit page intentionally stresses every primitive. If the audit page passes axe, most real screens also pass. The audit page functions as a **canary**: any Vuetify upgrade that regresses accessibility shows up here first.

### Dependencies

- Story 1.6 (theme + layouts + router) must be merged before this can run.
- Story 1.7 (copy deck) should be merged before or alongside — the audit page uses `useCopy('dev.themeAudit.<section>')` keys. Alternative: hard-code English labels in `ThemeAudit.vue` with a comment saying "dev-only page, exempt from copy-deck rule" and update `.eslintrc.cjs` to exempt `src/routes/dev/**` from `vue/no-bare-strings-in-template`. The **second option is simpler** and recommended.

### Not in scope

- No automated theme-token-vs-baseline diff. The Playwright screenshot diff catches visual regressions; token introspection would be overkill.
- No mobile/responsive testing on the audit page — it's a desktop dev tool. Playwright spec runs at default desktop viewport.

### Testing standards

- Playwright config (`playwright.config.ts` from Vuetify scaffolder) needs `webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI }`
- Install browsers in CI via `npx playwright install --with-deps` (Story 1.10 wires this into `ci.yml`)
- Baseline screenshot tolerance: `maxDiffPixelRatio: 0.01` — 1% pixel difference allowed (covers font antialiasing variance across OS)

### Project Structure Notes

Files created:
- `kano-frontend/src/routes/dev/ThemeAudit.vue`
- `kano-frontend/e2e/pm/theme-audit.spec.ts`
- `kano-frontend/e2e/screenshots/theme-audit-baseline.png` (committed)
- Edit `kano-frontend/src/router.ts` to conditionally register the dev route
- Edit `kano-frontend/.eslintrc.cjs` to exempt `src/routes/dev/**` from `vue/no-bare-strings-in-template` (see Dev Notes)

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design System Foundation] — Tixeo-theme audit mandate (line 342)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component Strategy] — Vuetify primitive list
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Visual Design Foundation] — color/typography/spacing specs (the audit page is a living render of these)
- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — WCAG 2.1 AA + axe-core gate
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8] — original AC source
- [Source: _bmad-output/implementation-artifacts/1-6-vue-spa-scaffold-*.md] — theme + layouts + router (hard dependency)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
