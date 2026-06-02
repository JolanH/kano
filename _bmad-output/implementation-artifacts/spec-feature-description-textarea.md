---
title: 'Resizable feature-description textarea (2048 chars) + respondent multi-line display'
type: 'feature'
created: '2026-06-02'
status: 'done'
context: []
baseline_commit: '3a59c5a'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The PM feature-list editor authors descriptions in a single-line `<input>`, so long/multi-line descriptions are awkward to write and the field caps at 2000 chars (backend `max_length=2000`). The user wants a resizable textarea allowing up to 2048 chars, and wants the description shown to respondents under the feature title while answering a poll.

**Approach:** Swap the two description `<input type="text">` fields in `FeatureListEditor` for resizable `<textarea>`s capped at 2048 chars, raise the backend description cap from 2000 to 2048 (Pydantic + OpenAPI; DB column is already unbounded `Text`), and ensure multi-line descriptions render with preserved line breaks in the respondent flow (the under-title display already exists — only newline preservation is missing).

## Boundaries & Constraints

**Always:** Keep the existing commit-on-blur + Esc-cancel + epoch-bump (409) flow intact. Keep `maxlength=2048` on the textareas consistent with the backend cap. Description stays optional (empty → `null`). All visible text via `useCopy`/copy deck — no inline literals. Plain Enter inside a description textarea inserts a newline (natural textarea behavior); the name field's Enter still commits.

**Ask First:** Any DB migration (none expected — `description` is `Text`). Changing the keyboard commit model for the name field or the 409 replay logic.

