---
title: 'Permanent delete glyph + new-row submit glyph in the feature-list editor'
type: 'feature'
created: '2026-06-02'
status: 'done'
context: []
baseline_commit: 'fe0ba44'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In the PM `FeatureListEditor`, the per-row delete control is only revealed on hover/focus (`visibility: hidden`), so it is undiscoverable for touch/keyboard-light users; and the new ("currently created") row has no explicit commit affordance — a PM must press Enter or blur the field, with no visible button. The user wants the delete control always visible on existing rows, and an explicit submit control on the new row.

**Approach:** Make the existing per-row delete button permanently visible and swap its `×` text glyph for an MDI icon glyph. Add a submit button (MDI glyph, no text label) to the new-row actions cell, wired to the existing `commitNew()`. Icon-only buttons keep accessible names via `useCopy` aria-labels.

## Boundaries & Constraints

**Always:** Keep all existing commit/create/delete logic intact — `commitNew`, `deleteFeature`/`onDelete`, the `newRowInFlight`/`awaitingBump` guards, epoch-bump (409) replay, Esc-cancel, Enter-commit, blur-commit, and paste-multi-line. Icon-only buttons must carry an aria-label sourced from the copy deck (no inline literals); the glyph itself is `aria-hidden`. Use MDI glyphs consistent with the project's icon set (`@mdi/font`). Keep the buttons as plain `<button>` elements (this file deliberately avoids Vuetify primitives so its unit spec mounts without Vuetify — see the spec's header comment); render the glyph via an MDI font class span, not `<v-icon>`.

**Ask First:** Replacing the keyboard/blur commit model with button-only commit (we are ADDING a button, not removing existing triggers). Adding a confirmation dialog to delete.

**Never:** Change the backend, API shape, or store. Touch the analysis/respondent views. Add text labels to these buttons. Convert the row inputs to Vuetify components. Alter the epoch-bump 409 flow or the multi-line paste loop.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Delete visible at rest | Existing feature row, no hover/focus | Delete glyph button is visible without hovering | — |
| Click delete | PM clicks the row delete button | `deleteFeature` runs → `feature-deleted` emitted (existing behavior) | 409 → existing epoch-bump event |
| Click submit, name present | New-row name typed, PM clicks submit | `commitNew` creates the feature, inputs clear, focus returns to new name | 409 → existing epoch-bump; API error → existing inline error |
| Click submit, name empty | New-row name blank, PM clicks submit | No-op (button disabled / `commitNew` returns early), no create request | — |
| Submit overlaps blur-commit | Description focused, PM clicks submit (blur fires first) | Exactly one create (guarded by `newRowInFlight`; second call no-ops on cleared draft) | — |

</frozen-after-approval>

## Code Map

- `kano-frontend/src/components/FeatureListEditor.vue` -- existing-row delete button (lines ~45-53): swap `×` span for an MDI glyph span. New-row actions cell (line ~86, currently empty `<div/>`): add a submit `<button>` wired to `commitNew`, disabled when `draftNew.name` is blank. Style: remove `visibility: hidden` default on `.pm-row-delete` so it is always visible; add a `.pm-row-submit` style mirroring it.
- `kano-frontend/src/copy/en.ts` -- add `pm.features.editor.submit.aria` (e.g. "Add feature"). `pm.features.editor.delete.aria` already exists.
- `kano-frontend/tests/unit/feature-list-editor.spec.ts` -- add: submit button (testid `feature-new-submit`) exists, clicking it with a name creates a feature, and it is disabled when the name is empty. Existing delete-click test still passes.

## Tasks & Acceptance

