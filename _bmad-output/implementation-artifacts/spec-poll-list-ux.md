---
title: 'Poll list UX: project version column, row-click to analysis, respondent-URL action buttons'
type: 'feature'
created: '2026-06-02'
status: 'done'
context: []
baseline_commit: 'ea4bb9e'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The PM polls list (`/app/polls`) buries the free-form project `version` (only name + epoch show), makes the row click route to the share/analysis split (with the project name escaping to Project Detail), and exposes a single "View analysis" action — which is redundant once the row itself leads to analysis, while offering no quick way to grab the respondent URL.

**Approach:** Add a "Version" column (the free-form `project_version` string) between Project and Epoch; make clicking anywhere on a row go to the poll's analysis (never Project Detail); replace the analysis action button with two respondent-URL actions per row — open in a new tab and copy to clipboard.

## Boundaries & Constraints

**Always:** All user-facing text comes from the copy deck — no inline literals (Story 1-7 lint rule); keep `docs/copy-deck.md` in sync with `en.ts` (key-sync test gates this). Reuse the existing `buildPollUrl(poll.id)` respondent-URL builder and the established clipboard pattern (Clipboard API write with snackbar feedback). The interactive action buttons must not trigger the row-click navigation (`data-no-row-click` guard stays). Preserve expired-row muted styling, the empty state, and the countdown/created columns.

**Ask First:** Any backend/API/schema change (there is none — `project_version` already ships on `PollSummaryWithProject`). Renaming existing copy keys.

**Never:** Route any row interaction to `project-detail` (remove the project-name router-link; render the name as plain text). Keep the `poll-share` route reachable from this list (the two action buttons replace it here). Touch the respondent flow, the analysis page, or the poll-share page itself.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Row renders | poll with `project_version = "v2.0-beta"` | Columns read: Project (plain name) · Version "v2.0-beta" · Epoch chip · Responses · Expires · Created · Actions | N/A |
| Missing version | `project_version = ""` | Version cell renders the em-dash placeholder, not blank | N/A |
| Click row body | any poll (live or expired) | Navigate to `poll-analysis` (`{ id: project_id, pollId: id }`) | N/A |
| Click open-in-tab button | live poll | Opens `buildPollUrl(id)` in a new tab; row click does NOT fire | popup blocked → no crash (graceful no-op) |
| Click copy button | any poll | Copies `buildPollUrl(id)`; success snackbar; row click does NOT fire | clipboard write rejects → failure snackbar |

</frozen-after-approval>

## Code Map

- `kano-frontend/src/pages/app/Polls.vue` -- table: add Version column, drop project-detail link, retarget row click to analysis, swap actions cell to open/copy buttons + add copy snackbar & handlers
- `kano-frontend/src/copy/en.ts` -- add `pm.polls.columns.projectVersion` + `pm.polls.actions.*` keys; the now-unused `pm.polls.viewAnalysis.button` stays (harmless) unless trivially removable
- `kano-frontend/docs/copy-deck.md` -- mirror the new keys (key-sync test resolves `../../../docs/copy-deck.md`)
- `kano-frontend/src/lib/pollUrl.ts` -- read-only; reuse `buildPollUrl`
- `kano-frontend/tests/unit/polls-page.spec.ts` -- update row-click expectation (live → analysis), drop view-analysis tests, add Version-cell + open/copy + no-project-link tests; extend the data-table stub with a `project_version` cell
- `kano-frontend/e2e/pm/polls-home.spec.ts` -- update row-click assertion (live row → analysis), assert both action buttons render and copy shows a snackbar

## Tasks & Acceptance

