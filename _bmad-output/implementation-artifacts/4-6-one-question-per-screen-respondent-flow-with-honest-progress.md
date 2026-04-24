# Story 4.6: One-question-per-screen respondent flow with honest progress

Status: ready-for-dev

## Story

As Marcus,
I want to answer one question per screen with a progress bar, tap-back navigation, and a halfway acknowledgement that feels honest and sparing,
so that the 16-question sequence feels like one continuous experience rather than a bureaucratic form.

## Acceptance Criteria

1. **Given** a poll with N features (2N questions total), **when** the `/poll/:uuid/q/:index` route renders (with `:index` an integer from 0 to 2N-1), **then** exactly one `<KanoLikert>` is visible at a time showing either the functional (`:index % 2 === 0`) or dysfunctional (`:index % 2 === 1`) question for the feature at `features[Math.floor(index / 2)]` per FR21.
2. A `v-progress-linear` bar at the top of the route renders true fraction — e.g., "Question 9 of 16" text above the bar and `:model-value="(index + 1) / (2 * N) * 100"` for the fill (FR23 + UX-spec §Flow Optimization Principle 7 honest-progress).
3. **Tap/keyboard auto-advance** via KanoLikert's `@auto-advance` event routes to `/poll/:uuid/q/:index+1` using `router.push` — client-side routing, no full-page reload, no `window.location.href`.
4. **Tap-back navigation**: browser Back button, Esc, or Backspace navigates to `/poll/:uuid/q/:index-1`; previously-selected answer remains selected (editable) per FR24 reversible-before-commit. At `:index=0`, Back navigates to `/poll/:uuid` (landing).
5. **Halfway microcopy**: at the exact halfway point (`:index === N`, i.e., the first dysfunctional question for feature N), a one-line acknowledgement `copy('respondent.flow.halfway')` renders above the progress bar with `role="status"` (non-interrupting live region) and remains visible for exactly this one question, then disappears. `prefers-reduced-motion: reduce` skips any fade animation.
6. **Answer draft** is held in a Pinia store `useResponseDraftStore` (NOT `sessionStorage`, NOT `localStorage`) with state `answers: Map<feature_key, { fq_answer: number | null, dq_answer: number | null }>`. Closing the tab silently discards the draft per FR25; there is no "resume where you left off" prompt in v1.
7. `pollPublicStore` (Story 4.4) is the single source of truth for the poll + feature list — no duplicate fetching. If the user navigates directly to `/poll/:uuid/q/3` (e.g., browser refresh mid-flow), the Question route triggers `pollPublicStore.loadPoll(uuid)` if `fetchState !== 'loaded'` before rendering. During load, the component shows a `v-progress-circular` spinner, not blank. On 410/404/error, the component delegates to the existing `ExpiredPoll`/`PollNotFound`/`LandingError` views (reuse from Stories 3.8 / 4.4) — does not reinvent the error surfaces.
8. **Index out-of-range guard**: if `:index >= 2 * N` or `:index < 0`, the route immediately redirects to `/poll/:uuid` (landing); if the draft already has every feature answered for both questions, the redirect target is `/poll/:uuid/submit-confirm` (Story 4.7 route — placeholder route exists from this story; Story 4.7 replaces the placeholder).
9. **Mid-flow network failure on route transition** (e.g., the user hits refresh and `loadPoll` fails): the route renders an inline `v-alert` with `error` variant — "Something went wrong — please retry" (copy-deck) + Retry button; no data is lost (the draft in the Pinia store is preserved; only the poll metadata failed).
10. **Feature description** (optional, per `PollPublic.features[].description`) renders below the question text in smaller body copy if present; absent description renders no element (not an empty div). Description is not part of the `<KanoLikert>` component — this story composes it above/below KanoLikert.
11. A Vitest spec for `Question.vue` covers: rendering a specific `:index`, auto-advance → router.push, Back → previous index / landing at index 0, halfway microcopy at `index === N` only, error state, out-of-range redirect, and draft persistence across index changes (answer at index 2 remains when navigating to index 3 and back).

## Tasks / Subtasks

- [ ] Delete Story 4.4's placeholder (AC: #1)
  - [ ] Replace `kano-frontend/src/routes/poll/Question.vue` — the 10-line placeholder from Story 4.4 is wholesale replaced by the real component. The file path stays the same so the router entry doesn't change.
