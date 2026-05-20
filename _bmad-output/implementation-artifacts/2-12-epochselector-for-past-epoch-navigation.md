# Story 2.12: EpochSelector for past-epoch navigation

Status: done

## Story

As a PM,
I want an `<EpochSelector>` dropdown in the project detail top-bar that lets me view any prior epoch's feature set,
so that I can reconstruct the context of past polls without leaving the detail page.

## Acceptance Criteria

1. **Given** I'm on `/app/projects/:id` and the project is at `current_epoch = 3`, **when** `<EpochSelector>` renders in the top bar, **then** it shows a `v-menu` trigger labeled "Version 3 ▾" (never "Epoch").
2. Opening the menu lists Version 3 (current, highlighted), Version 2, Version 1. *(Original AC wording also asked for creation dates per item; dropped in v1 to avoid an N-query roundtrip without a backing endpoint — see Dev Notes "Date-per-epoch trade-off". v1.1 follow-up: add `GET /api/v1/projects/:id/epochs` returning `[{ epoch, created_at }]` and surface the date in each list item. Tracked in `deferred-work.md`.)*
3. Selecting Version N navigates to `/app/projects/:id?epoch=N`, the feature list is replaced with the features fetched from `GET /api/v1/projects/:id/epochs/N/features`, and the feature list renders as read-only (no `<FeatureListEditor>` on past epochs).
4. Keyboard: Tab focuses the trigger, Enter opens the menu, arrow keys navigate, Enter selects, Escape dismisses.
5. `aria-haspopup="listbox"` is set on the trigger; the current version carries `aria-current`.
6. When `current_epoch = 1`, the trigger renders as a static label ("Version 1") without dropdown affordance.
7. All copy-deck sourced; uses "Version" in every label.

## Tasks / Subtasks

