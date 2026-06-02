---
title: 'Relabel the epoch counter "Epoch" across the PM UI + inline name/version/epoch in Project Detail'
type: 'feature'
created: '2026-06-02'
status: 'done'
context: []
baseline_commit: 'dadaea4'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The PM UI deliberately calls the integer `epoch` counter "Version" (Story 1-7 glossary), which now collides with the free-form project `version` string — both read "Version", so a PM cannot tell the auto-incrementing snapshot number from the human-typed release label. Separately, on Project Detail the name, version, and epoch are split across two stacked lines.

**Approach:** Relabel every user-facing string bound to the **integer epoch counter** from "Version" to "Epoch" (the free-form `version` string keeps "Version"), and recompose the Project Detail header so name, a labeled version, and the Epoch chip sit on one inline row. Reverses the Story 1-7 "never say Epoch" glossary.

## Boundaries & Constraints

**Always:** Relabel ONLY values that denote the integer epoch counter. Keep copy-deck.md in sync with `en.ts`. Preserve name & version inline-edit behavior, the Epoch chip, and the EpochSelector position. All user-facing text comes from the copy deck (no inline literals — Story 1-7 lint rule).

**Ask First:** Renaming any copy KEY (e.g. `pm.versionBump.*` → `pm.epochBump.*`) — out of scope here, keys stay; only values change. Any backend/API/DB change (there is none).

**Never:** Touch the free-form project `version` string keys — `pm.projects.newProject.placeholder.version`, `pm.projects.col.version`, `pm.projectDetail.version.aria` stay "Version". Rename copy keys. Change routing, the `epoch` query param, or any backend code.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Epoch chip render | `current_epoch = 3` | Chip reads "Epoch 3" (via `common.version` → "Epoch") | N/A |
| Inline header | project with name + version string + epoch | One row: bold name · "Version" label + editable value · "Epoch N" chip · spacer · EpochSelector | N/A |
| Version still editable | click/Enter on version value | Enters inline edit exactly as today | unchanged |
| Free-form version label | project `version = "v2.0-beta"` | Renders "v2.0-beta" prefixed by a "Version" label — NOT "Epoch" | N/A |

</frozen-after-approval>

## Code Map

- `kano-frontend/src/copy/en.ts` -- copy registry; relabel integer-epoch values, add one new label key, rewrite the glossary header comment
- `kano-frontend/src/pages/app/ProjectDetail.vue` -- header markup; move version block inline with name + Epoch chip, add visible "Version" label
- `docs/copy-deck.md` -- canonical doc mirror (repo-root; the key-sync test resolves `../../../docs/copy-deck.md`); update relabeled rows + add the new key row
- `kano-frontend/tests/unit/useCopy.spec.ts` -- update `common.version`/title assertions; DELETE the "never says Epoch" exhaustive sweep (now reversed)
- `kano-frontend/tests/unit/epoch-bump-dialog.spec.ts`, `epoch-bump-banner.spec.ts`, `epoch-selector.spec.ts` -- update pinned "Version N" strings → "Epoch N"
- `kano-frontend/e2e/pm/analysis-page.spec.ts` -- update pinned "Version 2" chip assertion → "Epoch 2"
- (no template change needed in `Polls.vue`, `Analysis.vue`, `EpochSelector.vue` — they render `common.version`, which relabels automatically)

## Tasks & Acceptance

