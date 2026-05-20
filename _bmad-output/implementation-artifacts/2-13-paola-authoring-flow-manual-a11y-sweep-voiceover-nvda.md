# Story 2.13: Paola authoring flow manual a11y sweep (VoiceOver + NVDA)

Status: in-progress

## Story

As a solo dev,
I want manual accessibility validation of Paola's full authoring + epoch flow with VoiceOver (macOS) and NVDA (Windows),
so that keyboard-first does not mean screen-reader-broken — field labels, save-state transitions, epoch-bump dialog focus handling, and inline-edit commits all announce correctly to assistive tech.

## Acceptance Criteria

1. **Given** Stories 2.9, 2.10, 2.11, 2.12 have landed (projects + detail + FeatureListEditor + EpochBump pattern + EpochSelector), **when** Kanaud executes the documented manual a11y checklist for Paola's authoring surface, **then** VoiceOver on macOS Safari correctly announces: project name/version fields on focus, each FeatureListEditor cell label and current value on Tab, inline-edit commit (Enter) as a state change, EpochBumpDialog title and consequence list when it opens, and focus-return to the triggering edit site when the dialog dismisses.
2. NVDA on Windows Firefox announces the same events consistently (noting any cross-platform differences documented as known issues).
3. Focus management is correct end-to-end: no focus traps, no focus-loss on route transition, modal open/close restores focus to trigger, `<EpochSelector>` dropdown arrow-key navigation is audible.
4. `axe-core` CI check on `/app/projects`, `/app/projects/:id`, and `/app/projects/:id?epoch=N` reports zero violations across populated and empty states.
5. The manual checklist results are committed as `docs/a11y/paola-authoring-checklist.md` with a dated signoff and screenshots of any issues found/fixed.
6. Any issues discovered are either fixed in this story or filed as follow-up tickets with explicit acceptance criteria.

## Tasks / Subtasks

