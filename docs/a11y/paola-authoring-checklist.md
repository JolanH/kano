# Paola authoring flow — manual a11y checklist (VoiceOver + NVDA)

**Story:** 2-13
**Status:** Awaiting human execution — Kanaud runs this against the merged Epic 2 build and signs off below.
**Last updated:** 2026-05-20

This checklist is the manual half of the Epic 2 a11y gate. The automatable
half lives in `kano-frontend/e2e/pm/a11y-paola.spec.ts` (axe-core +
focus-management Playwright tests). Together they fulfil PRD §NFR9–11 and
the architecture's "WCAG 2.1 AA + axe-core in CI" enforcement rule.

## Environment

| Platform | Browser | Screen reader | Notes |
|---|---|---|---|
| macOS (latest stable) | Safari (latest stable) | VoiceOver (built-in) | Cmd+F5 to start/stop VO; VO+→ / VO+← to navigate; VO+Space to activate; VO+U → "Form Controls" rotor for jumping between inputs |
| Windows (latest stable; VM acceptable) | Firefox (latest stable) | NVDA (https://nvaccess.org, free) | Caps Lock as the NVDA key; arrow keys browse; H/F/B/E to jump by headings/forms/buttons/edit fields |

**Setup:** spin up the stack via `docker compose up -d` (Story 1-9), open
`http://localhost:5173/app/projects`, and create at least the three seed
project states below:

- **Empty project** — created, no features
- **Populated project, no polls** — 3 features, no poll
- **Multi-epoch project** — 3 features at epoch 1, create a poll
  (manually via API / SQL or via Epic 3 once shipped), then PATCH a feature
  with `?acknowledged=true` to advance to epoch 2

If Epic 3 hasn't shipped a poll-creation UI yet, drop into the backend
container and run:

```sql
INSERT INTO polls (id, project_id, epoch, expires_at)
VALUES (gen_random_uuid(), '<project-id>', 1, NOW() + INTERVAL '7 days');
```

## Per-screen checklist

Mark each row Pass / Fail / Defect. "Defect" = needs a follow-up fix; cite
the GitHub issue in the **Notes** column.

### Screen: `/app/projects` (empty state)

| # | Check | VO/macOS | NVDA/Win | Notes |
|---|---|---|---|---|
| 1 | Page title announces on load |  |  | Should read "Projects" |
| 2 | Empty-state card is reachable via Tab |  |  | |
| 3 | "Create your first project" button announces with role=button |  |  | |
| 4 | Enter on the CTA opens the inline new-project form |  |  | |
| 5 | New-project form: name field announces its label |  |  | "Project name" |
| 6 | New-project form: version field announces its label |  |  | "Version label" |
| 7 | Tab order: CTA → name → version → Create → Cancel |  |  | No focus trap, no skipped steps |
| 8 | Esc on the form announces dismissal (focus returns to CTA) |  |  | |

### Screen: `/app/projects` (populated)

| # | Check | VO/macOS | NVDA/Win | Notes |
|---|---|---|---|---|
| 1 | Table announces its column headers (Name, Version, Current version, Created) |  |  | |
| 2 | Each row announces all four cells in sequence |  |  | |
| 3 | Enter on a row navigates to detail (announces page change) |  |  | |
| 4 | "New project" button announces role + label |  |  | |
| 5 | Tab order through rows is predictable (left-to-right, top-to-bottom) |  |  | |

### Screen: `/app/projects/:id`

| # | Check | VO/macOS | NVDA/Win | Notes |
|---|---|---|---|---|
| 1 | Page title (project name) announces on load |  |  | |
| 2 | Inline-editable project name: focusing the `<span>` announces "Project name (click to edit)" |  |  | aria-label |
| 3 | Enter on the focused name announces edit-mode entry |  |  | |
| 4 | Typing + Enter commits and announces the new value |  |  | |
| 5 | Esc reverts and announces cancellation |  |  | |
| 6 | Version label inline-editor: same checks |  |  | |
| 7 | Current-version chip is reachable + announces "Version N" |  |  | Never "Epoch" |
| 8 | EpochSelector trigger announces "Switch version, has popup, listbox" |  |  | aria-haspopup=listbox |
| 9 | Loading state announces (`pm.projectDetail.loading`) when navigating to an unknown project |  |  | |
| 10 | 404 state announces title + body + return CTA |  |  | |

### Screen: `<FeatureListEditor>`

| # | Check | VO/macOS | NVDA/Win | Notes |
|---|---|---|---|---|
| 1 | Grid root announces role=grid + label ("Feature list editor") |  |  | |
| 2 | Each existing row announces role=row |  |  | |
| 3 | Each cell announces its column label (Feature / Description) on Tab |  |  | |
| 4 | Cell value is read on focus (current name / description) |  |  | |
| 5 | Tab order: row-1 name → row-1 description → row-2 name → … → new-row name → new-row description |  |  | |
| 6 | New-row placeholder announces ("Add a feature…") |  |  | |
| 7 | Enter on new-row name commits + announces creation (focus returns to a fresh empty row) |  |  | |
| 8 | Esc on new-row clears + announces |  |  | |
| 9 | Backspace on an empty existing row deletes + announces; focus moves to the previous row |  |  | |
| 10 | Hover-revealed trash button is reachable via Tab (focus also reveals it) + announces "Delete feature" |  |  | aria-label |
| 11 | Pasting multi-line text creates N features + announces progress (or at minimum total count) |  |  | Partial credit if no individual announcement |

### Screen: `<EpochBumpDialog>`

| # | Check | VO/macOS | NVDA/Win | Notes |
|---|---|---|---|---|
| 1 | Dialog open announces role=dialog + title ("Create Version N+1?") |  |  | |
| 2 | Body paragraphs (preserved + newPolls) are read in order |  |  | |
| 3 | Focus moves into the dialog (default focus on the primary CTA) |  |  | Vuetify handles this; verify |
| 4 | Tab cycles within the dialog (focus trap) |  |  | |
| 5 | Esc closes the dialog + announces closure |  |  | |
| 6 | Cancel + Create CTAs announce their labels (no "Epoch" anywhere) |  |  | |
| 7 | On confirm: dialog announces close + focus returns to the triggering cell |  |  | |
| 8 | On confirm failure: error alert announces |  |  | aria-live |

### Screen: `<EpochBumpBanner>`

| # | Check | VO/macOS | NVDA/Win | Notes |
|---|---|---|---|---|
| 1 | Banner appears with role=status — does NOT steal focus |  |  | aria-live=polite |
| 2 | Banner content reads automatically ("Version N updated in place…") |  |  | |
| 3 | Auto-dismiss after ~4s does not interrupt mid-announcement |  |  | |

### Screen: `<EpochSelector>` dropdown

| # | Check | VO/macOS | NVDA/Win | Notes |
|---|---|---|---|---|
| 1 | At currentEpoch=1: announces as a static "Version 1" label (not a button) |  |  | |
| 2 | At currentEpoch>1: trigger announces button + listbox popup |  |  | |
| 3 | Enter opens the menu; arrow keys navigate items |  |  | Each item announces "Version N (Current)" or "Version N" |
| 4 | Active version announces aria-current=true |  |  | |
| 5 | Enter on a past version navigates; URL updates to `?epoch=N` |  |  | |
| 6 | Esc closes the menu without selection |  |  | |
| 7 | Past-epoch view: "Viewing Version N (read-only). Return to Version C to edit." banner announces |  |  | Both numbers correct |
| 8 | FeatureListEditor is NOT rendered on the past-epoch view |  |  | Confirm by tabbing — should jump straight from header to the read-only list |

## Issue log

| Platform | Screen | Severity (blocker / major / minor) | Description | Resolution / tracking link |
|---|---|---|---|---|
| Automated (axe-core) | PM layout — nav drawer | major | `<v-navigation-drawer color="surface-variant" theme="dark">` forced Vuetify's built-in dark palette, which renders `surface-variant` as `#c8c8c8`; pm-nav links (white text) failed AA at 1.67:1 on every PM page | Fixed inline — Story 2-13 / `src/layouts/PmLayout.vue`: drop `theme="dark"`; Tixeo's own `surface-variant` token (`#1C1F26`) gives ~16:1 white-on-navy |
| Automated (Playwright) | Route transition `/app/projects` → `/app/projects/:id` | major | Focus fell to `<body>` after row activation — screen reader users land on "page heading" only by chance, no audible cue of navigation | Fixed inline — Story 2-13 / `src/pages/app/ProjectDetail.vue`: focus the `data-testid="project-name-display"` heading on `onMounted` so the page-name announcement is the first thing read |
| Automated (Playwright) | `<EpochBumpDialog>` modal open/close | major | Two bugs uncovered: (a) Vuetify 4's focus-trap initialises a frame after `modelValue` flips, racing the test assertion — focus stayed on the triggering input; (b) on dialog close (`v-if="dialogContext"` unmount) focus dropped to `<body>` because the trigger cell was the unmounted Cancel button reference | Fixed inline — Story 2-13: `EpochBumpDialog.vue` now pins focus to the Cancel CTA via `onMounted` + `watch(modelValue)` (Cancel-first is the safer default on a destructive op); `ProjectDetail.vue` captures a *stable selector* (`[data-feature-key=…] input[aria-label=…]`) before opening and restores with rAF×2 after both Vuetify's trap teardown and `store.refreshCurrent()`'s re-render |

## Sign-off

| Platform | Date | Initials | All-pass? (Y/N) | Notes |
|---|---|---|---|---|
| macOS / Safari / VoiceOver |  |  |  | |
| Windows / Firefox / NVDA |  |  |  | |

---

## Maintainer notes

- If a finding requires a complex fix that can't ship in this story, open
  a follow-up issue with explicit acceptance criteria and link it in the
  issue-log row. The story still ships **only when no row is marked
  "blocker"**.
- After every fix, re-run the affected row on both platforms and update
  the issue-log status.
- Re-baseline the corresponding Playwright snapshot only if a copy/visual
  change is intentional — see `playwright.config.ts` header for the
  re-baseline procedure.
