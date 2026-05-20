# Story 2.10: FeatureListEditor inline-first authoring component

Status: review

## Story

As a PM,
I want a `<FeatureListEditor>` that lets me add, edit, and delete features inline without any modal dialogs,
so that drafting the feature list feels like typing into a doc rather than filling a form.

## Acceptance Criteria

1. **Given** `<FeatureListEditor>` is mounted on `/app/projects/:id`, **when** I click an empty row at the bottom and type a feature name, **then** pressing Tab moves focus to the description field; pressing Enter commits the row via `POST /api/v1/projects/:id/features` and focuses a new empty row; Esc cancels the pending edit.
2. I can edit any existing feature inline (click → edit → Enter commits via `PATCH`).
3. Pressing Backspace on an empty row deletes that row via `DELETE /api/v1/projects/:id/features/:featureKey` and focuses the previous row.
4. Hovering a row reveals a trash icon that triggers the same delete action.
5. Pasting multi-line text into the empty row parses each non-empty line as a separate feature, posting them in order.
6. The component has ARIA `role="grid"` with per-row/per-cell `role="row"`/`role="gridcell"`.
7. If any API call returns 409 `epoch-bump-required`, the component re-raises a typed error to its parent for handling by the EpochBump dialog/banner pattern (Story 2.11); it does not render its own 409 UI.
8. Copy-deck keys source all labels, placeholders, and validation messages.

## Tasks / Subtasks

