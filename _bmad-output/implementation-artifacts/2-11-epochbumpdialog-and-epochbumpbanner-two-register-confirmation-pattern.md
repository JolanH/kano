# Story 2.11: EpochBumpDialog and EpochBumpBanner two-register confirmation pattern

Status: ready-for-dev

## Story

As a PM,
I want a firm modal for consequential epoch bumps (when polls exist) and a soft inline banner for non-consequential ones (empty epoch),
so that I'm asked to acknowledge version bumps when it matters, and informed (not interrupted) when it doesn't.

## Acceptance Criteria

1. **Given** Paola triggers a feature mutation via `<FeatureListEditor>` on a project at epoch N with zero polls, **when** the mutation succeeds in place, **then** `<EpochBumpBanner>` (a `v-alert` info variant with `role="status"`) appears inline above the feature list with copy "Version N updated in place — no responses to preserve", auto-dismissing after ~4 seconds.
2. **Given** Paola triggers a feature mutation on a project at epoch N that has at least one poll, **when** the API returns 409 `epoch-bump-required`, **then** `<EpochBumpDialog>` (a Vuetify `v-dialog`) opens with title "Create Version N+1?", body listing consequences (responses preserved in Version N, new polls will use Version N+1), Cancel + Create Version N+1 buttons (primary orange).
3. **When** Paola clicks "Create Version N+1", **then** the original mutation request is retried with `?acknowledged=true`; the dialog transitions to a brief processing state; on success the dialog closes, focus returns to the triggering edit site, and a top-bar notice "Now editing Version N+1" is displayed.
4. **When** Paola presses Escape or clicks Cancel, **then** the dialog closes without mutation; the feature list's pending edit is reverted; focus returns to the edit source.
5. The dialog traps focus while open; copy-deck keys source all strings; no inline literals.
6. The word "Epoch" is never surfaced in any user-facing string from either component — only "Version".

## Tasks / Subtasks

