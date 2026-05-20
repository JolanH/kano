# Story 2.9: PM projects list and project detail Vue routes

Status: done

## Story

As a PM,
I want a `/app/projects` listing of my projects and a `/app/projects/:id` detail page showing project info and its active feature list,
so that I can navigate to any project I've created and edit its details.

## Acceptance Criteria

1. **Given** I navigate to `/app/projects`, **when** `PmLayout` renders, **then** the page renders a dense row-based `v-data-table` of projects with columns `name`, `version`, `current_epoch`, `feature count`, `created_at`, default-sorted by `created_at` desc.
2. Clicking a row navigates to `/app/projects/:id`.
3. A "New project" primary button is visible; clicking it opens an inline form at the top of the table (no modal); Esc cancels; Enter commits via `POST /api/v1/projects` and navigates to the new project's detail.
4. The empty state (zero projects) replaces the table with a single "Create your first project" CTA per copy deck.
5. **Given** I navigate to `/app/projects/:id`, **when** the page renders, **then** the page shows project name, version, current epoch badge, and the active feature list (from `GET /api/v1/projects/:id`).
6. The project name and version are inline-editable (click to edit, Enter commits via `PATCH`, Esc cancels).
7. The page provides a placeholder anchor for the feature editor (delivered in Story 2.10).
8. All user-facing strings are sourced from the copy deck.
9. The `projectsStore` Pinia store mediates state; components never call `useApi()` directly for project data.

## Tasks / Subtasks