**Never:** Touch the analysis/results views. Add a rich-text editor. Change the feature `name` field. Alter the public poll API shape (it already returns `description`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Author multi-line description | PM types text with newlines in an existing row's textarea, then blurs | Description committed via PATCH including newlines; textarea is vertically resizable | On 409, existing epoch-bump event fires |
| Long description at cap | PM enters exactly 2048 chars | Accepted by frontend (`maxlength`) and backend (`max_length=2048`) | — |
| Over cap | Payload with 2049-char description hits backend | 400 `validation-error` | Pydantic rejects |
| New-row description commit | PM types name + multi-line description in new row, blurs the description field | Feature created via POST with the description | name empty → no-op, no create |
| Respondent view | Feature with multi-line description on a poll | Description rendered under the title with line breaks preserved (`white-space: pre-wrap`) | description null → nothing rendered (existing behavior) |

</frozen-after-approval>

## Code Map

- `kano-frontend/src/components/FeatureListEditor.vue` -- both description fields (existing-row + new-row); swap `<input>` → resizable `<textarea maxlength="2048">`, drop Enter-to-commit on description, add blur-commit to the new-row description, style.
- `kano-frontend/src/pages/poll/Question.vue` -- respondent screen; description already renders under `<h1 class="feature-name">` (lines 43-49). Add `white-space: pre-wrap` to `.feature-description`.
- `kano-backend/src/kano/schemas/feature.py` -- `FeatureCreate.description` + `FeatureUpdate.description` `max_length=2000` → `2048`.
- `kano-backend/openapi.yaml` -- `FeatureCreate`/`FeatureUpdate` `description.maxLength: 2000` → `2048`.
- `kano-frontend/tests/unit/feature-list-editor.spec.ts` -- update/extend for textarea + maxlength + blur-commit.
- `kano-backend/tests/integration/test_features_api.py` -- add 2048-accepted / 2049-rejected length cases.

## Tasks & Acceptance

**Execution:**
- [x] `kano-backend/src/kano/schemas/feature.py` -- bump both `description` `max_length` to 2048.
- [x] `kano-backend/openapi.yaml` -- bump both `description.maxLength` to 2048.
- [x] `kano-frontend/src/components/FeatureListEditor.vue` -- replace both description `<input type="text">` with `<textarea maxlength="2048">`, give them `resize: vertical` + a sensible default height, remove `@keydown.enter.prevent="commitRow"`/`commitNew` on the description fields (keep Esc-cancel + blur-commit; add `@blur="commitNew"` to the new-row description so a typed description on the new row commits on blur).
- [x] `kano-frontend/src/pages/poll/Question.vue` -- add `white-space: pre-wrap` to `.feature-description`.
- [x] `kano-frontend/tests/unit/feature-list-editor.spec.ts` -- assert description renders as `<textarea>` with `maxlength="2048"`, Enter in description does not commit, and blur on the new-row description commits a create.
- [x] `kano-backend/tests/integration/test_features_api.py` -- add a 2048-char description (created/updated OK) and a 2049-char description (400) case.

**Acceptance Criteria:**
- Given the PM feature editor, when the PM focuses a description field, then it is a vertically resizable textarea that accepts multi-line text up to 2048 characters.
- Given a description with newlines, when it is committed and later answered in a poll, then the respondent sees it under the feature title with line breaks preserved.
- Given a description of 2048 chars, when submitted, then the backend accepts it; given 2049 chars, then the backend returns 400 `validation-error`.
- Given the existing epoch-bump (409), Esc-cancel, and paste-multi-line create flows, when exercised after the change, then they behave exactly as before.

## Design Notes

The respondent under-title display is **already implemented** (`Question.vue:43-49`) and the public poll API already serializes `description` (`PollPublicFeature`). The only respondent-side gap is newline preservation, hence the single `white-space: pre-wrap` change. Keep the name input as a single-line `<input>` (Enter commits); only the description becomes a textarea so plain Enter can insert newlines.

## Verification

**Commands:**
- `cd kano-frontend && npm run test:unit` -- expected: all unit specs pass, including the updated feature-list-editor + question-route specs.
- `cd kano-frontend && npm run type-check && npm run lint` -- expected: no type or lint errors (no inline literals).
- `cd kano-backend && uv run pytest tests/integration/test_features_api.py` -- expected: new 2048/2049 length cases pass.

**Manual checks:**
- In the PM editor, drag the description textarea handle to resize; paste a multi-line description; confirm it persists and renders with line breaks on the respondent poll screen.

## Suggested Review Order

**Authoring UI — the textarea swap (entry point)**

- Existing-row description: `<input>` → resizable `<textarea maxlength="2048">`, Enter now inserts a newline (commits on blur).
  [`FeatureListEditor.vue:35`](../../kano-frontend/src/components/FeatureListEditor.vue#L35)

- New-row description: same swap, gains `@blur="commitNew"` so a typed description commits on focus loss.
  [`FeatureListEditor.vue:77`](../../kano-frontend/src/components/FeatureListEditor.vue#L77)

- Review-hardening: `commitNew` in-flight guard, mirroring `commitRow`, prevents a duplicate create from overlapping blur/Enter.
  [`FeatureListEditor.vue:324`](../../kano-frontend/src/components/FeatureListEditor.vue#L324)

- Resizable textarea styling + top-aligned rows for a growing field.
  [`FeatureListEditor.vue:502`](../../kano-frontend/src/components/FeatureListEditor.vue#L502)

**Length boundary — 2000 → 2048 (kept consistent across three layers)**

- Pydantic cap on both `FeatureCreate`/`FeatureUpdate.description`.
  [`feature.py:22`](../../kano-backend/src/kano/schemas/feature.py#L22)

- OpenAPI contract mirrors the cap (both schemas).
  [`openapi.yaml:622`](../../kano-backend/openapi.yaml#L622)

**Respondent display — multi-line preservation**

- `white-space: pre-wrap` (+ `overflow-wrap: anywhere`) so authored line breaks survive under the feature title (rendering already existed).
  [`Question.vue:337`](../../kano-frontend/src/pages/poll/Question.vue#L337)

**Tests (supporting)**

- Frontend: textarea/maxlength, Enter-no-commit, blur-commit, and the double-create guard.
  [`feature-list-editor.spec.ts:215`](../../kano-frontend/tests/unit/feature-list-editor.spec.ts#L215)

- Backend: 2048 accepted / 2049 rejected on create, 2048 accepted on update.
  [`test_features_api.py:226`](../../kano-backend/tests/integration/test_features_api.py#L226)
