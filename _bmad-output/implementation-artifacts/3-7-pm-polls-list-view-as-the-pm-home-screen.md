# Story 3.7: PM polls list view as the PM home screen

Status: ready-for-dev

## Story

As a PM,
I want a `/app/polls` page (the default PM route) listing every poll across projects with response counts and expiry,
so that the home screen tells me what's alive and what needs attention at a glance.

## Acceptance Criteria

1. **Given** I navigate to `/` or `/app/` or `/app/polls`, **when** `PmLayout` renders, **then** the router resolves the default redirect to `/app/polls`.
2. **Given** at least one poll exists across all projects, **when** `/app/polls` loads, **then** the page shows a dense row-based `v-data-table` of polls with columns: Project (clickable link to `/app/projects/:id`), Version (pinned-epoch badge labeled "Version N"), Response count, Expires in (human countdown like "3 days", "2 hours", "Expired"), Created.
3. The table is default-sorted by `Created` descending (matches server order from Story 3.3).
4. **Given** a poll row is clicked (not its project-link cell), **when** the row is non-expired, **then** the router navigates to `/app/projects/:projectId/polls/:pollId/share` (reusing the share view from Story 3.6).
5. **Given** a poll row is clicked AND the poll IS expired, **when** analysis from Epic 5 has not yet shipped, **then** the click navigates to a placeholder route `/app/projects/:projectId/polls/:pollId/analysis` which renders a simple `<v-card>` with copy-deck text `pm.polls.analysisPlaceholder` ("Analysis view ships in Epic 5 — for now, the expired poll's responses are preserved in the database."). Epic 5 replaces the placeholder without changing the route.
6. Expired polls render with muted row styling (`class="text-medium-emphasis"` or equivalent Vuetify class on the row) and "Expired" text in the Expires-in column instead of a countdown.
7. **Given** no polls exist anywhere in the system, **when** `/app/polls` renders, **then** the `v-data-table` is replaced by an empty-state card with a primary CTA "Create your first project" routing to `/app/projects` (from Story 2.9). No search/filter chrome is rendered.
8. The `pollsStore.loadAllPolls()` action is called on page mount; response counts come from Story 3.3's server computation (no per-row client count).
9. All user-visible strings are sourced from the copy deck.
10. Vitest + Playwright specs cover: empty state renders CTA; populated state renders table with correct rows; row click routes correctly; expired polls render muted; Version badge shows correct epoch.

## Tasks / Subtasks

