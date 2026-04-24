# Story 3.6: Generate-poll UI flow from project detail

Status: ready-for-dev

## Story

As a PM,
I want a "Generate poll URL" primary action on `/app/projects/:id` that calls the create-poll endpoint and then navigates me to the share panel,
so that my authoring flow ends at a shareable URL with zero friction.

## Acceptance Criteria

1. **Given** I'm on `/app/projects/:id` for a project with **at least one active feature** on its current epoch, **when** the page renders, **then** a primary "Generate poll URL" button is visible and enabled in the project detail header (below the inline-editable name/version, above `<FeatureListEditor>`).
2. **When** I click the button, **then** the SPA calls `POST /api/v1/projects/:id/polls` via the `pollsStore.createPoll(projectId)` action.
3. **On 201 success**, the SPA navigates to `/app/projects/:id/polls/:pollId/share` which mounts `<PollSharePanel :poll="poll" />` with the newly created `PollSummary`; the new poll is pushed into the `pollsStore.items` cache so a subsequent `/app/polls` visit shows it immediately (no refetch needed).
4. **On 422 `poll-requires-features`** (empty active feature set — race condition with a concurrent delete), the SPA displays an inline `v-alert type="warning"` at the top of the project detail page with the copy-deck text `pm.projects.detail.generatePoll.noFeatures` ("Add at least one feature before generating a poll"); the page does NOT navigate.
5. **Given** I'm on `/app/projects/:id` for a project with **zero active features** on the current epoch, **when** the page renders, **then** the "Generate poll URL" button is visible but **disabled**; a tooltip from copy-deck `pm.projects.detail.generatePoll.disabledTooltip` ("Add at least one feature first") appears on hover/focus.
6. All user-visible strings are sourced from the copy deck.
7. **Given** the button click triggers a network request, **when** the request is in flight, **then** the button shows a loading state (`<v-btn loading>`) and is unclickable; the page remains otherwise interactive.
8. An E2E Playwright test covers the happy path: fresh project with no features → add one feature via `<FeatureListEditor>` → click "Generate poll URL" → assert landing on the share panel route with the URL and QR both visible and the URL matches the poll's UUID.

## Tasks / Subtasks