**Execution:**
- [x] `kano-frontend/src/copy/en.ts` -- Add `pm.polls.columns.projectVersion: 'Version'`, `pm.polls.actions.open: 'Open poll URL in new tab'`, `pm.polls.actions.copy: 'Copy poll URL to clipboard'`, `pm.polls.actions.copied: 'Poll URL copied to clipboard'`, `pm.polls.actions.copyFailed: "We couldn't copy the URL automatically. Please try again."`.
- [x] `kano-frontend/src/pages/app/Polls.vue` -- (1) Insert a `project_version` header (key `project_version`, title `pm.polls.columns.projectVersion`, sortable) between `project_name` and `epoch`; render its cell as plain text with an em-dash fallback when empty. (2) Replace the `#item.project_name` router-link with plain text (`projectLabel(item)`); remove the `polls-row-project-link` link. (3) Rewrite `onRowClick` to always push `poll-analysis` (drop the live→`poll-share` branch and `selectPollById` seed); keep the interactive-descendant bail-out guard. (4) Replace the `#item.actions` cell with two `data-no-row-click` icon buttons — open (`mdi-open-in-new`, opens `buildPollUrl(item.id)` in a new tab with `opener` severed) and copy (`mdi-content-copy`, copies `buildPollUrl(item.id)`), each with an `aria-label` + tooltip from the copy deck and a `data-testid`; remove the `polls-row-view-analysis` button and `onViewAnalysis`. (5) Add a copy snackbar + `copyPollUrl(item)` / `openPollUrl(item)` handlers reusing the Clipboard-API-with-feedback pattern; import `buildPollUrl`.
- [x] `kano-frontend/docs/copy-deck.md` -- Add rows for `pm.polls.columns.projectVersion` and the four `pm.polls.actions.*` keys (Polls table section).
- [x] `kano-frontend/tests/unit/polls-page.spec.ts` -- Add a `project_version` `<td>` to the `VDataTableStub`. Change "row click routes to poll-share for live poll" → expects `poll-analysis`. Remove both view-analysis tests. Add: Version cell shows `project_version`; project name is plain text (no `polls-row-project-link`); open & copy buttons render per row; clicking copy calls the clipboard write and does not fire row click.
- [x] `kano-frontend/e2e/pm/polls-home.spec.ts` -- Update the populated-table test so a live row click routes to `…/analysis`; assert both per-row action buttons are visible; click copy and assert the success snackbar (grant clipboard permission in the test). Also added an open-in-new-tab assertion via `context.waitForEvent('page')`.

**Acceptance Criteria:**
- Given a populated polls list, when it renders, then each row shows the project's free-form version between the project name and the Epoch chip, and the project name is plain text (no link to Project Detail).
- Given any row, when the PM clicks anywhere on it except the action buttons, then they land on that poll's analysis page — never Project Detail or the share page.
- Given a row's action panel, when it renders, then it contains exactly two buttons (open respondent URL in a new tab, copy respondent URL) and no "View analysis" button; clicking either performs its action without navigating the row.
- Given the suites, when they run, then `npm run test:unit`, `npm run lint`, and `npm run type-check` pass.

## Spec Change Log

- **Implementation deviation (a11y) — tooltip → native `:title`.** Spec task 2 said the action buttons carry a copy-deck tooltip "(via `v-tooltip`)". An initial `v-tooltip` implementation injected an empty `role="tooltip"` overlay that (a) failed axe `aria-tooltip-name` and (b) intercepted the e2e button clicks. Replaced with a bound native `:title` (hover hint, accessible) while the `aria-label` covers screen readers — same user-facing intent, no overlay. KEEP: `aria-label` + `:title` both sourced from `pm.polls.actions.*`.
- **Addition — per-row `data-testid`.** Added `data-testid="polls-row-<id>"` to production `rowClassProps`. The pre-existing `polls-home.spec.ts` already targeted this selector but production never emitted it (that test was red at baseline); the unit stub had been faking it. Now real.
- **Pre-existing failure (not introduced here).** `polls-home.spec.ts` › "axe-core: zero violations" fails on a ~370-node `color-contrast` violation (`#b3b4b6` muted text on white, 2.07:1). Verified RED at baseline `ea4bb9e` before any change in this spec — pre-existing a11y debt, out of scope. The other 4 e2e cases in the file pass.
- **Review patches (step-04, no loopback).** Adversarial review surfaced two correctness/UX gaps, both fixed in `Polls.vue`: (1) the copy snackbar did not re-flash on a second copy (Vuetify `model-value` already `true` → timeout not restarted, `aria-live` not re-announced) — added `flashSnackbar` (toggle off → `nextTick` → on), mirroring `PollSharePanel`; (2) `openPollUrl` was a dead end when the popup was blocked (`window.open` → null) — now falls back to `copyPollUrl`, mirroring `ProjectDetail`. Added a unit test for the `copyFailed` branch and removed the unused `v-tooltip` test stub. Deferred (out of scope, appended to `deferred-work.md`): no `execCommand` clipboard fallback for non-secure contexts (shared with `ProjectDetail`); dead `selectPollById` store method. Rejected: 0-response row→analysis (Analysis page has a `total_submissions === 0` empty state), string-column sort, and `aria-label`+`title` double-announce (the `aria-label` wins for the accessible name).

