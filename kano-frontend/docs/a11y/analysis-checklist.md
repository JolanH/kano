# Analysis page — manual accessibility close-out (Story 5-8)

**Status:** Awaiting human execution — Kanaud runs this against the merged
Epic 5 build on a real macOS + Safari + VoiceOver workstation, captures the
seeded poll IDs, files any blockers, and signs off below before Epic 5
closes.

**Last updated:** 2026-05-26

This checklist is the manual half of the Epic 5 a11y gate. The automatable
half lives in:

- `kano-frontend/e2e/pm/analysis-page.spec.ts` — populated + empty + 404 +
  Story 5-6 cross-index + Story 5-7 tooltip + axe-core at scale
- `kano-frontend/e2e/pm/analysis-perf.spec.ts` — NFR1 p95 ceiling + 1440 /
  1920 viewport framing
- `kano-frontend/e2e/pm/analysis-keyboard.spec.ts` — keyboard-only scan +
  reduced-motion CSS / scroll behavior

Together they fulfil PRD §NFR1, §NFR9–11, §FR35, §FR39, and the
architecture's "WCAG 2.1 AA + axe-core in CI" enforcement rule.

Parallel to:

- `docs/a11y/respondent-checklist.md` (Story 4-8, respondent flow on
  VoiceOver iOS + TalkBack Android)
- `_bmad-output/implementation-artifacts/2-13-paola-authoring-flow-manual-a11y-sweep-voiceover-nvda.md`
  (Story 2-13, PM authoring flow on VoiceOver + NVDA — already passed dev
  gates; manual signoff pending)

The structure mirrors those files for consistency; the **content** below
is unique to the analysis surface (PM persona, VoiceOver on macOS, the
dominant-tie reading, the per-category cross-index, the help tooltips).

## Environment

| Platform | Browser | Screen reader | Notes |
|---|---|---|---|
| macOS (latest stable + one prior) | Safari | VoiceOver (built-in) | Cmd-F5 to toggle; VO + → / ← to navigate; VO + space to activate; Rotor (VO + U) for Headings / Form Controls / Landmarks navigation |
| Chrome (latest stable) | Chrome | Chrome's own keyboard-only + the running axe-core spec | Pre-checked in CI; manual run here just confirms there's no platform-specific Chrome ↔ macOS divergence |
| TalkBack on Android (latest stable) | Chrome | TalkBack (built-in) | Courtesy pass only — Paola uses desktop for analysis; major Android-only regressions get filed, otherwise minor severity |

**Setup:**

1. Bring the stack up via `docker compose up -d` from the repo root (Story
   1-9).
2. Seed the deterministic 20 × 500 dataset + the sibling empty poll:

   ```bash
   cd kano-backend
   eval "$(poetry run python scripts/seed_analysis_dataset.py)"
   echo "populated: project=$project_id poll=$poll_id"
   echo "empty:     project=$empty_project_id poll=$empty_poll_id"
   ```

   The seeder pins `Feature 02` as the FR35 tie row (50 % MANDATORY ↔ 50 %
   LINEAR) and `Feature 03` as the LINEAR ↔ EXCITER tie. The remaining 17
   rows are deterministic pseudo-random distributions.

3. Build the PM URLs from the captured IDs:

   - Populated: `http://localhost:5173/app/projects/$project_id/polls/$poll_id/analysis`
   - Empty: `http://localhost:5173/app/projects/$empty_project_id/polls/$empty_poll_id/analysis`
   - 404: `http://localhost:5173/app/projects/$project_id/polls/00000000-0000-4000-8000-000000000000/analysis`

4. Open VoiceOver in macOS System Settings → Accessibility → VoiceOver →
   Open VoiceOver Training first if it's been a while.

5. Set `prefers-reduced-motion: reduce` in macOS System Settings →
   Accessibility → Display → Reduce motion for the reduced-motion pass;
   clear for the default pass.

6. Set the browser viewport to 1440 × 900 (UX-DR22 default); also spot-
   check at 1920 × 1080.

## Per-screen checklist

Mark each row Pass / Fail / Defect. "Defect" = needs a follow-up fix;
cite the GitHub issue (or `docs/a11y/follow-ups.md` entry) in the
**Notes** column. Each screen runs once under VoiceOver/macOS; the
TalkBack pass is documented separately at the bottom.

### Screen: `/app/projects/:id/polls/:pollId/analysis` (populated)