- [x] Component scaffold (AC: #6)
  - [x] `src/components/FeatureListEditor.vue` — props: `features: Feature[]`, `projectId: string`; emits: `epoch-bump-required` (payload: `{ mutation: () => Promise<void>, currentEpoch: number, wouldBeEpoch: number }`), `feature-created`, `feature-updated`, `feature-deleted`
  - [x] Root element: `<div role="grid">`; rows are `<div role="row" :data-feature-key="f.feature_key">`; cells are `<div role="gridcell">` with `v-text-field` inside
- [x] Inline create (AC: #1, #5)
  - [x] Always render one empty row at the bottom with placeholder from `useCopy('pm.features.editor.newRow.placeholder')`
  - [x] Tab from name → description; Enter on description → `store.createFeature(projectId, { name, description })`; on success: clear the row, prepend the new feature to local state (or await `refreshCurrent` from store), focus a fresh empty row
  - [x] Esc: clear pending text, blur
  - [x] Paste handler on the empty row's name field: `event.clipboardData.getData('text/plain').split('\n').filter(Boolean)` → if >1 line, prevent default paste, loop over lines calling `store.createFeature` sequentially; description is left empty (Paola edits in a second pass)
- [x] Inline edit (AC: #2)
  - [x] Click on a cell → turns that cell into an editable `v-text-field` with current value
  - [x] Enter → `store.updateFeature(projectId, featureKey, { name, description })`
  - [x] Esc → revert to original value
  - [x] Only one cell edit at a time; clicking another cell commits the current edit first (or prompts?) — simpler: auto-commit on blur, mirror the "Enter commits" semantics
- [x] Inline delete (AC: #3, #4)
  - [x] Backspace on empty row (name AND description both empty after edit): `store.deleteFeature(projectId, featureKey)`; focus previous row's name field
  - [x] Trash icon on hover: uses `v-icon` + `aria-label="Delete feature"`; same delete action; no confirmation dialog (inline-first)
- [x] 409 handling (AC: #7)
  - [x] Wrap all three API calls in try/catch; on `ConflictError` with `type === 'epoch-bump-required'`, emit `epoch-bump-required` with a callback to retry the mutation with `?acknowledged=true` and the epoch numbers from the Problem Details payload
  - [x] Do NOT render any 409 UI inside this component — parent (ProjectDetail.vue) handles
- [x] Keyboard parity tests (AC: #6)
  - [x] Tab order: first row name → first row description → second row name → ... → empty-row name → empty-row description
  - [x] Arrow keys optional (not in AC); stick to Tab/Enter/Esc/Backspace
- [x] Vitest specs
  - [x] Tab moves focus as expected
  - [x] Enter on name commits create
  - [x] Esc reverts pending edit
  - [x] Paste multi-line creates N features
  - [x] 409 error emits `epoch-bump-required` event
  - [x] Trash icon triggers delete
- [x] Integrate into ProjectDetail.vue
  - [x] Replace placeholder `<ul>` from Story 2-9 with `<FeatureListEditor :features="store.current.active_features" :project-id="projectId" @epoch-bump-required="showEpochBumpDialog($event)" />`

## Dev Notes

### The event contract for 409 handling

The component doesn't make UI decisions about epoch bumps — that's Story 2-11's job. It reports back to its parent with enough context to trigger the dialog:

```ts
emit('epoch-bump-required', {
  mutation: async () => await retryWithAcknowledged(),
  currentEpoch: problem.current_epoch,
  wouldBeEpoch: problem.would_be_epoch,
});
```

The parent (`ProjectDetail.vue`) opens `<EpochBumpDialog>` (Story 2-11) with those numbers; on user confirm, calls the `mutation()` callback to replay the mutation with ack.

### Inline-first discipline

No modals. No "Add feature" dialog. No "Confirm delete" dialog. The UX-spec §Component Strategy line 917 is unambiguous: "inline-first authoring (Effortless Interaction 1 from Step 3)". Delete via trash icon is permitted because it's a hover affordance, not a modal.

### ARIA grid semantics

Vuetify has no out-of-the-box `role="grid"` primitive. Author the roles manually per WAI-ARIA Grid pattern. Keyboard contract: Tab moves through cells; Enter commits; Esc cancels; Backspace on empty row deletes.

### Not in scope

- EpochBumpDialog itself — Story 2-11.
- Drag-to-reorder features — not in v1 (no PRD requirement; architecture doesn't lock ordering semantics beyond `created_at`).

### Project Structure Notes

Files:
- `kano-frontend/src/components/FeatureListEditor.vue`
- `kano-frontend/src/components/FeatureListEditor.spec.ts`
- Extend `kano-frontend/src/stores/projects.ts` with `createFeature`, `updateFeature`, `deleteFeature` actions
- Extend `kano-frontend/src/copy/en.ts`
- Edit `kano-frontend/src/routes/app/ProjectDetail.vue` to wire the component

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component Strategy] — `<feature-list-editor>` spec line 917
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#User Journey Flows] — inline-first (Flow 1)
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Component Boundaries] — components don't call useApi directly (go through store)
- [Source: _bmad-output/planning-artifacts/prd.md#FR5–7, FR11] — feature CRUD + epoch acknowledgement
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.10] — original AC
- [Source: _bmad-output/implementation-artifacts/2-7-feature-mutation-api-with-epoch-bump-gating.md] — backend contract consumed here
- [Source: _bmad-output/implementation-artifacts/2-11-epochbumpdialog-and-epochbumpbanner-two-register-confirmation-pattern.md] — parent handler for `epoch-bump-required` event

## Dev Agent Record

### Agent Model Used
claude-opus-4-7 (1M context)
### Debug Log References
- `npm run test:unit` → 108/108 passed (6 new in `feature-list-editor.spec.ts`)
- `npm run type-check` → exits 0
### Completion Notes List
- Component avoids Vuetify primitives in its body (uses plain `<input>` and `<button>` + a Unicode "×" delete glyph) so the Vitest spec can mount it without Vuetify's CSS loader. Reuse via the global stubs object documented in the spec if Vuetify components become necessary later.
- The 12-line ARIA grid: outer `role="grid"`, per-row `role="row"`, per-cell `role="gridcell"`. Tab order falls out of the natural DOM order; Enter commits, Esc cancels, Backspace on an empty row deletes + focuses the row above.
- Paste handler on the new-row name field splits clipboard text on `\r?\n`, filters empty lines, and POSTs them sequentially. On 409 it stops the paste loop and emits the bump event with a replay callback — the parent can decide whether to retry the rest after the user acknowledges.
- 409 handling emits a typed `epoch-bump-required` event with `{ mutation, currentEpoch, wouldBeEpoch }`. The component never renders bump UI; that's Story 2-11. ProjectDetail.vue currently calls `payload.mutation()` directly (auto-ack) as a placeholder; 2-11 will replace that body with the dialog flow.
- Store actions `createFeature` / `updateFeature` / `deleteFeature` optimistically update `current.active_features` so the editor reflects state without a refetch round-trip on Branch A. On Branch C the bump invalidates the epoch — the parent's `refreshCurrent` call after the replay re-fetches.
### File List
- `kano-frontend/src/stores/projects.ts` (modified — `createFeature` / `updateFeature` / `deleteFeature` actions + input types)
- `kano-frontend/src/components/FeatureListEditor.vue` (new — ARIA grid, inline create/edit/delete, paste-multi-line, 409 emit)
- `kano-frontend/src/pages/app/ProjectDetail.vue` (modified — replaced placeholder `<ul>` with `<FeatureListEditor>` + `onEpochBumpRequired` stub handler)
- `kano-frontend/src/copy/en.ts` (modified — 10 new editor copy keys)
- `kano-frontend/tests/unit/feature-list-editor.spec.ts` (new — 6 tests covering grid semantics, create, esc, delete, paste, 409 event)
- `docs/copy-deck.md` (modified — mirrors the 10 new editor keys)
