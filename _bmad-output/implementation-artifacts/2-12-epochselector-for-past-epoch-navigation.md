# Story 2.12: EpochSelector for past-epoch navigation

Status: ready-for-dev

## Story

As a PM,
I want an `<EpochSelector>` dropdown in the project detail top-bar that lets me view any prior epoch's feature set,
so that I can reconstruct the context of past polls without leaving the detail page.

## Acceptance Criteria

1. **Given** I'm on `/app/projects/:id` and the project is at `current_epoch = 3`, **when** `<EpochSelector>` renders in the top bar, **then** it shows a `v-menu` trigger labeled "Version 3 ▾" (never "Epoch").
2. Opening the menu lists Version 3 (current, highlighted), Version 2, Version 1, each with creation date.
3. Selecting Version N navigates to `/app/projects/:id?epoch=N`, the feature list is replaced with the features fetched from `GET /api/v1/projects/:id/epochs/N/features`, and the feature list renders as read-only (no `<FeatureListEditor>` on past epochs).
4. Keyboard: Tab focuses the trigger, Enter opens the menu, arrow keys navigate, Enter selects, Escape dismisses.
5. `aria-haspopup="listbox"` is set on the trigger; the current version carries `aria-current`.
6. When `current_epoch = 1`, the trigger renders as a static label ("Version 1") without dropdown affordance.
7. All copy-deck sourced; uses "Version" in every label.

## Tasks / Subtasks

- [ ] Backend dependency check: Story 2-8 must be merged (GET `/projects/:id/epochs/:epoch/features`) before this UI can run end-to-end; verify in sprint-status before implementation
- [ ] `<EpochSelector>` component (AC: #1–6, #7)
  - [ ] `src/components/EpochSelector.vue` — props: `currentEpoch: number`, `projectId: string`; emits nothing (uses router directly)
  - [ ] When `currentEpoch === 1`: render `<span>{{ copy('common.version', { n: 1 }) }}</span>` (static label per AC #6)
  - [ ] Else: wrap `v-menu` around a `v-btn` trigger:
    - Trigger label: `useCopy('common.version', { n: currentEpoch }) + ' ▾'`
    - `aria-haspopup="listbox"`, `aria-expanded={menuOpen}` on the trigger
    - Menu content: a `v-list` of versions from `currentEpoch` down to 1; each item's text is "Version {n} · {creation_date}"; `aria-current="true"` on the current version
    - Click item → `router.push({ path: '/app/projects/' + projectId, query: { epoch: n } })`
  - [ ] Creation dates: needs a lightweight lookup. Option A: fetch per-epoch features and use `features[0].created_at` as a proxy — requires N round-trips, bad. Option B: add a `GET /api/v1/projects/:id/epochs` endpoint returning `[{ epoch: n, created_at: ... }]` — doesn't exist. **Decision**: for v1, display only "Version N" without dates (simpler; no schema change); revisit in v1.1 if the date is actually missed. Adjust AC #2's wording when shipping — or add a tiny backend endpoint as part of this story (Dev Notes discusses tradeoff).
- [ ] ProjectDetail integration (AC: #3)
  - [ ] `ProjectDetail.vue` reads `route.query.epoch`; if present and != `current_epoch`, fetches via `store.loadProjectEpochFeatures(projectId, epoch)` (new store action calling `GET /projects/:id/epochs/:epoch/features`)
  - [ ] Renders a read-only `<ul>` or `<v-data-table>` of features instead of `<FeatureListEditor>`; the name/version inline-edit controls from Story 2-9 are also disabled on past epochs
  - [ ] Show a banner at the top: `useCopy('pm.epoch.viewingPast', { n: queryEpoch, current: currentEpoch })` → "Viewing Version {n} (read-only). Return to Version {current} to edit."
- [ ] Router meta
  - [ ] The existing `/app/projects/:id` route accepts `?epoch=N` query; no router change needed beyond the component reading `route.query`
- [ ] Store extension
  - [ ] `useProjectsStore.loadProjectEpochFeatures(projectId, epoch)`: calls `api.get(`projects/${projectId}/epochs/${epoch}/features`)`, stores in `store.pastEpochFeatures`
- [ ] Copy-deck entries
- [ ] Vitest specs
  - [ ] Current epoch = 1 renders static label (no dropdown role in DOM)
  - [ ] Current epoch > 1 renders menu with correct list entries
  - [ ] Click item triggers router push with correct query
  - [ ] Keyboard: Tab focus, Enter opens, arrow navigates, Enter selects, Escape dismisses
- [ ] Playwright E2E (a11y-minded; feeds Story 2-13)
  - [ ] Navigate from current → past → back to current; verify URL query changes, feature list updates, edit controls toggle

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
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