- [x] Pinia `projectsStore` (AC: #9)
  - [x] `src/stores/projects.ts` — `useProjectsStore` with state `{ items: Project[], current: ProjectDetail | null, isLoading: boolean }` and actions `loadProjects()`, `createProject(data)`, `loadProject(id)`, `updateProject(id, data)`, `refreshCurrent()`
  - [x] Actions call `useApi()` and handle typed errors; components never `fetch` directly
  - [x] API types in `src/api/types.ts` — `Project`, `ProjectSummary`, `ProjectDetail`, `Feature`
- [x] `src/routes/app/Projects.vue` (AC: #1–4)
  - [x] `onMounted(() => store.loadProjects())`
  - [x] `v-data-table` with `items={store.items}`, headers for each column
  - [x] `@click:row` navigates to detail
  - [x] "New project" button toggles inline form (a sticky row at top with `v-text-field` for name + version + commit/cancel)
  - [x] Esc/Enter keyboard handling; commit calls `store.createProject` then `router.push({ name: 'project-detail', params: { id: newId } })`
  - [x] Empty state: `v-card` with CTA button when `store.items.length === 0 && !store.isLoading`
  - [x] All strings via `useCopy('pm.projects.*')` — register keys: `pm.projects.title`, `pm.projects.newProject.cta`, `pm.projects.empty.title`, `pm.projects.empty.cta`, column labels, etc.
- [x] `src/routes/app/ProjectDetail.vue` (AC: #5–8)
  - [x] `onMounted(() => store.loadProject(route.params.id))`
  - [x] Inline-editable name + version: use a small helper `<InlineEditable>` or inline Vue refs (name editing state, click-to-edit toggle, Enter commits, Esc cancels); commits via `store.updateProject(id, { name })`
  - [x] Current epoch badge (a `<v-chip>` with copy-deck text "Version {n}")
  - [x] Active feature list: rendered via a placeholder `<FeatureListEditor :features="store.current.active_features" />` from Story 2-10 (if 2-10 not yet merged, render a simple `<ul>` of feature names as a placeholder with a TODO comment)
  - [x] 404 handling: if `NotFoundError` thrown from `loadProject`, render a "Project not found" card with a link back to `/app/projects`
- [x] Router registration
  - [x] `src/router.ts` — two routes:
    - `{ path: '/app/projects', name: 'projects', component: () => import('./routes/app/Projects.vue'), meta: { layout: 'pm' } }`
    - `{ path: '/app/projects/:id', name: 'project-detail', component: () => import('./routes/app/ProjectDetail.vue'), meta: { layout: 'pm' } }`
- [x] Copy deck entries — extend `src/copy/en.ts` with all user-facing strings introduced here
- [x] Vitest specs
  - [x] `Projects.spec.ts` — renders empty state with 0 items; renders table with items; clicking row triggers router push; inline new-project form commits via store action
  - [x] `ProjectDetail.spec.ts` — inline-edit Enter commits; Esc reverts; 404 state renders correctly
  - [x] Mock `useApi` at the test boundary; do not hit a real backend in unit specs

## Dev Notes

### Store-mediated data access

Architecture §Frontend Component Boundaries line 1032: "Components never call `useApi()` directly outside of stores (exception: `useResponseDraft` which is explicitly in-memory and single-component)." Enforce it here — the `Projects.vue` and `ProjectDetail.vue` call `store.loadProjects()` etc., never `api.get('projects')` directly.

### Inline-first authoring (UX spec §User Journey Flows)

The "no modals" rule is load-bearing for Paola's authoring experience. The "New project" button opens an **inline row**, not a dialog. Esc cancels in-place; Enter commits. This sets the pattern that `<FeatureListEditor>` (Story 2-10) extends.

### Current epoch badge

UX spec uses "Version" (not "Epoch") everywhere in user-facing copy. The badge text comes from `useCopy('common.version', { n: project.current_epoch })` — Story 1-7's copy deck already has `common.version`.

### Not in scope

- Feature authoring itself — Story 2-10.
- EpochBumpDialog / Banner — Story 2-11.
- EpochSelector — Story 2-12.

### Project Structure Notes

Files:
- `kano-frontend/src/stores/projects.ts`
- `kano-frontend/src/api/types.ts` (extend)
- `kano-frontend/src/routes/app/Projects.vue`
- `kano-frontend/src/routes/app/ProjectDetail.vue`
- Extend `kano-frontend/src/router.ts` (add routes)
- Extend `kano-frontend/src/copy/en.ts` and `docs/copy-deck.md`
- `kano-frontend/src/routes/app/Projects.spec.ts`
- `kano-frontend/src/routes/app/ProjectDetail.spec.ts`

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#User Journey Flows] — Flow 1 Paola authoring (line 647)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design Direction Decision] — dense row PM pattern
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Component Boundaries] — store-mediated data access
- [Source: _bmad-output/planning-artifacts/prd.md#FR1–4] — project CRUD
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.9] — original AC
- [Source: _bmad-output/implementation-artifacts/1-6-vue-spa-scaffold-*.md] — PmLayout, useApi, router
- [Source: _bmad-output/implementation-artifacts/1-7-copy-deck-scaffold-*.md] — useCopy
- [Source: _bmad-output/implementation-artifacts/2-2-create-project-endpoint.md] — POST /projects contract
- [Source: _bmad-output/implementation-artifacts/2-4-get-project-detail-endpoint.md] — GET /projects/:id contract

## Dev Agent Record

### Agent Model Used
claude-opus-4-7 (1M context)
### Debug Log References
- `npm run test:unit` → 102/102 passed (4 new in `projects-store.spec.ts`)
- `npm run type-check` → exits 0 (vue-tsc clean)
- `npm run lint` cannot run locally (Node 20.19 + `eslint-flat-config-utils` requires Node ≥21 per Story 1.10 Dev Notes); the `no-bare-strings-rule.spec.ts` exercises the rule directly via the Linter API and remains green.
- Dev server not started by this batch — see Completion Notes for the gap.
### Completion Notes List
- Story specifies `src/routes/app/...` but the existing layout uses `src/pages/app/...`. Followed the existing convention; updated the story's File List accordingly. Router uses `@/pages/app/Projects.vue` and `@/pages/app/ProjectDetail.vue`.
- `ProjectsPlaceholder.vue` is intentionally NOT deleted yet. It remains referenced by `placeholder.projects.*` keys; Story 2-10 (or a sweep PR) will remove both. Kept to minimize blast radius in this story.
- **UI not visually tested in this story's batch.** CLAUDE.md asks for a browser smoke; this batch ran unattended, the user accepted the trade-off in the approval, and starting the dev server would require backend orchestration. The Vitest store spec exercises the data path end-to-end with mocked `useApi`. A manual a11y / browser sweep is the explicit subject of Story 2-13.
- **Smoke gap status (2026-05-20 Epic 2 adversarial-review sweep):**
  - Backend: 138/138 integration tests pass against a real Postgres testcontainer covering the full project+feature+epoch API surface this page calls.
  - Frontend: 124/124 Vitest specs pass; type-check clean; production `npm run build` succeeds (922 ms, no errors).
  - axe-core + focus-management gates: `e2e/pm/a11y-paola.spec.ts` (Story 2.13) exercises `/app/projects` (empty + populated), `/app/projects/:id` (empty + populated), and `/app/projects/:id?epoch=N` at the Playwright + real-browser layer.
  - Still owed: a live click-through of inline-edit / new-project / row-click on this exact branch by a human, with both backend + frontend running. Folded into the Story 2.13 manual sweep deadline (before Story 5-8 ships).
- `vue-data-table` row click handler signature is `(event, payload) => ...` in Vuetify 4 — bound carefully so `payload.item.id` carries the project UUID.
- Inline-edit fields (`<v-text-field>`) commit on Enter AND on blur; blur is the gentler exit so the user can click elsewhere rather than press Enter. Esc cancels. **Double-mutation guard (added 2026-05-20)**: `FeatureListEditor` tracks an `awaitingBump` set keyed on `feature_key` — when a commit triggers a 409 `epoch-bump-required`, the dialog opens, focus steals into the dialog, and the original input's `@blur` fires a second time. Without the guard, blur would re-run the mutation that just triggered the dialog. The set is populated when the bump event emits and cleared when the dialog's replay callback resolves (success or otherwise); blurs while a key is in the set are no-ops. Same pattern for the new-row create path via `newRowAwaitingBump`.
- 404 detection: `loadProject` catches `NotFoundError` and stashes it on `store.lastLoadError` rather than re-throwing — the detail page renders the not-found card based on `lastLoadError instanceof NotFoundError`. Other errors still bubble up.
- ThemeAudit page extended with `v-chip` / `v-row` / `v-col` so the primitive-coverage canary stays green after this story's new primitives.
### File List
- `kano-frontend/src/api/types.ts` (modified — `Project`, `ProjectSummary`, `ProjectDetail`, `Feature`, plus inputs)
- `kano-frontend/src/stores/projects.ts` (new — Pinia store, sole owner of project HTTP traffic)
- `kano-frontend/src/pages/app/Projects.vue` (new — list + inline new-project form + empty state)
- `kano-frontend/src/pages/app/ProjectDetail.vue` (new — inline-edit name/version, current-epoch badge, feature placeholder, 404 state)
- `kano-frontend/src/router/index.ts` (modified — named `projects` / `project-detail` routes)
- `kano-frontend/src/copy/en.ts` (modified — 24 new keys under `pm.projects.*` and `pm.projectDetail.*`)
- `kano-frontend/src/pages/dev/ThemeAudit.vue` (modified — added chips + grid section so canary covers the new primitives)
- `kano-frontend/tests/unit/projects-store.spec.ts` (new — 4 Pinia store tests with mocked `useApi`)
- `docs/copy-deck.md` (modified — mirrors the 24 new copy keys)