- [x] Author the manual checklist (AC: #1, #2, #5)
  - [x] `docs/a11y/paola-authoring-checklist.md` — sections:
    - **Environment setup**: macOS + Safari + VoiceOver; Windows (VM acceptable) + Firefox + NVDA; both latest stable versions
    - **Checklist per screen**:
      - `/app/projects` (empty state): VO/NVDA announces page title, empty-state CTA; Tab lands on CTA; Enter activates
      - `/app/projects` (populated): table rows announce name + version + epoch + date; row Enter/Click navigates; "New project" button announces; inline form cells announce labels
      - `/app/projects/:id`: name + version inline-edit announces label on focus, announces "edit mode" on click, announces committed value on Enter
      - `<FeatureListEditor>`: each cell announces its column (name/description) and current value; empty row announces "Add feature" placeholder; Tab order is correct; Backspace-on-empty announces "deleted feature {name}"
      - `<EpochBumpDialog>`: dialog announces role="dialog" + title on open; body content is read; buttons are focusable with Tab; Escape announces closure
      - `<EpochBumpBanner>`: `role="status"` live region announces without stealing focus
      - `<EpochSelector>`: trigger announces "Version {n}, has popup, listbox"; arrow keys announce items; selection announces navigation
    - **Issue log**: table for findings (platform / screen / severity / status)
    - **Signoff**: date + initials per platform
- [ ] Execute the checklist *(human-only — VoiceOver / NVDA cannot be driven by the dev agent. **Explicitly deferred 2026-05-20 by Kanaud to unblock Epic 3 progression.** Hard deadline: complete before Story 5-8 (analysis-surface a11y close-out) ships, so the full WCAG 2.1 AA MVP gate clears at the Epic 5 retrospective. Tracked in `deferred-work.md` under the 2026-05-20 sweep.)*
  - [ ] Run on both platforms; capture screenshots of any issues
  - [ ] File issues for any finding marked "defect" — either fix inline (update the responsible component file and reference the fix commit in the checklist) or open a tracked follow-up
- [x] Extend CI axe-core coverage (AC: #4)
  - [x] `e2e/pm/a11y-paola.spec.ts`: navigates to `/app/projects` (empty + populated), `/app/projects/:id` (empty + populated), and `/app/projects/:id?epoch=1` (past-epoch); each runs `AxeBuilder().withTags(['wcag2a','wcag2aa']).analyze()` and asserts zero violations
  - [x] Seed helpers: `seedAllRoutes(page)` intercepts `/api/v1/projects/`, the per-project GETs, the past-epoch features GET, and the CSRF-token endpoint at the Playwright `route()` level — fast, deterministic, no docker-compose dependency. Documented in the spec's header why this beats a full-stack fixture for the PM SPA.
- [x] Focus-management Playwright tests (AC: #3)
  - [x] Modal open/close: spec opens `EpochBumpDialog` by editing a feature against a mocked 409 `epoch-bump-required` response, asserts focus is inside the dialog on open, then asserts `document.activeElement !== document.body` after cancel. Source fixes wired in `EpochBumpDialog.vue` (autofocus Cancel via `onMounted` + `watch(modelValue)`) and `ProjectDetail.vue` (capture stable selector before open; restore via rAF×2 after Vuetify focus-trap teardown).
  - [x] Route transition: navigate `/app/projects` → `/app/projects/:id` asserts focus is not on `<body>`; source fix in `ProjectDetail.vue` focuses `data-testid="project-name-display"` on `onMounted` so SR users land on the page heading.

## Dev Notes

### Why this story is the Epic 2 gate

PRD NFR9–11 + Readiness Gates make WCAG 2.1 AA + axe-core in CI non-negotiable. The earlier automated checks (axe-core in CI from Story 1-10, Playwright specs throughout) catch structural violations. This story is the **manual verification** that no automatable gap has slipped through — specifically around screen-reader semantic quality, which axe can't fully assess.

Schedule this story **after** 2-9 through 2-12 merge — there's nothing to test until the full authoring UI is in place.

### VM / hardware needs

VoiceOver ships with macOS — Kanaud's Mac should have it. NVDA is free on Windows — if there's no Windows machine, run NVDA in a Windows 10 VM via VirtualBox or use BrowserStack's remote-desktop tier. Document whichever path is used.

### What to do when an issue is found

- **Trivial fix** (e.g., missing `aria-label` on an icon button): fix in the responsible component, note in checklist, re-verify
- **Complex fix**: file a follow-up story in sprint-status (or GitHub Issue), document in the checklist with the tracking link, gate: the story ships without 100% resolution as long as the issue log is public and severity isn't blocker

### Not in scope

- Respondent-surface a11y (Epic 4 has its own sweep, Story 4-8)
- Analysis-surface a11y (Epic 5 has its own, Story 5-8)
- AAA-level compliance

### Project Structure Notes

Files:
- `docs/a11y/paola-authoring-checklist.md`
- `kano-frontend/e2e/pm/a11y-paola.spec.ts`
- Any fix commits referenced from the checklist

### References

- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — WCAG 2.1 AA + axe-core gate
- [Source: _bmad-output/planning-artifacts/prd.md#MVP Readiness Gates] — full E2E Playwright suite green before first PM study
- [Source: _bmad-output/planning-artifacts/architecture.md#Accessibility] — axe-core CI enforcement
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility Considerations] — keyboard parity, focus rings, screen-reader semantics (line 576)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.13] — original AC

## Dev Agent Record

### Agent Model Used
Claude Opus 4.7 (1M context) — `claude-opus-4-7[1m]`

### Debug Log References
- `npx playwright test e2e/pm/a11y-paola.spec.ts` — 8/8 passing post-fix; first run surfaced 7 failures (5× axe-core color-contrast on `pm-nav-link`, route-transition focus loss, modal-focus race + post-close focus loss).
- `npm run test:unit` — 121/121 passing (no regressions on FeatureListEditor / EpochBumpDialog unit specs after dialog autofocus + ProjectDetail focus-capture wiring).
- `npm run type-check` — clean (vue-router's `rootDir` warning is pre-existing, unrelated).
- `npm run lint` — pre-existing tooling break (`eslint-flat-config-utils` requires `Object.groupBy`, available Node ≥ 21). Not caused by this story; flagged separately.

### Completion Notes List
- **Story scope is asymmetric by design.** The "execute the checklist" task is a human-only action — VoiceOver and NVDA cannot be driven from this agent. The dev agent delivers: (1) the comprehensive checklist; (2) automated axe-core + focus-management coverage that exercises the same surfaces; (3) inline fixes for every defect the automated coverage uncovered. The SR-driven sweep + sign-off rows remain for Kanaud to complete before the story can move past `review`.
- **Three real WCAG 2.1 AA defects were uncovered and fixed** during automated coverage authoring (logged in `docs/a11y/paola-authoring-checklist.md` issue table):
  1. PM nav drawer contrast — `theme="dark"` on `<v-navigation-drawer>` triggered Vuetify's built-in dark palette, where `surface-variant` resolves to `#c8c8c8`; pm-nav-link white text was 1.67:1 on every PM page. Removed `theme="dark"`; Tixeo's own surface-variant (`#1C1F26`) gives ~16:1.
  2. Route-transition focus loss — `/app/projects` → `/app/projects/:id` left focus on `<body>` after row activation. `ProjectDetail.vue` now focuses `data-testid="project-name-display"` on `onMounted`.
  3. EpochBumpDialog focus management — two layered bugs: (a) Vuetify 4 focus-trap initialises a frame after `modelValue` flips, racing assertions and leaving focus on the triggering cell; (b) on cancel the dialog unmounts via `v-if="dialogContext"` and the previously-captured `HTMLElement` reference may be re-rendered out by `store.refreshCurrent()`, so a sync or `nextTick` focus restore lands on `<body>`. Fix: `EpochBumpDialog` autofocuses Cancel via `onMounted` + `watch(modelValue)` (Cancel-first is the safer default for a destructive bump); `ProjectDetail` captures a *stable selector* via `[data-feature-key]` ancestor + aria-label, and restores via `requestAnimationFrame×2` to outlast both Vuetify's trap teardown and the `refreshCurrent()` re-render. Also guarded the capture against double-emit when the trigger input's `@blur` re-fires `commitRow` (the dialog opens, Vuetify steals focus → @blur → 2nd 409 → 2nd `epoch-bump-required` emit) — keeps the FIRST capture, which is the actual trigger cell.
- The Playwright spec mocks `/api/v1/...` at the `page.route()` level rather than running the full docker-compose stack. Rationale documented in the spec header.
- Future enhancement candidates surfaced during this sweep (not in scope; not blocking):
  - inline-edit name `Esc` does not currently re-focus the display span (existing test comments this as "future enhancement"). Same focus-management primitive could be reused.
  - `EpochSelector` and `EpochBumpBanner` only have axe-coverage on the parent page; targeted focus-management specs would tighten AC #3 coverage further. Manual checklist still covers them.

### File List
**Added**
- `docs/a11y/paola-authoring-checklist.md` — manual VO + NVDA checklist with environment, per-screen tables, issue log (3 fixed findings already recorded), sign-off section
- `kano-frontend/e2e/pm/a11y-paola.spec.ts` — 5 axe-core gates + 3 focus-management Playwright tests

**Modified**
- `kano-frontend/src/layouts/PmLayout.vue` — drop `theme="dark"` on the nav drawer (fix #1)
- `kano-frontend/src/pages/app/ProjectDetail.vue` — `nameDisplay` ref + `onMounted` focus; stable-selector capture / rAF×2 restore for epoch-bump dialog (fixes #2, #3)
- `kano-frontend/src/components/EpochBumpDialog.vue` — explicit Cancel autofocus on open via `onMounted` + `watch(modelValue)` (fix #3a)

### Change Log
- 2026-05-20 — Manual a11y checklist authored; axe-core + focus-management Playwright suite extended to cover the three Paola URLs (empty + populated + past-epoch states) and the modal/route focus invariants. Three WCAG 2.1 AA defects fixed inline (nav drawer contrast, route-transition focus, EpochBumpDialog focus management). Story status → `review` pending human VO/NVDA sweep.
- 2026-05-20 (later) — Manual VO/NVDA sweep **explicitly deferred at Kanaud's direction** so Epic 3 work can proceed in parallel. Dev portion is complete and verified (axe-core green; 8/8 Playwright; 121/121 unit; type-check clean). The SR signoff remains an outstanding pre-MVP gate with a concrete deadline of **before Story 5-8 ships** (the parallel analysis-surface a11y close-out is the natural sibling and gates the Epic 5 retrospective). Tracked in `deferred-work.md` under the "Deferred from: adversarial review of Epic 2 (2026-05-20)" section. Story keeps `in-progress` status in `sprint-status.yaml` as a standing reminder, and the "Execute the checklist" task stays unchecked rather than falsified.