**Execution:**
- [x] `kano-frontend/src/copy/en.ts` -- add `pm.features.editor.submit.aria: 'Add feature'` near the existing editor keys.
- [x] `kano-frontend/src/components/FeatureListEditor.vue` -- (a) replace the delete button's `<span class="pm-row-delete-icon">×</span>` with an MDI glyph span (e.g. `mdi-delete-outline`), keeping the button, its aria-label, and `data-testid="feature-delete"`; (b) in the new-row actions cell add a submit `<button data-testid="feature-new-submit">` with an MDI glyph (e.g. `mdi-check`), `:aria-label="copy('pm.features.editor.submit.aria')"`, `:disabled="!draftNew.name.trim()"`, `@click="commitNew"`; (c) update styles: drop `visibility: hidden` from `.pm-row-delete` (always visible; keep focus-visible/hover affordance harmless), add a matching `.pm-row-submit` rule, style the MDI glyph spans.
- [x] `kano-frontend/tests/unit/feature-list-editor.spec.ts` -- add tests: submit button present in the new row; clicking it after typing a name POSTs a create and clears inputs; submit is `disabled` when name is empty (no POST). Verify the existing `trash icon calls delete` test still passes.

**Acceptance Criteria:**
- Given an existing feature row with no hover or focus, when the editor renders, then the delete glyph button is visible and clicking it deletes the feature exactly as before.
- Given the new row with a non-empty name, when the PM clicks the submit glyph button, then the feature is created via the store, the inputs clear, and focus returns to the new name field.
- Given the new row with an empty name, when the PM clicks submit, then no create request fires.
- Given the description field is focused and the PM clicks submit, when blur-commit and click both fire, then exactly one feature is created (no duplicate).
- Both buttons are icon-only with a copy-deck aria-label and an `aria-hidden` glyph; no inline literals are introduced.

## Design Notes

The component already owns every behavior needed: `onDelete`/`deleteFeature` for the delete button and `commitNew` for submit, both with in-flight + epoch-bump guards. This is purely a presentation/affordance change — no new logic, no new state. The `:disabled` on submit mirrors the early-return in `commitNew` (`if (!name) return`), so the disabled state and the guard agree. MDI font-class spans (`<span class="mdi mdi-delete-outline" aria-hidden="true" />`) are used instead of `<v-icon>` to preserve the file's "no Vuetify primitives" property that lets the unit spec mount without Vuetify stubs.

## Verification

**Commands:**
- `cd kano-frontend && npm run test:unit` -- expected: all unit specs pass, including the new submit-button cases and the existing delete-click test.
- `cd kano-frontend && npm run type-check && npm run lint` -- expected: no type or lint errors (no inline literals).

**Manual checks:**
- Open a project detail / feature editor: confirm each existing row shows the trash glyph at rest (no hover needed) and it deletes; type a feature name in the new row and click the check glyph to create it; confirm the submit glyph is greyed/disabled when the name field is empty.

## Suggested Review Order

**New affordances (entry point)**

- New-row submit button: icon-only, copy-deck aria-label, disabled until a name is typed, wired to existing `commitNew`.
  [`FeatureListEditor.vue:88`](../../kano-frontend/src/components/FeatureListEditor.vue#L88)

- Existing-row delete: `×` text glyph swapped for an MDI trash glyph (button/handler/testid unchanged).
  [`FeatureListEditor.vue:52`](../../kano-frontend/src/components/FeatureListEditor.vue#L52)

**Styling — permanence + states**

- Delete is now always visible (`visibility: hidden` and the hover-reveal rule removed); shared base for both buttons.
  [`FeatureListEditor.vue:520`](../../kano-frontend/src/components/FeatureListEditor.vue#L520)

- Submit primary color, muted/disabled state, and focus-visible outline for both buttons.
  [`FeatureListEditor.vue:533`](../../kano-frontend/src/components/FeatureListEditor.vue#L533)

**Copy (supporting)**

- New aria-label key beside the existing delete key; no inline literals.
  [`en.ts:166`](../../kano-frontend/src/copy/en.ts#L166)

**Tests (supporting)**

- Submit creates + clears; submit disabled when name empty; description-focused click yields exactly one create.
  [`feature-list-editor.spec.ts:137`](../../kano-frontend/tests/unit/feature-list-editor.spec.ts#L137)