## Design Notes

`project_version` already ships on `PollSummaryWithProject` (`api/types.ts:190`), so this is UI-only. Glossary: "Version" = the free-form release string (this new column), "Epoch" = the integer counter (existing chip) — keep them distinct per the prior epoch-relabel spec. The respondent URL is known synchronously from the row (`buildPollUrl(item.id)`) — unlike Project Detail, there is no get-or-create round-trip, so `openPollUrl` can `window.open(url, '_blank')` directly (sever `opener`), and `copyPollUrl` mirrors `ProjectDetail.copyToClipboard` (Clipboard API → success/failure snackbar). Action buttons render on all rows (live and expired) for predictability; copying an expired link is harmless and opening one lands on the expired page. Icon-only buttons (with aria-label + tooltip) keep the compact-density row tidy.

## Verification

**Commands:**
- `cd kano-frontend && npm run test:unit` -- expected: green (updated polls-page assertions pass)
- `cd kano-frontend && npm run lint` -- expected: green (no inline-literal violations)
- `cd kano-frontend && npm run type-check` -- expected: green
- `cd kano-frontend && npx playwright test e2e/pm/polls-home.spec.ts` -- expected: 4 cases green (row→analysis, action buttons, copy snackbar). The "axe-core: zero violations" case is RED on a pre-existing `color-contrast` violation unrelated to this change (see Spec Change Log).

## Suggested Review Order

**Row click → analysis (the behavior pivot)**

- Entry point: the row click now unconditionally routes to the poll's analysis — the share/expired split and `selectPollById` seed are gone.
  [`Polls.vue:177`](../../kano-frontend/src/pages/app/Polls.vue#L177)

- The interactive-descendant guard that lets the action buttons swallow their own clicks before the row handler fires.
  [`Polls.vue:187`](../../kano-frontend/src/pages/app/Polls.vue#L187)

**Version column + plain-text name**

- New "Version" column inserted between Project and Epoch in the header order.
  [`Polls.vue:115`](../../kano-frontend/src/pages/app/Polls.vue#L115)

- The cell renders the free-form `project_version` with an em-dash fallback; the project name is now plain text (router-link removed).
  [`Polls.vue:43`](../../kano-frontend/src/pages/app/Polls.vue#L43)

**Respondent-URL action buttons**

- Two `data-no-row-click` icon buttons replace the old "View analysis" button.
  [`Polls.vue:60`](../../kano-frontend/src/pages/app/Polls.vue#L60)

- `openPollUrl` opens the URL in a new tab and falls back to copy when the popup is blocked (review patch).
  [`Polls.vue:210`](../../kano-frontend/src/pages/app/Polls.vue#L210)

- `copyPollUrl` + `flashSnackbar`: Clipboard-API copy with a re-flashing snackbar so repeated copies re-announce (review patch).
  [`Polls.vue:223`](../../kano-frontend/src/pages/app/Polls.vue#L223)

**Supporting**

- Five new copy keys (column header + four action strings).
  [`en.ts:229`](../../kano-frontend/src/copy/en.ts#L229)

- Copy-deck mirror kept in lockstep (key-sync test gates this).
  [`copy-deck.md:263`](../../docs/copy-deck.md#L263)

- Unit specs: version cell, plain-text name, row→analysis, open/copy buttons, copy-failure branch.
  [`polls-page.spec.ts:190`](../../kano-frontend/tests/unit/polls-page.spec.ts#L190)

- E2E: live-row→analysis, action buttons, open-new-tab + copy snackbar.
  [`polls-home.spec.ts:96`](../../kano-frontend/e2e/pm/polls-home.spec.ts#L96)
