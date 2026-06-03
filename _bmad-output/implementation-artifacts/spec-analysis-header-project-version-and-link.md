---
title: 'Analysis header: project version + link to project'
type: 'feature'
created: '2026-06-03'
status: 'done'
context: []
baseline_commit: 'b94e0a8d0b88276749c5e7f137492da6e65b2b20'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The poll analysis page header shows the project name and the Epoch chip, but not the project's release `version` string, and the name is not a link back to the project. PMs reading an analysis can't see which release label it belongs to or jump to the project.

**Approach:** In the analysis header `__primary` cluster, insert a "Version: {version}" display between the name and the Epoch chip — mirroring `ProjectDetail.vue`'s header layout — and turn the project name (`h1`) into a router link to the project-detail page.

## Boundaries & Constraints

**Always:**
- Reuse the existing terminology split: `pm.projectDetail.version.label` ("Version") for the release string; the existing chip keeps `common.version` ("Epoch") + `analysis.epoch`. Do not relabel either.
- Source the version from `projectsStore.current.version` only when `current.id === projectId` (same guard as `projectName`/`projectCurrentEpoch`).
- The name-link target is the existing route `{ name: 'project-detail', params: { id: projectId } }`.
- All user-facing strings come from the copy deck via `copy(...)` — no inline literals (lint rule enforces this).

**Ask First:**
- Any change to the Epoch chip, EpochSelector, or confidence-beat (out of this scope).

**Never:**
- New backend/API changes — `version` is already on `ProjectSummary`/`ProjectDetail`.
- New routes or copy keys beyond reusing `pm.projectDetail.version.label`.
- Rendering a dangling "Version:" label when the version string is empty/unavailable.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Store matches project | `projectsStore.current.id === projectId`, version `"1.0"` | Header shows name (as link), then "Version: 1.0", then Epoch chip | N/A |
| Direct URL entry, store empty | `projectsStore.current` null until parallel fetch resolves | No name/version until fetch resolves; once resolved both render | Project fetch failure → header renders without name/version (existing silent fallback) |
| Empty version string | `current.version === ''` | Version display hidden entirely (no bare "Version:" label) | N/A |
| Name link click | User clicks project name | Navigates to project-detail for `projectId` | N/A |

</frozen-after-approval>

## Code Map

- `kano-frontend/src/pages/app/Analysis.vue` -- the page; header `__primary` block (lines ~143-159) and `<script setup>` computeds (~66-89) to edit
- `kano-frontend/src/pages/app/ProjectDetail.vue` -- reference for the "Version: {value}" layout (lines ~47-78)
- `kano-frontend/src/copy/en.ts` -- `pm.projectDetail.version.label` = "Version" (reuse); `common.version` = "Epoch"
- `kano-frontend/src/router/index.ts` -- `project-detail` route at `/app/projects/:id`
- `kano-frontend/tests/unit/analysis-page.spec.ts` -- header test (~301); `vue-router` is mocked (no RouterLink registered)

## Tasks & Acceptance

**Execution:**
- [x] `kano-frontend/src/pages/app/Analysis.vue` -- add a `projectVersion` computed (same store/id guard as `projectName`, returns `''` when no match); render a `Version: {{ projectVersion }}` block (label via `copy('pm.projectDetail.version.label')`, `data-testid="analysis-project-version"`) between the `h1` and the Epoch chip, shown only when `projectVersion` is truthy; wrap the `h1` text in a `RouterLink` to `{ name: 'project-detail', params: { id: projectId } }` (`data-testid="analysis-project-link"`), keeping the `text-h2 analysis-title` heading. Add scoped styles so the link inherits heading color (no default anchor blue) with a hover affordance.
- [x] `kano-frontend/tests/unit/analysis-page.spec.ts` -- register a `RouterLink` stub in `globalStubs` (render an `<a>` exposing the `to` target); extend the existing header test to assert the version display text ("Version 1.0") and that the name link points at the project-detail route. Add an edge test: empty `version` hides `analysis-project-version`.

**Acceptance Criteria:**
- Given the projects store holds the current project with version "1.0", when the analysis page renders, then the header shows the name as a link, then "Version: 1.0", then the "Epoch N" chip — in that order.
- Given the current project's version is empty, when the header renders, then no `analysis-project-version` element is present.
- Given the user clicks the project name, when navigation fires, then it targets the `project-detail` route for the current `projectId`.
- Given a direct-URL entry where the store is initially empty, when the project fetch fails, then the header renders without name/version (no crash) — existing fallback preserved.

## Design Notes

Layout mirrors `ProjectDetail.vue` lines 47-75 — a `text-on-surface-variant` inline group: `<span>Version:</span> <span>{{ value }}</span>`. Keep it lighter weight than the title.

Name-link sketch (keep the heading element, link inside):

```vue
<h1 v-if="projectName" class="text-h2 analysis-title" data-testid="analysis-project-name">
  <RouterLink
    :to="{ name: 'project-detail', params: { id: projectId } }"
    class="analysis-title__link"
    data-testid="analysis-project-link"
  >{{ projectName }}</RouterLink>
</h1>
```

## Verification

**Commands:**
- `cd kano-frontend && npm run test:unit -- analysis-page` -- expected: all header tests pass (version display + link target + empty-version edge)
- `cd kano-frontend && npm run type-check` -- expected: no TS errors
- `cd kano-frontend && npm run lint` -- expected: clean (no inline-literal violations)

**Manual checks:**
- Load an analysis page reached from project-detail: header reads name → "Version: X" → "Epoch N"; clicking the name returns to the project.

## Suggested Review Order

**Header rendering (the change)**

- Entry point — DOM order: name-link → version display → Epoch chip (unchanged).
  [`Analysis.vue:158`](../../kano-frontend/src/pages/app/Analysis.vue#L158)

- Version display, gated on a truthy version string so it's hidden when absent.
  [`Analysis.vue:167`](../../kano-frontend/src/pages/app/Analysis.vue#L167)

**Data source**

- `projectVersion` computed — same store/id guard as `projectName`; returns `''` on mismatch.
  [`Analysis.vue:76`](../../kano-frontend/src/pages/app/Analysis.vue#L76)

**Styling**

- Link inherits heading color, underlines only on hover/focus.
  [`Analysis.vue:284`](../../kano-frontend/src/pages/app/Analysis.vue#L284)

**Tests (peripheral)**

- Header test asserts the link target + version text.
  [`analysis-page.spec.ts:329`](../../kano-frontend/tests/unit/analysis-page.spec.ts#L329)

- Empty-version edge: display is absent.
  [`analysis-page.spec.ts:359`](../../kano-frontend/tests/unit/analysis-page.spec.ts#L359)

- RouterLink stub (vue-router is mocked) exposing `to` as `data-to`.
  [`analysis-page.spec.ts:182`](../../kano-frontend/tests/unit/analysis-page.spec.ts#L182)