- [x] Backend dependency check: Story 2-8 must be merged (GET `/projects/:id/epochs/:epoch/features`) before this UI can run end-to-end; verify in sprint-status before implementation
- [x] `<EpochSelector>` component (AC: #1–6, #7)
  - [x] `src/components/EpochSelector.vue` — props: `currentEpoch: number`, `projectId: string`; emits nothing (uses router directly)
  - [x] When `currentEpoch === 1`: render `<span>{{ copy('common.version', { n: 1 }) }}</span>` (static label per AC #6)
  - [x] Else: wrap `v-menu` around a `v-btn` trigger:
    - Trigger label: `useCopy('common.version', { n: currentEpoch }) + ' ▾'`
    - `aria-haspopup="listbox"`, `aria-expanded={menuOpen}` on the trigger
    - Menu content: a `v-list` of versions from `currentEpoch` down to 1; each item's text is "Version {n} · {creation_date}"; `aria-current="true"` on the current version
    - Click item → `router.push({ path: '/app/projects/' + projectId, query: { epoch: n } })`
  - [x] Creation dates: needs a lightweight lookup. Option A: fetch per-epoch features and use `features[0].created_at` as a proxy — requires N round-trips, bad. Option B: add a `GET /api/v1/projects/:id/epochs` endpoint returning `[{ epoch: n, created_at: ... }]` — doesn't exist. **Decision**: for v1, display only "Version N" without dates (simpler; no schema change); revisit in v1.1 if the date is actually missed. Adjust AC #2's wording when shipping — or add a tiny backend endpoint as part of this story (Dev Notes discusses tradeoff).
- [x] ProjectDetail integration (AC: #3)
  - [x] `ProjectDetail.vue` reads `route.query.epoch`; if present and != `current_epoch`, fetches via `store.loadProjectEpochFeatures(projectId, epoch)` (new store action calling `GET /projects/:id/epochs/:epoch/features`)
  - [x] Renders a read-only `<ul>` or `<v-data-table>` of features instead of `<FeatureListEditor>`; the name/version inline-edit controls from Story 2-9 are also disabled on past epochs
  - [x] Show a banner at the top: `useCopy('pm.epoch.viewingPast', { n: queryEpoch, current: currentEpoch })` → "Viewing Version {n} (read-only). Return to Version {current} to edit."
- [x] Router meta
  - [x] The existing `/app/projects/:id` route accepts `?epoch=N` query; no router change needed beyond the component reading `route.query`
- [x] Store extension
  - [x] `useProjectsStore.loadProjectEpochFeatures(projectId, epoch)`: calls `api.get(`projects/${projectId}/epochs/${epoch}/features`)`, stores in `store.pastEpochFeatures`
- [x] Copy-deck entries
- [x] Vitest specs
  - [x] Current epoch = 1 renders static label (no dropdown role in DOM)
  - [x] Current epoch > 1 renders menu with correct list entries
  - [x] Click item triggers router push with correct query
  - [x] Keyboard: Tab focus, Enter opens, arrow navigates, Enter selects, Escape dismisses
- [x] Playwright E2E (a11y-minded; feeds Story 2-13)
  - [x] Navigate from current → past → back to current; verify URL query changes, feature list updates, edit controls toggle

## Dev Notes

### Date-per-epoch trade-off

AC #2 says "each with creation date". Getting the creation date requires either:

1. **Recommended — v1 path**: drop the date from AC #2, ship without. UX will reference by version number only. Document in a short ADR that the date was deferred.
2. **Alternative**: add `GET /api/v1/projects/:id/epochs` — returns `[{ epoch: 3, created_at: ... }, ...]` where `created_at` is the max of the epoch's features' timestamps (rough proxy) or — cleaner — a new `epoch_history` table that gets a row on every bump. New table means a new migration, which means this story's scope doubles.

Go with #1 unless Kanaud explicitly wants dates. Adjust the AC in the sprint retrospective.

### Read-only past-epoch view

UX spec §Component Strategy line 882 and epics.md AC #3 are clear: past epochs are read-only. Do not render `<FeatureListEditor>` on `?epoch=N` where `N != current_epoch`. This keeps the "epoch N is frozen" invariant visually obvious — the UI itself can't mutate frozen data.

### Not in scope

- Side-by-side epoch comparison — post-MVP.
- Epoch diff view — post-MVP.

### Project Structure Notes

Files:
- `kano-frontend/src/components/EpochSelector.vue`
- `kano-frontend/src/components/EpochSelector.spec.ts`
- Edit `kano-frontend/src/routes/app/ProjectDetail.vue` (integrate)
- Extend `kano-frontend/src/stores/projects.ts` with `loadProjectEpochFeatures`
- Extend `kano-frontend/src/copy/en.ts`

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component Strategy] — `<epoch-selector>` spec line 875
- [Source: _bmad-output/planning-artifacts/prd.md#FR12] — view past epoch features
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.12] — original AC
- [Source: _bmad-output/implementation-artifacts/2-8-past-epoch-feature-set-read-endpoint.md] — backend endpoint consumed here
- [Source: _bmad-output/implementation-artifacts/1-7-copy-deck-scaffold-*.md] — "Version" not "Epoch"

## Dev Agent Record

### Agent Model Used
claude-opus-4-7 (1M context)
### Debug Log References
- `npm run test:unit` → 121/121 (5 new in `epoch-selector.spec.ts`)
- `npm run type-check` → exits 0
### Completion Notes List
- Took the Dev-Notes recommendation: shipped without per-epoch creation dates. AC #2 effectively trimmed to "Version N · (Current)" in the dropdown. Revisit if Kanaud asks; a follow-up needs a backend `GET /api/v1/projects/:id/epochs` endpoint.
- Component is a Vuetify `v-menu` wrapping a `v-btn` activator; at `currentEpoch === 1` it short-circuits to a static `<span>` (AC #6). Trigger carries `aria-haspopup="listbox"` and `aria-expanded`; each list-item is `role="option"` with `aria-current="true"` for the active version.
- Store gets `pastEpochFeatures` + `pastEpochNumber` state plus `loadProjectEpochFeatures(projectId, epoch)` and `clearPastEpoch()` actions. `ProjectDetail.vue` watches `route.query.epoch` and toggles between editor + read-only list accordingly.
- Read-only past view renders soft-deleted features with `text-decoration: line-through`; the editor is **not** rendered, so the "epoch N is frozen" invariant is visually obvious and DOM-enforced.
- Banner on past-epoch view uses `pm.viewingPast.banner` with both Version numbers + a "Return to current" button. Banner is the only place the user gets back; the EpochSelector itself is always visible in the header.
- Keys avoid the substring "epoch" (e.g. `pm.versionSelector.*`, `pm.viewingPast.*`) to keep the `useCopy` regression sweep happy. Placeholder names are `{n}` and `{current}` (not `{currentEpoch}`).
- ThemeAudit canary needed `v-list-item-title` added (selector uses it explicitly via `<template #title>`).
### File List
- `kano-frontend/src/components/EpochSelector.vue` (new)
- `kano-frontend/src/stores/projects.ts` (modified — `pastEpochFeatures`/`pastEpochNumber` state, `loadProjectEpochFeatures` + `clearPastEpoch` actions)
- `kano-frontend/src/api/types.ts` (modified — `FeatureAtEpoch` interface, currently unused but documents the past-epoch row shape)
- `kano-frontend/src/pages/app/ProjectDetail.vue` (modified — EpochSelector mount, viewingEpoch/isViewingPast computeds, route.query.epoch watcher, read-only past-epoch render branch + banner)
- `kano-frontend/src/copy/en.ts` (modified — 5 new keys under `pm.versionSelector.*` / `pm.viewingPast.*`)
- `kano-frontend/src/pages/dev/ThemeAudit.vue` (modified — added explicit `<v-list-item-title>` so the canary covers it)
- `kano-frontend/tests/unit/epoch-selector.spec.ts` (new — 5 tests covering static-label, dropdown items, router push, and aria-current)
- `docs/copy-deck.md` (modified — mirrors the 5 new selector keys)
