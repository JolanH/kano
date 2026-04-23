# Story 2.9: PM projects list and project detail Vue routes

Status: ready-for-dev

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

- [ ] Pinia `projectsStore` (AC: #9)
  - [ ] `src/stores/projects.ts` — `useProjectsStore` with state `{ items: Project[], current: ProjectDetail | null, isLoading: boolean }` and actions `loadProjects()`, `createProject(data)`, `loadProject(id)`, `updateProject(id, data)`, `refreshCurrent()`
  - [ ] Actions call `useApi()` and handle typed errors; components never `fetch` directly
  - [ ] API types in `src/api/types.ts` — `Project`, `ProjectSummary`, `ProjectDetail`, `Feature`
- [ ] `src/routes/app/Projects.vue` (AC: #1–4)
  - [ ] `onMounted(() => store.loadProjects())`
  - [ ] `v-data-table` with `items={store.items}`, headers for each column
  - [ ] `@click:row` navigates to detail
  - [ ] "New project" button toggles inline form (a sticky row at top with `v-text-field` for name + version + commit/cancel)
  - [ ] Esc/Enter keyboard handling; commit calls `store.createProject` then `router.push({ name: 'project-detail', params: { id: newId } })`
  - [ ] Empty state: `v-card` with CTA button when `store.items.length === 0 && !store.isLoading`
  - [ ] All strings via `useCopy('pm.projects.*')` — register keys: `pm.projects.title`, `pm.projects.newProject.cta`, `pm.projects.empty.title`, `pm.projects.empty.cta`, column labels, etc.
- [ ] `src/routes/app/ProjectDetail.vue` (AC: #5–8)
  - [ ] `onMounted(() => store.loadProject(route.params.id))`
  - [ ] Inline-editable name + version: use a small helper `<InlineEditable>` or inline Vue refs (name editing state, click-to-edit toggle, Enter commits, Esc cancels); commits via `store.updateProject(id, { name })`
  - [ ] Current epoch badge (a `<v-chip>` with copy-deck text "Version {n}")
  - [ ] Active feature list: rendered via a placeholder `<FeatureListEditor :features="store.current.active_features" />` from Story 2-10 (if 2-10 not yet merged, render a simple `<ul>` of feature names as a placeholder with a TODO comment)
  - [ ] 404 handling: if `NotFoundError` thrown from `loadProject`, render a "Project not found" card with a link back to `/app/projects`
- [ ] Router registration
  - [ ] `src/router.ts` — two routes:
    - `{ path: '/app/projects', name: 'projects', component: () => import('./routes/app/Projects.vue'), meta: { layout: 'pm' } }`
    - `{ path: '/app/projects/:id', name: 'project-detail', component: () => import('./routes/app/ProjectDetail.vue'), meta: { layout: 'pm' } }`
- [ ] Copy deck entries — extend `src/copy/en.ts` with all user-facing strings introduced here
- [ ] Vitest specs
  - [ ] `Projects.spec.ts` — renders empty state with 0 items; renders table with items; clicking row triggers router push; inline new-project form commits via store action
  - [ ] `ProjectDetail.spec.ts` — inline-edit Enter commits; Esc reverts; 404 state renders correctly
  - [ ] Mock `useApi` at the test boundary; do not hit a real backend in unit specs

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
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