- [ ] `src/stores/responseDraft.ts` — new Pinia store (AC: #6)
  - [ ] Store id: `responseDraft`
  - [ ] State:
    ```ts
    const answers = ref<Map<string, { fq_answer: number | null, dq_answer: number | null }>>(new Map())
    const activePollId = ref<string | null>(null)
    ```
  - [ ] Actions:
    ```ts
    function initForPoll(uuid: string, featureKeys: string[]): void {
      if (activePollId.value !== uuid) {
        answers.value = new Map(featureKeys.map(k => [k, { fq_answer: null, dq_answer: null }]))
        activePollId.value = uuid
      }
    }
    function setAnswer(featureKey: string, question: 'functional' | 'dysfunctional', value: number): void
    function getAnswer(featureKey: string, question: 'functional' | 'dysfunctional'): number | null
    function reset(): void  // clear on Thank You or poll-id change
    ```
  - [ ] Getters: `isComplete` (every entry has both `fq_answer` and `dq_answer` non-null), `answeredCount` (for progress parity — but the progress bar uses route-index, not answered count, per AC #2's honest-progress rule), `firstMissing(featureKeys): { featureKey, question } | null` (used by Story 4.7's guard)
  - [ ] **In-memory only**: no `persist: true`, no localStorage, no sessionStorage. Architecture §Frontend Architecture line 382 explicitly names this: "responseDraftStore (respondent-side, in-memory only per FR25 silent-discard)."
- [ ] `src/routes/poll/Question.vue` — real component (AC: #1, #2, #3, #4, #5, #7, #9, #10)
  - [ ] Props via router: `uuid`, `index` (from `:index(\\d+)` regex route)
  - [ ] Computed from `pollPublicStore.poll`:
    - `features = poll.features`
    - `featureCount N = features.length`
    - `totalQuestions = 2 * N`
    - `feature = features[Math.floor(index / 2)]`
    - `question: 'functional' | 'dysfunctional' = index % 2 === 0 ? 'functional' : 'dysfunctional'`
    - `isHalfway = index === N`
    - `progressFraction = (index + 1) / totalQuestions` (1-based denominator for "Question 9 of 16" display)
  - [ ] Template skeleton:
    ```vue
    <template>
      <v-progress-circular v-if="loading" indeterminate :aria-label="copy('respondent.common.loading')" />
      <LandingError v-else-if="fetchState === 'error'" @retry="reload" />
      <ExpiredPoll v-else-if="fetchState === 'expired'" />
      <PollNotFound v-else-if="fetchState === 'not-found'" />
      <section v-else class="question-screen">
        <p v-if="isHalfway" role="status" class="halfway">{{ copy('respondent.flow.halfway') }}</p>
        <p class="progress-label">
          {{ copy('respondent.flow.progressLabel', { current: index + 1, total: totalQuestions }) }}
        </p>
        <v-progress-linear
          :model-value="progressFraction * 100"
          :aria-valuenow="index + 1"
          :aria-valuemin="1"
          :aria-valuemax="totalQuestions"
          aria-label="Progress"
          color="primary"
        />
        <p v-if="feature.description" class="feature-description">{{ feature.description }}</p>
        <KanoLikert
          :question="question"
          :feature="feature"
          :model-value="currentAnswer"
          @update:model-value="onSelect"
          @auto-advance="onAutoAdvance"
        />
      </section>
    </template>
    ```
  - [ ] `currentAnswer`: computed getter that reads the draft store entry for `(feature.feature_key, question)` → returns the stored number or null (pre-selects the answer on back-nav per AC #4)
  - [ ] `onSelect(v)`: `responseDraftStore.setAnswer(feature.feature_key, question, v)`
  - [ ] `onAutoAdvance(v)`: after the update, `router.push({ name: 'poll-question', params: { uuid, index: index + 1 } })`; if `index + 1 >= totalQuestions`, `router.push({ name: 'poll-submit-confirm', params: { uuid } })`
  - [ ] `onMounted`: if `pollPublicStore.fetchState !== 'loaded'`, call `loadPoll(uuid)`; once loaded, call `responseDraftStore.initForPoll(uuid, poll.features.map(f => f.feature_key))`
  - [ ] Out-of-range guard in `onMounted` + `watch(() => props.index)`:
    ```ts
    if (index < 0 || index >= totalQuestions) {
      router.replace({ name: responseDraftStore.isComplete ? 'poll-submit-confirm' : 'poll-landing', params: { uuid } })
    }
    ```
- [ ] Back / Esc / Backspace navigation (AC: #4)
  - [ ] `onKeydown` handler on the `<section>` root (not window):
    ```ts
    if (['Escape', 'Backspace'].includes(e.key)) {
      e.preventDefault()
      goBack()
    }
    ```
  - [ ] `goBack`: `router.push({ name: index === 0 ? 'poll-landing' : 'poll-question', params: { uuid, index: index - 1 } })`
  - [ ] Browser Back button: honored automatically by `router.push` history stack (Vue Router default). No code needed unless tests reveal a regression.
  - [ ] Answer preservation on back-nav: handled automatically because `currentAnswer` reads from the persistent draft store
- [ ] Halfway microcopy (AC: #5)
  - [ ] Render only when `isHalfway=true`; plain `<p>` with `role="status"`
  - [ ] `role="status"` is an ARIA live region of polite politeness — SRs announce without interrupting current speech
  - [ ] `aria-atomic="true"` so the whole line is re-announced if it updates (defensive; element shouldn't update in practice)
  - [ ] CSS: no animated fade-in unless `prefers-reduced-motion: no-preference` — use `useReducedMotion` from Story 4.5 (or inline the matchMedia check). Default transition: 300 ms opacity fade-in; reduced-motion skips.
  - [ ] Exits automatically on route change (the `:index` param changes, the `v-if` unmounts the element)
- [ ] Submit-confirm placeholder route (AC: #8)
  - [ ] Register in `src/router.ts`: `{ path: '/poll/:uuid/submit-confirm', name: 'poll-submit-confirm', component: () => import('./routes/poll/SubmitConfirm.vue'), meta: { layout: 'respondent' } }`
  - [ ] Add **temporary placeholder** `src/routes/poll/SubmitConfirm.vue`: `<template><p>TODO Story 4.7</p></template>` — same pattern Story 4.4 used for `Question.vue`. Story 4.7 replaces wholesale.
  - [ ] Also register `/poll/:uuid/thanks` with placeholder `Thanks.vue`? **No** — Story 4.7 owns thanks. This story only needs `submit-confirm` as the auto-advance landing after the last question.
- [ ] Copy deck additions — `src/copy/en.ts` (AC: #2, #5, #9)
  - [ ] `respondent.flow.progressLabel` — takes `{current, total}` interpolation: "Question {current} of {total}"
  - [ ] `respondent.flow.halfway` — "Halfway there — this is genuinely helpful" (exact wording per epics line 1151)
  - [ ] `respondent.common.loading` — "Loading…"
  - [ ] `respondent.flow.error.title` — "Something went wrong"
  - [ ] `respondent.flow.error.body` — "Please retry" (reuse `respondent.landing.error.*` from Story 4.4 if the wording matches; otherwise add separate keys)
  - [ ] `respondent.flow.error.retryCta` — "Retry"
- [ ] Vitest spec: `src/routes/poll/Question.spec.ts` (AC: #11)
  - [ ] Seed `pollPublicStore` with a 3-feature poll (6 questions)
  - [ ] Mount with `index=0` → asserts KanoLikert visible with `question='functional'` and feature[0]
  - [ ] Mount with `index=1` → asserts `question='dysfunctional'` and feature[0]
  - [ ] Mount with `index=2` → asserts feature[1], `question='functional'`
  - [ ] Mount with `index=3` (N=3, halfway) → asserts `.halfway` element present with role="status"
  - [ ] Mount with `index=0` → auto-advance `(3)` → asserts `router.push` called with `index: 1`
  - [ ] Mount with `index=5` (lastIndex for 6Q) → auto-advance → asserts `router.push` called with `name: 'poll-submit-confirm'`
  - [ ] Mount with `index=0` → simulate Esc → asserts `router.push` called with `name: 'poll-landing'`
  - [ ] Mount with `index=3` → simulate Esc → asserts `router.push` called with `index: 2`
  - [ ] Mount with `index=99` (out of range) → asserts `router.replace` called with landing
  - [ ] Back-nav answer preservation: set answer at `index=2` via store, mount `index=3`, back-nav to `index=2` → asserts KanoLikert's `:model-value` matches the stored value
- [ ] `src/stores/responseDraft.spec.ts`
  - [ ] `initForPoll(uuid, keys)` seeds the Map with null-answer entries for each key
  - [ ] `setAnswer(key, 'functional', 3)` updates; `getAnswer(key, 'functional')` returns 3
  - [ ] `isComplete` is false until every entry has both answers
  - [ ] `firstMissing` returns the earliest (by features order) missing `(key, question)` pair
  - [ ] Switching `activePollId` via `initForPoll(newUuid, ...)` clears the prior draft
  - [ ] `reset()` clears the Map and `activePollId`
- [ ] Playwright E2E (integration with Story 4.4's `landing.spec.ts` — or a new file `e2e/respondent/flow.spec.ts`)
  - [ ] Navigate to `/poll/<uuid>` → click Begin → asserts `/poll/<uuid>/q/0` rendered with the functional question for feature[0]
  - [ ] Press `3` → asserts URL `/q/1` with the dysfunctional question for feature[0]
  - [ ] Press `2` → asserts URL `/q/2` with the functional question for feature[1]
  - [ ] At `index=N` (halfway), asserts halfway microcopy visible
  - [ ] Press Esc → asserts URL went back one index
  - [ ] Refresh browser at `/q/3` → asserts poll reloads, answers persisted — **IMPORTANT**: this test SHOULD FAIL intentionally given the in-memory draft design. Instead, the test asserts that after refresh, the route renders at `/q/3` but all answers are back to null (draft was discarded on the hard refresh because Pinia state is purged). Document this as the FR25 silent-discard contract.

## Dev Notes

### Honest-progress rule, not optimistic

UX-spec §Flow Optimization Principle 7 line 781: "Progress bars show true fraction; response counts show literal '5 of 12.' No 'just getting started' language, no faked progress."

Fraction: `(index + 1) / (2 * N)`. Text: "Question 9 of 16." When `index=0`, that reads "Question 1 of 16" — the first question is 1, not 0 or "just getting started." Don't sugar-coat.

Bar fill at 100% happens when the user auto-advances off the last question into `/submit-confirm`; the last rendered question shows `(2N) / (2N) = 100%` fill.

### Halfway microcopy — sparing by design

Epics line 1151: "at the question index representing the halfway point (index = N, half of 2N), a one-line microcopy acknowledgement is shown above the progress bar (copy-deck sourced: 'Halfway there — this is genuinely helpful'), visible for one question then dismissed."

Exactly one question worth of visibility. No "encouragement at 25%", no "nearly done at 75%". The one halfway acknowledgement is deliberately sparing — the UX spec §Desired Emotional Response and the "Respect the time given" principle both argue for quiet respect, not cheerleading.

The em-dash in "there — this" is a real em-dash (U+2014), not a double hyphen. Copy deck should carry the em-dash literally.

### `role="status"`, not `aria-live="assertive"`

`role="status"` maps to `aria-live="polite"` — announces when the SR is idle; does not interrupt. The halfway text is supportive, not critical. Using `assertive` would steal focus from whatever the SR is currently reading (e.g., a KanoLikert option label) and feel rude.

### Why a Pinia store for the draft (not `useResponseDraft` composable)

Epics line 1152 and architecture line 382 both refer to "useResponseDraft()" — originally scoped as a composable. We elevate to a Pinia store for two reasons:
1. Pinia stores survive component unmount/mount during route transitions; a `ref` inside a `useResponseDraft` composable would re-initialize on each Question.vue mount unless carefully module-level-hoisted (and module-level mutable state is a testing anti-pattern Pinia solves).
2. Story 4.7's submit-confirm page needs access to the draft to check completeness and serialize the POST body — a store is the idiomatic cross-route state vehicle.

Call the file `responseDraft.ts` and the store id `responseDraft`; the PRD/architecture "useResponseDraft" naming is aspirational — we're implementing the substance, not the name.

### Out-of-range guard exists to defuse deep-link footguns

A respondent might refresh on `/poll/<uuid>/q/3` after the tab sat idle for a week — by which point the poll might be expired, or they cleared cookies and lost the draft, or the URL was manually typed with a wrong index. The guard handles all three:
- Poll expired → `pollPublicStore.loadPoll` sets `fetchState='expired'` → ExpiredPoll renders
- Draft empty + index > 0 → perfectly fine, they just answer from index=3 forward; no draft loss beyond what FR25 already sanctions
- Index out of range (e.g., `/q/999`) → redirect to landing or submit-confirm

Refresh-mid-flow silent-discard is intentional per FR25. Don't try to persist to sessionStorage "just to be nice" — that would leak PII-adjacent state to disk and contradict the PRD.

### No `useResponseDraft.ts` composable; a store file is enough

If someone refactors the store into a composable later, the Pinia abstraction still provides the lifetime guarantees. Don't pre-optimize for the composable shape the PRD hinted at — the test suite is locked to "a Pinia store named `useResponseDraftStore`," and that's the shape.

### Features description rendering

`PollPublic.features[].description` is `string | null` (Story 3.1). Render as a sibling `<p>` below the question text, smaller font (respondent body-small — 14 px), `null` → no element. Don't render `<p></p>` empty; don't render "N/A".

**Placement**: description goes between the question text (inside KanoLikert's legend) and the radio options? Or above KanoLikert entirely? Per UX-spec §Custom Components line 832 ("Content guidelines. Option labels sourced from the copy deck. Question text ≤2 lines at respondent body-large size (18px)."): the question text is KanoLikert's responsibility. The feature description is composition-layer — it belongs OUTSIDE KanoLikert, placed ABOVE it in the route template. This keeps KanoLikert pure and reusable.

### Route-level keyboard handlers — scope matters

Attach `@keydown` to the `<section>` root, not `window`. If Story 4.7's submit-confirm page adds its own keyboard handlers, the scoped listener prevents double-handling. Same reasoning as Story 4.5's `1`–`5` scoping.

One exception: browser Back button (the native `popstate` event). Vue Router handles this automatically via its history stack. Don't intercept `popstate`.

### Reusing error surfaces — don't duplicate

Story 4.4 built `LandingError`, Story 3.8 built `ExpiredPoll` and `PollNotFound`. This route imports those same components and renders them conditionally. Don't re-author: the copy, styling, and a11y are already locked. If a variant is needed (e.g., "your answers so far will be kept if you retry"), extend the copy deck via interpolation — not a new component.

### Performance: the poll is fetched once per visit

`pollPublicStore.loadPoll(uuid)` is idempotent — if already loaded for this uuid, it's a no-op. Navigating `q/0 → q/1 → q/2 → back → q/1` makes one API call total. This is Story 4.4's architectural win and it must not regress here.

### Not in scope

- Submit button + SPA POST → /submit — Story 4.7
- Thanks page — Story 4.7
- axe-core across all respondent routes / manual a11y sweep — Story 4.8
- Per-question analytics / telemetry — not in v1

### Project Structure Notes

Files:
- `kano-frontend/src/routes/poll/Question.vue` (wholesale replaces Story 4.4's placeholder)
- `kano-frontend/src/routes/poll/Question.spec.ts` (new)
- `kano-frontend/src/routes/poll/SubmitConfirm.vue` (new placeholder; Story 4.7 replaces)
- `kano-frontend/src/stores/responseDraft.ts` (new)
- `kano-frontend/src/stores/responseDraft.spec.ts` (new)
- Extend `kano-frontend/src/router.ts` (add `poll-submit-confirm` route)
- Extend `kano-frontend/src/copy/en.ts` (keys above)
- Extend `kano-frontend/e2e/respondent/` (new `flow.spec.ts` or extend `landing.spec.ts`)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR21, FR22, FR23, FR24, FR25] — per-feature 2-question Likert; Likert labels; progress indicator; completeness gate; silent partial discard
- [Source: _bmad-output/planning-artifacts/prd.md#NFR2, NFR9–11] — 3-minute respondent target; WCAG 2.1 AA; axe-core
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — per-domain stores; `responseDraftStore` in-memory only (line 382); route-level code splitting (line 396)
- [Source: _bmad-output/planning-artifacts/architecture.md#Routing] — route map (lines 386–392)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#User Journey Flows] — Flow 2 Marcus completion (line 676–704); halfway acknowledgement (line 691)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Flow Optimization Principles] — honest progress (line 781); reversible before commit (line 792)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.6] — original AC + exact halfway wording
- [Source: _bmad-output/implementation-artifacts/3-4-public-poll-by-uuid-read-endpoint-csrf-exempt.md] — `PollPublic.features[].feature_key` + ordering
- [Source: _bmad-output/implementation-artifacts/3-8-respondent-landing-stub-with-expired-page-handling.md] — `ExpiredPoll`, `PollNotFound` reuse contract
- [Source: _bmad-output/implementation-artifacts/4-4-respondent-landing-page-replacing-the-e3-stub.md] — `pollPublicStore`, `LandingError`, route placeholder pattern
- [Source: _bmad-output/implementation-artifacts/4-5-kanolikert-component-with-auto-advance-and-keyboard-1-5.md] — `<KanoLikert>` props, events, keyboard contract, reduced-motion

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