**Execution:**
- [x] `kano-frontend/src/copy/en.ts` -- Relabel "Version"→"Epoch" in: `common.version`, `pm.projects.col.epoch` (→ "Current epoch"), all `pm.versionBump.*` ("Create Epoch {n}?", "…on Epoch {current}…", "New polls will use Epoch {next}.", "Create Epoch {n}", "…bump the epoch…", "Creating new epoch…", "Epoch {n} updated in place…", "Now editing Epoch {n}"), `pm.versionSelector.trigger.aria` ("Switch epoch"), `pm.versionSelector.item.aria` ("View Epoch {n}"), `pm.viewingPast.banner` ("Viewing Epoch {n} … Return to Epoch {current} …"), `pm.polls.columns.version` ("Epoch"). Add `pm.projectDetail.version.label: 'Version'`. Rewrite the file's glossary comment to state the new convention (integer counter = "Epoch"; free-form string = "Version"). Leave the free-form `version` keys untouched.
- [x] `kano-frontend/src/pages/app/ProjectDetail.vue` -- Recompose the `<header>`: place name (h2), then the version block (a muted "Version" label from `pm.projectDetail.version.label` + the existing inline-editable value) , then the Epoch chip, then spacer + EpochSelector, all in one flex row aligned on a common baseline/center. Remove the now-redundant second stacked version `<div>`. Preserve all edit handlers, `data-testid`s, and the viewing-past alert (which stays below the row).
- [x] `kano-frontend/docs/copy-deck.md` -- Update the value column for every relabeled row; add a row for `pm.projectDetail.version.label`.
- [x] `kano-frontend/tests/unit/useCopy.spec.ts` -- `common.version` assertions → "Epoch" (lines ~12, 48); `pm.versionBump.dialog.title` assertions → "Create Epoch 3?"/"Create Epoch {n}?" (lines ~25, 34, 66); DELETE the `user-facing copy never says "Epoch"` test (~84–93).
- [x] `kano-frontend/tests/unit/epoch-bump-dialog.spec.ts` -- "Create Epoch 3?", "Epoch 2 will be preserved", "New polls will use Epoch 3", "bump the epoch".
- [x] `kano-frontend/tests/unit/epoch-bump-banner.spec.ts` -- "Epoch 3 updated in place".
- [x] `kano-frontend/tests/unit/epoch-selector.spec.ts` -- "Epoch 1".
- [x] `kano-frontend/e2e/pm/analysis-page.spec.ts` -- chip assertion "Epoch 2" (and the header comment).

**Acceptance Criteria:**
- Given any PM screen showing the epoch counter (project detail chip, polls list column, EpochSelector, analysis chip, bump dialog/banner), when it renders, then the visible word is "Epoch", never "Version".
- Given a project's free-form version string, when it renders anywhere, then it still reads "Version" (label) — the recolor never bleeds onto it.
- Given Project Detail, when the header renders, then name, the labeled version value, and the Epoch chip appear on one inline row, with version still click/Enter-editable.
- Given the unit suite, when it runs, then no test asserts the old "Version N" epoch strings and the "never says Epoch" sweep is gone; `npm run test:unit` and `npm run lint` pass.

## Design Notes

`common.version` is bound to the integer epoch in every consumer (`ProjectDetail` chip, `Polls.vue`, `EpochSelector` ×3, `Analysis.vue`) — relabeling its value to "Epoch" cascades to all of them with zero template edits. `pm.projects.col.epoch` ("Current version") becomes "Current epoch" to keep the qualifier that distinguishes it from the static free-form `version` column in the projects table. The colon in the approved "Version: value" layout is rendered as template punctuation after the label key, not baked into the copy value.

## Verification

**Commands:**
- `cd kano-frontend && npm run test:unit` -- expected: green (updated epoch assertions pass; sweep removed)
- `cd kano-frontend && npm run lint` -- expected: green (no inline-literal violation from the new label)
- `cd kano-frontend && npm run type-check` -- expected: green

## Suggested Review Order

**The relabel (source of truth)**

- Entry point: the one value that cascades to every epoch surface (chip, polls column, selector, analysis) with zero template edits.
  [`en.ts:27`](../../kano-frontend/src/copy/en.ts#L27)

- The glossary now has two distinct terms — confirm the free-form release-label key still says "Version", not "Epoch".
  [`en.ts:148`](../../kano-frontend/src/copy/en.ts#L148)

- The other relabeled integer-epoch values (projects column, polls column, bump dialog/banner, selector, viewing-past banner).
  [`en.ts:133`](../../kano-frontend/src/copy/en.ts#L133)

**The inline header recompose**

- Name · "Version:" labeled editable value · "Epoch N" chip, all on one wrapping flex row; old stacked version `<div>` removed.
  [`ProjectDetail.vue:19`](../../kano-frontend/src/pages/app/ProjectDetail.vue#L19)

- The new visible "Version" label prefixing the (unchanged) inline-editable value.
  [`ProjectDetail.vue:48`](../../kano-frontend/src/pages/app/ProjectDetail.vue#L48)

**Supporting**

- Doc mirror kept in lockstep (key-sync test gates this); new label row added.
  [`copy-deck.md:33`](../../docs/copy-deck.md#L33)

- Replaces the deleted "never say Epoch" sweep with a positive both-directions glossary guardrail.
  [`useCopy.spec.ts:84`](../../kano-frontend/tests/unit/useCopy.spec.ts#L84)