- [ ] Router default redirect (AC: #1)
  - [ ] `kano-frontend/src/router.ts`:
    - Add route `{ path: '/', redirect: '/app/polls' }`
    - Add route `{ path: '/app', redirect: '/app/polls' }`
    - Add route `{ path: '/app/polls', name: 'polls', component: () => import('./routes/app/Polls.vue'), meta: { layout: 'pm' } }`
    - Add placeholder route `{ path: '/app/projects/:id/polls/:pollId/analysis', name: 'poll-analysis', component: () => import('./routes/app/AnalysisPlaceholder.vue'), meta: { layout: 'pm' } }` (real component ships in Epic 5)
  - [ ] Ensure 2-9's project routes still work — the home redirect must not override `/app/projects`
- [ ] `pollsStore.loadAllPolls()` (AC: #8)
  - [ ] Extend `kano-frontend/src/stores/polls.ts` (scaffolded in Story 3.6):
    ```ts
    async loadAllPolls(): Promise<void> {
      this.isLoading = true;
      try {
        const polls = await api.get<PollSummaryWithProject[]>('/polls');
        this.items = polls;
      } finally {
        this.isLoading = false;
      }
    }
    ```
- [ ] `src/routes/app/Polls.vue` (AC: #2, #3, #4, #6, #7)
  - [ ] On mount: `pollsStore.loadAllPolls()`
  - [ ] Top-level conditional: `v-if="pollsStore.items.length === 0 && !pollsStore.isLoading"` → empty state card (below); else → table
  - [ ] Empty state card (AC: #7):
    ```vue
    <v-card class="pa-8 text-center">
      <v-card-title>{{ copy('pm.polls.empty.title') }}</v-card-title>
      <v-card-text>{{ copy('pm.polls.empty.body') }}</v-card-text>
      <v-card-actions class="justify-center">
        <v-btn color="primary" size="large" :to="{ name: 'projects' }">
          {{ copy('pm.polls.empty.cta') }}
        </v-btn>
      </v-card-actions>
    </v-card>
    ```
  - [ ] Populated state table:
    ```vue
    <v-data-table
      :headers="headers"
      :items="pollsStore.items"
      :loading="pollsStore.isLoading"
      :sort-by="[{ key: 'created_at', order: 'desc' }]"
      density="compact"
      @click:row="onRowClick"
      :row-props="rowClassProps"
    >
      <template #item.project_name="{ item }">
        <router-link :to="{ name: 'project-detail', params: { id: item.project_id } }" @click.stop>
          {{ item.project_name }}
        </router-link>
      </template>
      <template #item.epoch="{ item }">
        <v-chip size="small" variant="flat">{{ copy('common.version', { n: item.epoch }) }}</v-chip>
      </template>
      <template #item.expires_in="{ item }">
        <span v-if="item.is_expired" class="text-error">{{ copy('pm.polls.expired') }}</span>
        <span v-else>{{ formatCountdown(item.expires_at) }}</span>
      </template>
    </v-data-table>
    ```
  - [ ] `rowClassProps = ({ item }) => item.is_expired ? { class: 'text-medium-emphasis' } : {}` — muted style for expired rows
  - [ ] `headers`:
    ```ts
    [
      { title: copy('pm.polls.columns.project'), key: 'project_name', sortable: true },
      { title: copy('pm.polls.columns.version'), key: 'epoch', sortable: false },
      { title: copy('pm.polls.columns.responses'), key: 'response_count', sortable: true, align: 'end' },
      { title: copy('pm.polls.columns.expiresIn'), key: 'expires_in', sortable: false },
      { title: copy('pm.polls.columns.created'), key: 'created_at', sortable: true },
    ]
    ```
  - [ ] `onRowClick(_event, { item })`:
    ```ts
    const routeName = item.is_expired ? 'poll-analysis' : 'poll-share';
    router.push({ name: routeName, params: { id: item.project_id, pollId: item.id } });
    ```
  - [ ] `formatCountdown(expiresAt: string): string` — local helper (not a store concern). Returns "3 days", "5 hours", "15 min" depending on `expires_at - now`. If `< 1 min`: "expiring now". If past: caller filters via `is_expired`, so this helper never sees negatives in practice. Copy-deck entries: `pm.polls.countdown.days`, `hours`, `minutes` with interpolation.
- [ ] `src/routes/app/AnalysisPlaceholder.vue` (AC: #5)
  - [ ] Minimal card: `<v-card><v-card-text>{{ copy('pm.polls.analysisPlaceholder') }}</v-card-text></v-card>`
  - [ ] This file is intentionally thin; Epic 5 Story 5.5 replaces it with the real analysis composition at the same route
- [ ] Copy deck additions (AC: #9)
  - [ ] `kano-frontend/src/copy/en.ts`:
    - `pm.polls.title` — "Polls"
    - `pm.polls.columns.project` — "Project"
    - `pm.polls.columns.version` — "Version"
    - `pm.polls.columns.responses` — "Responses"
    - `pm.polls.columns.expiresIn` — "Expires in"
    - `pm.polls.columns.created` — "Created"
    - `pm.polls.expired` — "Expired"
    - `pm.polls.countdown.days` — "{n, plural, one {# day} other {# days}}"
    - `pm.polls.countdown.hours` — "{n, plural, one {# hour} other {# hours}}"
    - `pm.polls.countdown.minutes` — "{n, plural, one {# min} other {# min}}"
    - `pm.polls.countdown.expiringNow` — "expiring now"
    - `pm.polls.empty.title` — "No polls yet"
    - `pm.polls.empty.body` — "Create a project, add features, and generate your first poll URL."
    - `pm.polls.empty.cta` — "Create your first project"
    - `pm.polls.analysisPlaceholder` — "Analysis view ships in Epic 5 — for now, the expired poll's responses are preserved in the database."
  - [ ] Verify `common.version` key already exists (Story 1.7 / 2.9); reuse it here
- [ ] Vitest specs (AC: #10)
  - [ ] `kano-frontend/src/routes/app/Polls.spec.ts`:
    - Mounts with empty `pollsStore.items` and `isLoading=false` → empty state card visible; CTA navigates to `projects`
    - Mounts with seeded items (mix of expired and live) → table renders N rows; expired rows have muted class; Version column shows "Version 3" for `epoch=3`
    - Row click on non-expired → router.push called with `{name: 'poll-share'}`
    - Row click on expired → router.push called with `{name: 'poll-analysis'}`
    - Project-name link in the cell: `@click.stop` prevents the row-click from firing alongside it; assert only the project-detail navigation occurs when clicking the link itself
- [ ] Playwright E2E (AC: #10, supplementary)
  - [ ] `kano-frontend/e2e/pm/polls-home.spec.ts`:
    - Navigate to `/` → assert URL ends at `/app/polls`
    - On empty DB → assert "Create your first project" CTA is visible; click it; assert lands on `/app/projects`
    - Seed via API: 2 projects, 2 polls (one expired by writing `expires_at` in the past through a test-only fixture); reload `/app/polls` → assert 2 rows, one with "Expired"
    - Click the non-expired row → assert URL matches `/app/projects/.+/polls/.+/share`
    - axe-core: zero violations on the polls view with populated data

## Dev Notes

### Why `/app/polls` is the PM home

Epic 3's intro (epics.md line 868) and UX spec's Critical Success Moment framing put "what's alive" at the top of the PM mental model: the first thing Paola wants to see on opening the app is whether customers are responding. That's the polls list, not the projects list. Projects are the path to creating polls; polls are the focus of attention.

This also sets the pattern that `/app/` is polls-first; projects are reachable via the sidebar and via project-name links in the table. Navigation hierarchy:
- Polls (home) — what's alive
- Projects — what I own
- (Epic 5) Analysis — what happened

### Why no filters / search in v1

Epics.md line 997 + Post-MVP list explicitly exclude filter chrome. PRD line 337 expects ~3 polls per quarter; the table will have <10 rows in realistic use for the foreseeable future. Filters add pagination, URL state, and empty-filter-state copy for a problem Paola doesn't have.

### Row-click pattern + project-link `@click.stop`

`v-data-table` emits `click:row` on any row click. The project-name cell wraps its text in a `<router-link>` which would itself route the PM elsewhere — without `@click.stop`, both the link navigation AND the row-click navigation fire, causing a race and a wrong final URL. `@click.stop` on the link is the Vuetify-recommended pattern for this case.

### Expired → analysis placeholder, live → share panel

The UX spec Flow 3 (analysis scan, line 706) imagines clicking an expired poll into its analysis. Epic 5 implements that view. For E3, the route exists as a placeholder so clicking an expired poll doesn't 404 or strand the PM. The placeholder copy honestly says "ships in Epic 5" — transparent, no fake "coming soon."

### Store-mediated data

Polls.vue calls `pollsStore.loadAllPolls()` on mount; it never `fetch`es `/polls` directly. Same rule as Story 2.9 (projects). Response counts come from the server per Story 3.3 AC #6 — no per-row client aggregation.

### Countdown formatter scope

Keep `formatCountdown` inline in `Polls.vue` (or next to it as a `src/utils/countdown.ts` if reused). Don't over-engineer this. If a future epic (e.g., E7's launch readiness) adds a second countdown display, refactor then. Three similar lines beat premature abstraction.

Pluralization via ICU MessageFormat syntax (`{n, plural, one {...} other {...}}`) is Vue i18n-style and matches Story 1.7's copy-deck patterns. If the copy-deck module doesn't yet support ICU plurals, interpolate `{n}` and use simple "1 day / N days" branching in the component; don't block this story on adding plural support to useCopy.

### Not in scope

- Analysis rendering — Epic 5.
- Soft-delete or archive polls — Post-MVP per PRD line 135.
- Real-time response-count updates — explicitly not in v1 (PRD Architecture Considerations: request/response only).
- Filtering by project / status — Post-MVP.

### Project Structure Notes

Files:
- `kano-frontend/src/routes/app/Polls.vue` (new)
- `kano-frontend/src/routes/app/Polls.spec.ts` (new)
- `kano-frontend/src/routes/app/AnalysisPlaceholder.vue` (new; replaced in Story 5.5)
- Extend `kano-frontend/src/stores/polls.ts` (add `loadAllPolls`)
- Extend `kano-frontend/src/router.ts` (add `polls`, `poll-analysis` routes + `/` + `/app` redirects)
- Extend `kano-frontend/src/copy/en.ts`
- `kano-frontend/e2e/pm/polls-home.spec.ts` (new)

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#User Journey Flows] — Flow 3 analysis scan starts from the home poll list (line 712–714)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component Strategy] — `v-data-table` for poll list (line 804)
- [Source: _bmad-output/planning-artifacts/prd.md#FR18] — PM views list of polls
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — route map (line 386–392), per-domain Pinia stores
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.7] — original AC
- [Source: _bmad-output/implementation-artifacts/2-9-pm-projects-list-and-project-detail-vue-routes.md] — `v-data-table` precedent, store-mediated pattern, inline-first empty state
- [Source: _bmad-output/implementation-artifacts/3-3-poll-list-endpoints-per-project-and-cross-project.md] — `GET /api/v1/polls` contract
- [Source: _bmad-output/implementation-artifacts/3-6-generate-poll-ui-flow-from-project-detail.md] — `poll-share` route reused for non-expired row click; `pollsStore` scaffold

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