| # | Check | VO/macOS | Notes |
|---|---|---|---|
| 1 | Page title announces "Analysis" (the landmark aria-label) followed by the project name h1 |  | landmark = `analysis.page.aria` |
| 2 | "Version 1" chip announces as a status chip near the project name |  | |
| 3 | Confidence beat reads as inline text — "500 responses" (or singular at 1) — without a live-region interruption |  | |
| 4 | Tie-help (i) icon announces on focus as "About dominant-category ties, button" (not "information icon") |  | `analysis.help.tieIconAriaLabel` is the activator aria-label |
| 5 | Activating the tie-help icon (Enter / Space) reveals the tooltip; VoiceOver reads the full tie-meaning explainer |  | `analysis.help.tieMeaning` |
| 6 | Escape on the open tie-help tooltip dismisses it; focus stays on the icon |  | WCAG SC 1.4.13 dismissible |
| 7 | EpochSelector announces as a button "Switch version" |  | Story 2-12 |
| 8 | `v-data-table` announces with its caption + 4 column headers (Feature / Dominant / Distribution / n) |  | |
| 9 | Tab moves between focusable interactive elements (CatBadges, panels' links, EpochSelector) without trapping |  | Verified by `analysis-keyboard.spec.ts`; manual sanity here |
| 10 | Each feature row announces the feature name + description in the Feature column |  | |
| 11 | Single-dominant rows announce the dominant cell as "100 percent. Must-have" (or equivalent) |  | feat-01 reference — the Python seeder pins (2, 5) → MANDATORY on every response |
| 12 | **Tie row (Feature 02)** announces "50 percent each. Must-have, slash, Performance" — both categories conveyed |  | Load-bearing FR35 check |
| 13 | KanoStackedBar segments are focusable and read their per-segment tooltip on focus |  | Story 5-4 segment-tooltip behavior |
| 14 | KanoStackedBarTable companion announces as a 6-row data table when the bar gains focus |  | Story 5-4 fallback |
| 15 | CatBadge tooltip appears on focus (Story 5-7); VoiceOver reads it as described-by, not as the label |  | aria-describedby preserves "Must-have" as the primary label |
| 16 | PerCategoryPanels heading announces as "By category, heading level 2" |  | `analysis.panels.heading` |
| 17 | Each panel section announces "{Category}, heading level 3" + "list of N items" |  | M / L / E / I sections present on the seeded fixture |
| 18 | Tied feature appears in EACH tied panel (Feature 02 reads in both Must-have AND Performance panels) |  | FR35 cross-index check |
| 19 | Panel anchor links announce as "Jump to {feature} ({pct} dominant), link" |  | `analysis.panels.entryAriaLabel` |
| 20 | Enter on a panel link smooth-scrolls + focuses the target row; VoiceOver re-announces the row |  | Story 5-6 AC #7 |
| 21 | Under `prefers-reduced-motion: reduce`, the row-pulse and scroll animations collapse to instant; SR announces the same content |  | |

### Screen: `/app/projects/:id/polls/:pollId/analysis` (empty)

| # | Check | VO/macOS | Notes |
|---|---|---|---|
| 1 | "No responses yet — analysis will populate as responses arrive." reads once as the empty state |  | `analysis.emptyState` |
| 2 | No table or PerCategoryPanels exist in the accessibility tree |  | FR37 full-table replacement |
| 3 | Tie-help icon is NOT rendered (no confidence beat to attach to) |  | `v-if="analysis && !isEmpty"` gate |
| 4 | EpochSelector still mounts and is keyboard-reachable |  | |
| 5 | axe-core has zero violations |  | Pre-checked by `analysis-page.spec.ts` axe at scale |

### Screen: `/app/projects/:id/polls/<unknown-uuid>/analysis` (404)

| # | Check | VO/macOS | Notes |
|---|---|---|---|
| 1 | "Poll not found" heading announces as h2 |  | `analysis.error.notFound.title` |
| 2 | Body announces "The poll URL is invalid or was removed." |  | `analysis.error.notFound.body` |
| 3 | "Back to projects" link announces with its destination |  | `analysis.error.notFound.cta` |

### Screen: 1920 × 1080 spot-check (populated)

| # | Check | VO/macOS | Notes |
|---|---|---|---|
| 1 | Page frames at the same 1440 px content-max-width — extra horizontal space stays as gutter |  | UX-DR22 |
| 2 | No layout regressions vs the 1440 × 900 capture |  | Screenshots in `e2e/screenshots/analysis-1920.png` |

### Performance spot-check (manual)

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Three back-to-back cold loads of the populated page on local Docker stack complete in subjectively "snappy" time (< ~2 s perceived) |  | Hard NFR1 gate is the CI Playwright spec; this is human-feel sanity |
| 2 | Scrolling the 20-row table on the seeded data is smooth (no jank, no layout shifts) |  | |

### TalkBack on Android (courtesy pass)

| # | Check | TB/Android | Notes |
|---|---|---|---|
| 1 | Page loads and announces in the same general structure as the macOS pass |  | Filing severity defaults to Minor unless Blocker |
| 2 | Tie row announces both categories |  | If TalkBack collapses to a single one, file as Major (not Blocker — PM uses desktop) |
| 3 | PerCategoryPanels links are reachable and activate |  | |

## Issue log

| Platform | Screen | Severity | Description | Status | Fix / Follow-up |
|----------|--------|----------|-------------|--------|-----------------|
|          |        |          |             |        |                 |

**Severity calibration** (reused from Story 4-8):

- **Blocker** — the analysis page is unusable for a keyboard or SR user on
  the realistic dataset. Cannot ship Epic 5.
- **Major** — a specific announcement is wrong, missing, or confusing, but
  the user can still complete the scan. Fix in-story preferred; deferrable
  with explicit rationale + follow-up ticket.
- **Minor** — subtle verbosity, mispronunciation, cosmetic focus issue.
  File follow-up, ship.

## Signoff

- All blockers resolved: Yes / No
- All majors either resolved or explicitly deferred: Yes / No
- Non-blocker follow-ups tracked in:
  - [ ] `_bmad-output/implementation-artifacts/deferred-work.md` entry
  - [ ] GitHub issue link: …

**Epic 5 ready to close — all blocker and major issues resolved.**

Signoff: __________________________  on __________
        (Kanaud's initials)             (YYYY-MM-DD)