- [ ] Pinia `pollsStore` (AC: #2, #3)
  - [ ] `kano-frontend/src/stores/polls.ts` — `useProjectsStore` pattern mirrored from Story 2.9's `projectsStore`
  - [ ] State: `{ items: PollSummaryWithProject[], currentPoll: PollSummary | null, isLoading: boolean }`
  - [ ] Actions:
    - `async createPoll(projectId: string): Promise<PollSummary>` — calls `api.post('/projects/:id/polls', {}, { pathParams: { id: projectId } })`; on success, sets `currentPoll` and prepends to `items`; returns the summary. On typed `ValidationError` (422 `poll-requires-features`), re-throws a typed `PollRequiresFeaturesError` so the component can render AC #4's inline alert.
    - (Pre-wired for Story 3.7) `async loadAllPolls()` and `async loadPollsForProject(projectId)` — stubbed in this story as `async () => { ... }` calls that hit `/polls` and `/projects/:id/polls` respectively; full wire-up can remain in Story 3.7 if desired, but types and action signatures MUST land here to avoid churn.
  - [ ] Error typing: extend `kano-frontend/src/api/errors.ts` (from Story 1.3's typed error layer) with a `PollRequiresFeaturesError extends ValidationError` variant selected by `problem.type === '.../poll-requires-features'`
- [ ] Router additions (AC: #3)
  - [ ] `kano-frontend/src/router.ts` — register:
    ```ts
    {
      path: '/app/projects/:id/polls/:pollId/share',
      name: 'poll-share',
      component: () => import('./routes/app/PollShare.vue'),
      meta: { layout: 'pm' },
    }
    ```
- [ ] `src/routes/app/PollShare.vue` (AC: #3)
  - [ ] On mount: `const pollId = route.params.pollId; const poll = pollsStore.currentPoll ?? await pollsStore.loadPoll(pollId);` — if the PM refreshes the share page (lost store state), fetch the poll via a new `pollsStore.loadPoll(pollId)` action that calls a per-poll GET; the simplest correct thing is to extend the share view to accept navigation from either the `createPoll` path (cache hit) or a deep-link refresh (store miss). For v1 minimum, if the store is empty on mount, redirect to `/app/projects/:id` and let the PM click "Generate" again — document this edge in the component file comment. Proper deep-link support can land in a follow-up; it's not an Epic 3 AC.
  - [ ] Template: `<PollSharePanel :poll="poll" v-if="poll" />`; back link: `<v-btn variant="text" @click="router.back()">Back to project</v-btn>` with copy-deck text
- [ ] `src/routes/app/ProjectDetail.vue` — wire the Generate button (AC: #1, #2, #4, #5, #7)
  - [ ] In the detail header (between name/version editor and `<FeatureListEditor>`), add:
    ```vue
    <v-btn
      color="primary"
      size="large"
      :disabled="activeFeatureCount === 0"
      :loading="generating"
      @click="onGenerate"
      :aria-label="copy('pm.projects.detail.generatePoll.button')"
    >
      <v-icon start>mdi-link-plus</v-icon>
      {{ copy('pm.projects.detail.generatePoll.button') }}
    </v-btn>
    <v-tooltip
      v-if="activeFeatureCount === 0"
      activator="parent"
      :text="copy('pm.projects.detail.generatePoll.disabledTooltip')"
    />
    ```
  - [ ] `const activeFeatureCount = computed(() => projectsStore.current?.active_features?.length ?? 0)`
  - [ ] `async function onGenerate()`:
    ```ts
    generating.value = true;
    try {
      const poll = await pollsStore.createPoll(projectId.value);
      await router.push({ name: 'poll-share', params: { id: projectId.value, pollId: poll.id } });
    } catch (err) {
      if (err instanceof PollRequiresFeaturesError) {
        noFeaturesAlert.value = true;
      } else {
        throw err; // global error toast from useApi catches unexpected cases
      }
    } finally {
      generating.value = false;
    }
    ```
  - [ ] Above the feature editor, conditionally render:
    ```vue
    <v-alert
      v-if="noFeaturesAlert"
      type="warning"
      closable
      @click:close="noFeaturesAlert = false"
    >
      {{ copy('pm.projects.detail.generatePoll.noFeatures') }}
    </v-alert>
    ```
- [ ] Copy deck additions (AC: #6)
  - [ ] `kano-frontend/src/copy/en.ts` — `pm.projects.detail.generatePoll.*`:
    - `button` — "Generate poll URL"
    - `disabledTooltip` — "Add at least one feature first"
    - `noFeatures` — "Add at least one feature before generating a poll"
    - `backToProject` — "Back to project"
- [ ] Vitest specs
  - [ ] `kano-frontend/src/stores/polls.spec.ts` — `createPoll` happy path (mocks `useApi`, asserts store state updated, returns `PollSummary`); `createPoll` on 422 throws `PollRequiresFeaturesError`
  - [ ] `kano-frontend/src/routes/app/ProjectDetail.spec.ts` — extend existing spec with: button disabled when features.length === 0, tooltip visible; button enabled with features; clicking calls `pollsStore.createPoll`; router.push called with correct route; 422 path shows warning alert
  - [ ] `kano-frontend/src/routes/app/PollShare.spec.ts` — mounts `<PollSharePanel>` when `pollsStore.currentPoll` is set; redirects to project detail when store is empty (store-miss branch)
- [ ] Playwright E2E (AC: #8)
  - [ ] `kano-frontend/e2e/pm/generate-poll.spec.ts`:
    - Seed DB with an empty project (or use API to create one at the start of the test)
    - Navigate to `/app/projects/:id`
    - Type a feature name into `<FeatureListEditor>`; Enter to commit
    - Assert "Generate poll URL" button becomes enabled
    - Click it; assert URL changes to `/app/projects/*/polls/*/share`
    - Assert `<PollSharePanel>` is mounted with a URL field whose value matches `/^https?:\/\/.+\/poll\/[0-9a-f-]{36}$/`
    - Assert the QR image is visible (`aria-hidden="true"` so query by `img` not role)
    - Assert axe-core: zero violations on the share view

## Dev Notes

### Store-mediated data access (enforced)

Architecture §Frontend Component Boundaries (referenced in Story 2.9 Dev Notes line 55) forbids components from calling `useApi()` directly outside of stores. `ProjectDetail.vue` calls `pollsStore.createPoll(projectId)`; it never calls `api.post('/polls')` directly. Same rule for `PollShare.vue`.

### Optimistic cache push

On a successful `createPoll`, prepending to `pollsStore.items` keeps the PM's "what's alive" view (Story 3.7) in sync with zero latency. If the PM pilots the flow (generate → navigate to `/app/polls`), the new poll is at the top of the list without a round trip. Cost: a stale `response_count` value (0) if another client submits between create and view — acceptable staleness; a page refresh reconciles.

### The `noFeatures` 422 is a race-condition defensive

AC #5 already covers the common case (button disabled when features.length === 0). AC #4 handles the race where between button click and server processing, a concurrent delete-last-feature flight removed all features. In practice rare — Paola is solo on her own projects — but the typed error path is cheap and prevents a confusing generic error toast.

### Share route is not deep-link-first

The share route's simplest correct behavior is "navigate here from `createPoll`, otherwise redirect back". A proper deep-link implementation requires Story 3.3's `GET /api/v1/polls/:uuid` — wait, that's the public respondent read (Story 3.4) which doesn't include PM fields like `response_count`. To deep-link the share panel, we'd need a PM-facing per-poll GET endpoint, which isn't in Epic 3. So: don't over-engineer; the redirect-to-project fallback is the v1 behavior. If Paola bookmarks the share URL, she clicks back into the flow from the project — not a hardship for the three-polls-a-quarter PRD cadence.

Adding a `GET /api/v1/polls/:pollId` PM endpoint (not to be confused with the public respondent read) can land in Epic 5 if needed when analysis wants per-poll metadata.

### Button placement in the detail header

The detail header real estate is finite. Order top-to-bottom: inline-editable project name, inline-editable version + epoch badge, "Generate poll URL" primary button, then the feature-list editor. Rationale: the Generate action is the PM's goal (the "click this when you're done" button); keeping it above the editor means Paola sees it every time she's done authoring, not buried below a long feature list.

UX spec Flow 1 (line 664) confirms: "More? No → Click 'Generate poll URL'" — the button is the terminal action of the authoring phase.

### Loading state UX

`<v-btn loading>` shows a spinner and disables clicks. The request is fast (one DB insert + a project-feature-count query); ~150 ms p50 in dev. Still, Paola's laptop on hotel WiFi could push this to 2 s. The loading affordance prevents double-click double-create. The button text/icon stay visible so Paola doesn't lose visual context.

### Not in scope

- The PM polls list (`/app/polls`) — Story 3.7.
- Respondent landing/preview (QR target) — Story 3.8.
- Per-poll analysis route — Story 5.5.
- Regenerate / extend-TTL actions on a poll — Post-MVP per PRD line 135.

### Project Structure Notes

Files:
- `kano-frontend/src/stores/polls.ts` (new)
- `kano-frontend/src/stores/polls.spec.ts` (new)
- `kano-frontend/src/routes/app/PollShare.vue` (new)
- `kano-frontend/src/routes/app/PollShare.spec.ts` (new)
- Extend `kano-frontend/src/routes/app/ProjectDetail.vue` (Generate button + alert wiring)
- Extend `kano-frontend/src/routes/app/ProjectDetail.spec.ts`
- Extend `kano-frontend/src/router.ts` (poll-share route)
- Extend `kano-frontend/src/api/errors.ts` (`PollRequiresFeaturesError`)
- Extend `kano-frontend/src/api/types.ts` (`PollSummary`, `PollSummaryWithProject`)
- Extend `kano-frontend/src/copy/en.ts` (`pm.projects.detail.generatePoll.*`)
- `kano-frontend/e2e/pm/generate-poll.spec.ts` (new)

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#User Journey Flows] — Flow 1 authoring (line 647–674), terminal "Generate poll URL" click
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Critical Success Moments] — Critical Success Moment 2 (authoring → share panel)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX Consistency Patterns] — primary button + tooltip conventions
- [Source: _bmad-output/planning-artifacts/prd.md#FR13] — poll generation pinned to current epoch
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — Pinia per-domain stores (`pollsStore`)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.6] — original AC
- [Source: _bmad-output/implementation-artifacts/2-9-pm-projects-list-and-project-detail-vue-routes.md] — store-mediated precedent; ProjectDetail.vue structure
- [Source: _bmad-output/implementation-artifacts/2-10-featurelisteditor-inline-first-authoring-component.md] — sits above the Generate button visually; `active_features` on `projectsStore.current`
- [Source: _bmad-output/implementation-artifacts/3-2-create-poll-endpoint-pinned-to-current-epoch-with-7-day-ttl.md] — POST contract + 422 type URI
- [Source: _bmad-output/implementation-artifacts/3-5-pollsharepanel-component-with-url-qr-preview-and-one-click-copy.md] — share panel consumed here

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