- [ ] `<EpochBumpBanner>` (AC: #1, #5, #6)
  - [ ] `src/components/EpochBumpBanner.vue` — props: `currentEpoch: number`; emits: `dismiss`
  - [ ] Wraps `v-alert` with `type="info"`, `role="status"`, closable
  - [ ] Body text via `useCopy('pm.epoch.banner.inPlace', { n: currentEpoch })` → "Version {n} updated in place — no responses to preserve"
  - [ ] Auto-dismiss timer: `setTimeout(() => emit('dismiss'), 4000)` on mount; cleared on explicit close
  - [ ] Never uses the word "Epoch"
- [ ] `<EpochBumpDialog>` (AC: #2, #3, #4, #5, #6)
  - [ ] `src/components/EpochBumpDialog.vue` — props: `modelValue: boolean` (v-model open state), `currentEpoch: number`, `wouldBeEpoch: number`, `onConfirm: () => Promise<void>`; emits: `update:modelValue`, `confirmed`, `cancelled`
  - [ ] Wraps `v-dialog` with `:persistent="false"` (Esc closes), `width="480"`
  - [ ] Title: `useCopy('pm.epoch.dialog.title', { n: wouldBeEpoch })` → "Create Version {n}?"
  - [ ] Body: two-paragraph structure — (1) "Existing responses on Version {currentEpoch} will be preserved", (2) "New polls will use Version {wouldBeEpoch}"
  - [ ] Action row: Cancel button (secondary) + Create button (primary orange)
  - [ ] Create handler: set `isProcessing.value = true`; `await props.onConfirm()`; on success emit `confirmed`, close dialog; on failure, keep dialog open and show error (`v-alert type="error"`)
  - [ ] Cancel handler: emit `cancelled`, close
  - [ ] Escape key: Vuetify handles via `v-dialog` default; confirm it triggers the same path as Cancel
  - [ ] Focus trap: Vuetify `v-dialog` handles natively; verify by Playwright test
  - [ ] All copy via `useCopy('pm.epoch.dialog.*')` keys
- [ ] Top-bar notice after successful bump (AC: #3)
  - [ ] Use Vuetify `v-snackbar` with text `useCopy('pm.epoch.nowEditing', { n: wouldBeEpoch })` → "Now editing Version {n}"
  - [ ] Trigger from `ProjectDetail.vue` when `<EpochBumpDialog>` emits `confirmed`
- [ ] Integration in `ProjectDetail.vue`
  - [ ] Local refs: `dialogOpen = ref(false)`, `dialogContext = ref<{ currentEpoch, wouldBeEpoch, mutation } | null>(null)`, `showBanner = ref(false)`, `snackbarOpen = ref(false)`
  - [ ] `<FeatureListEditor>` listeners:
    - `@feature-created`, `@feature-updated`, `@feature-deleted` on empty-epoch path → show banner
    - `@epoch-bump-required` → set dialog context and open dialog
  - [ ] Dialog `@confirmed` → await `dialogContext.value.mutation()`; on success show snackbar + refresh project (`store.refreshCurrent()`); focus returns automatically because Vuetify restores focus on `v-dialog` close
  - [ ] Dialog `@cancelled` → revert the `<FeatureListEditor>`'s pending state (emit a `revert` back to the editor if needed, or force a refresh)
- [ ] Copy-deck entries — add all keys under `pm.epoch.*`
- [ ] Vitest specs
  - [ ] Banner auto-dismisses after 4s
  - [ ] Banner emits `dismiss` on click-close
  - [ ] Dialog Create button calls `onConfirm`; on success emits `confirmed`; on throw, keeps open with error alert
  - [ ] Dialog Cancel emits `cancelled`
  - [ ] Escape key triggers the same path as Cancel
- [ ] Playwright E2E (companion to Story 2-13's a11y sweep)
  - [ ] Full flow: create a project, add a feature, create a poll (mock/stub), edit the feature, dialog opens, confirm, feature edit succeeds on epoch N+1, snackbar appears
  - [ ] Focus management: after dialog closes, focus is on the feature editor cell that triggered it (assert via `page.locator(':focus')`)

## Dev Notes

### "Epoch" vs "Version" discipline (AC #6)

Hard rule: internal code says `epoch`, user-facing text says `Version`. Story 1-7's copy deck has `common.version`. Every string emitted by these two components MUST go through `useCopy` with a key whose value is "Version"-based. A simple ESLint custom rule could enforce this, but for v1 rely on the code-review checklist and the inline-literal lint rule.

### Focus restoration

Vuetify `v-dialog` restores focus to the triggering element on close by default. Verify this is still true in Vuetify 4 and that the "triggering element" is the cell in the FeatureListEditor that opened the dialog (not the dialog's Create button). If broken, manually capture `document.activeElement` on dialog open and restore on close.

### Not in scope

- `<EpochSelector>` (past-epoch navigation) — Story 2-12.
- Full a11y sweep — Story 2-13.

### Project Structure Notes

Files:
- `kano-frontend/src/components/EpochBumpBanner.vue`
- `kano-frontend/src/components/EpochBumpDialog.vue`
- `kano-frontend/src/components/EpochBumpBanner.spec.ts`
- `kano-frontend/src/components/EpochBumpDialog.spec.ts`
- Edit `kano-frontend/src/routes/app/ProjectDetail.vue` (integrate)
- Extend `kano-frontend/src/copy/en.ts`
- `kano-frontend/e2e/pm/epoch-bump.spec.ts` (Playwright)

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component Strategy] — `<epoch-bump-dialog>` spec line 885, `<epoch-bump-banner>` spec line 895
- [Source: _bmad-output/planning-artifacts/prd.md#FR11] — explicit PM acknowledgement required
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.11] — original AC
- [Source: _bmad-output/implementation-artifacts/2-7-feature-mutation-api-with-epoch-bump-gating.md] — 409 Problem Details payload shape consumed here
- [Source: _bmad-output/implementation-artifacts/2-10-featurelisteditor-inline-first-authoring-component.md] — emits the `epoch-bump-required` event consumed here
- [Source: _bmad-output/implementation-artifacts/1-7-copy-deck-scaffold-*.md] — "Version" not "Epoch" rule

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
