# Story 4.7: Terminal Submit with inline missing-answer error and thank-you page

Status: ready-for-dev

## Story

As Marcus,
I want a final Submit action after the last question that either sends my complete response or tells me exactly which answer I missed, and a thank-you page that names what happens next,
so that I close the interaction with small satisfaction rather than a transaction.

## Acceptance Criteria

1. **Given** I've answered all 2N questions, **when** I auto-advance off `/poll/:uuid/q/:lastIndex` (Story 4.6's logic routes me here), **then** the route `/poll/:uuid/submit-confirm` renders a `<v-card>` with a "Review & submit" heading (copy-deck), a single primary Submit `<v-btn>` (48 px tall, thumb-friendly), and a Back affordance (`<v-btn variant="text">` or equivalent, via copy-deck) that returns to `/poll/:uuid/q/:lastIndex`.
2. **When** I click Submit, **then** the SPA serializes the in-memory draft (`responseDraftStore`) into a `PollSubmission` body (`{ answers: [{ feature_key, fq_answer, dq_answer }, ...] }`) and POSTs `/api/v1/polls/:uuid/submit`. Submit button transitions to a `loading` state (disabled + `v-progress-circular` inline) while the request is in flight.
3. **Given** the server returns 204, **when** the response is handled, **then** the SPA clears the response draft (`responseDraftStore.reset()`) and `router.replace({ name: 'poll-thanks', params: { uuid } })` — `replace`, not `push`, so Back from the thanks page doesn't return to submit-confirm.
4. **Client-side defensive completeness guard**: on the submit-confirm route mount AND on every Submit click, if `responseDraftStore.isComplete === false`, the SPA does NOT call the API. Instead it calls `responseDraftStore.firstMissing()` to identify the earliest `(feature_key, question)` pair that is unanswered and `router.push` to the specific `/poll/:uuid/q/:index` for that pair, with `?showError=1` query param. The Question.vue view reads the query, passes `:show-error="true"` to `<KanoLikert>`, and clears the query param on the first successful answer (FR24 + UX-DR27 inline-error-at-source).
5. **Given** the server returns 422 with `type=https://kano.example.com/problems/partial-submission`, **when** the SPA parses the Problem Details, **then** the same inline-at-source pattern applies — the SPA reads `missing[0]` (or `unexpected[0]` / `duplicates[0]` in that priority) and routes back to the specific offending question with `?showError=1`. The submit-confirm route surfaces a 1-line inline alert "Some answers are missing — we've taken you back" (copy-deck), briefly, before routing away, so the user understands why the route changed.
6. **Given** the server returns 410 expired, **when** the SPA handles the response, **then** `router.replace` to `/poll/:uuid` which renders `ExpiredPoll` (via `pollPublicStore.fetchState='expired'` — set by the error handler, not by re-fetching). Draft is cleared on the same transition.
7. **Given** the server returns 400 (Pydantic validation) or 404 or 500, **when** the SPA handles the response, **then** the submit-confirm page stays on screen and renders an inline `<v-alert>` error with copy-deck text + a Retry button. Submit button returns from loading to active. No auto-routing; the user's agency is preserved (they can try again or hit Back).
8. **Given** I land on `/poll/:uuid/thanks`, **when** the Thanks.vue route renders, **then** the page shows a `<v-card>` with `copy('respondent.thanks.title')` ("Thanks — your input is on the record", exact wording per epics line 1177) and `copy('respondent.thanks.body')` (closing-line per UX-DR25). **No next-action CTA, no "answer another survey," no social-share, no footer links**. Just a respectful close.
9. The Thanks route reads the `uuid` param only to validate the URL shape; it does NOT re-fetch the poll and does NOT attempt to re-open the draft. It renders even if the poll has since expired — the acknowledgement of the submission is unconditional.
10. All copy sourced from the copy deck; no inline literals; ESLint gate from Story 1.7 enforces.
11. A Vitest spec for `SubmitConfirm.vue` + `Thanks.vue` covers the happy path, the 204 → thanks transition with draft cleared, the 422 → back-to-missing-question transition, the 410 → expired route, 500 → inline error + retry, and the defensive completeness guard.
12. A Playwright E2E spec completes the full keyboard-only flow end-to-end: landing → Begin → 16 questions answered via `1`–`5` keys → submit-confirm → Submit via Enter/Space → thanks page rendered. This is the golden-path E2E the PRD Readiness Gate cites.

## Tasks / Subtasks

- [ ] Delete Story 4.6's `SubmitConfirm.vue` placeholder (AC: #1)
  - [ ] Wholesale replace — same pattern Stories 3.8 → 4.4, 4.4 → 4.6 followed
- [ ] `src/routes/poll/SubmitConfirm.vue` — real component (AC: #1, #2, #3, #4, #5, #6, #7)
  - [ ] Props via router: `uuid`
  - [ ] Template skeleton:
    ```vue
    <template>
      <section class="submit-confirm">
        <v-card>
          <v-card-title>{{ copy('respondent.submitConfirm.title') }}</v-card-title>
          <v-card-text>{{ copy('respondent.submitConfirm.body') }}</v-card-text>
          <v-alert v-if="error" type="error" :text="error" class="mb-4" />
          <v-card-actions>
            <v-btn variant="text" @click="goBack">{{ copy('respondent.submitConfirm.backCta') }}</v-btn>
            <v-spacer />
            <v-btn
              size="large"
              color="primary"
              :loading="submitting"
              :disabled="submitting"
              @click="onSubmit"
            >
              {{ copy('respondent.submitConfirm.submitCta') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </section>
    </template>
    ```
  - [ ] `onMounted`: defensive completeness guard — if `responseDraftStore.isComplete === false`, call `redirectToFirstMissing()` and return early
  - [ ] `onSubmit`:
    ```ts
    if (!responseDraftStore.isComplete) { redirectToFirstMissing(); return }
    submitting.value = true
    error.value = null
    try {
      const body = buildPollSubmission(responseDraftStore.answers)
      await api.post(`/polls/${uuid}/submit`, body)  // 204 returns undefined
      responseDraftStore.reset()
      router.replace({ name: 'poll-thanks', params: { uuid } })
    } catch (err) {
      handleSubmitError(err)
    } finally {
      submitting.value = false
    }
    ```
  - [ ] `buildPollSubmission(map)`: iterate `Map` entries → `[{ feature_key, fq_answer, dq_answer }, ...]` in the order of the `pollPublicStore.poll.features` array (stable; never emits null answers because guard runs first)
  - [ ] `redirectToFirstMissing()`:
    ```ts
    const missing = responseDraftStore.firstMissing(pollPublicStore.poll!.features.map(f => f.feature_key))
    if (!missing) { /* should never happen; guard defensive */ return }
    const featureIndex = pollPublicStore.poll!.features.findIndex(f => f.feature_key === missing.featureKey)
    const questionOffset = missing.question === 'functional' ? 0 : 1
    const routeIndex = featureIndex * 2 + questionOffset
    router.replace({
      name: 'poll-question',
      params: { uuid, index: routeIndex },
      query: { showError: '1' },
    })
    ```
  - [ ] `handleSubmitError(err)`:
    - 410 (PollExpired): `pollPublicStore.fetchState = 'expired'`; `responseDraftStore.reset()`; `router.replace({ name: 'poll-landing', params: { uuid } })` — the landing re-renders in expired mode without re-fetching
    - 422 (`type` contains `partial-submission`): brief inline alert "Some answers are missing — we've taken you back" (copy-deck), setTimeout 800 ms → `redirectToFirstMissingFromServer(err.problemDetails)` (reads `missing[0]` / `unexpected[0]` / `duplicates[0]` in that priority and routes)
    - 400 / 404 / 500 / network: set `error.value = copy('respondent.submitConfirm.error.generic')`; stay on page, reset `submitting`
- [ ] `src/routes/poll/Thanks.vue` — new component (AC: #8, #9)
  - [ ] Template:
    ```vue
    <template>
      <section class="respondent-thanks">
        <v-card>
          <v-card-title>{{ copy('respondent.thanks.title') }}</v-card-title>
          <v-card-text>{{ copy('respondent.thanks.body') }}</v-card-text>
        </v-card>
      </section>
    </template>
    ```
  - [ ] No `useApi` call, no `pollPublicStore` dependency, no draft-restore attempt. Pure static render.
  - [ ] Tixeo logo in `RespondentLayout` header is the only branding; no additional logo in the card
- [ ] Register Thanks route (AC: #8)
  - [ ] In `src/router.ts`:
    ```ts
    {
      path: '/poll/:uuid/thanks',
      name: 'poll-thanks',
      component: () => import('./routes/poll/Thanks.vue'),
      meta: { layout: 'respondent' },
    }
    ```
- [ ] Question.vue hook for `?showError=1` (AC: #4, #5)
  - [ ] Extend Story 4.6's `Question.vue`:
    - Read `route.query.showError === '1'`; pass `:show-error="true"` to `<KanoLikert>`
    - On `onSelect` (first selection made while the error is showing), clear the query param via `router.replace({ ...route, query: { ...route.query, showError: undefined } })` — the error state visually clears as the reactive `showError` flips to false
  - [ ] This modification to `Question.vue` lives in THIS story even though the file was authored in Story 4.6 — document the incremental change in Dev Agent Record and reference the Story 4.6 contract
- [ ] Copy deck additions — `src/copy/en.ts` (AC: #1, #5, #7, #8)
  - [ ] `respondent.submitConfirm.title` — "Review & submit"
  - [ ] `respondent.submitConfirm.body` — "You've answered every question. Send your input when you're ready."
  - [ ] `respondent.submitConfirm.submitCta` — "Submit"
  - [ ] `respondent.submitConfirm.backCta` — "Back"
  - [ ] `respondent.submitConfirm.missingRedirect` — "Some answers are missing — we've taken you back"
  - [ ] `respondent.submitConfirm.error.generic` — "Something went wrong. Please try again."
  - [ ] `respondent.thanks.title` — "Thanks — your input is on the record" (exact per epics line 1177)
  - [ ] `respondent.thanks.body` — "Paola will see this within a short horizon." (phrasing aligned with UX-DR25; confirm the exact wording with design if ambiguous, but the closing-line must acknowledge the PM will see the input on a short horizon per epics line 1177)
- [ ] `src/api/client.ts` — extend if needed (AC: #2)
  - [ ] Ensure `useApi().post(path, body)` supports a 204 response by returning `undefined` (or handling the empty body without `response.json()` throwing). If Story 1.6's `useApi` wrapper throws on empty body, add a special case: response.status === 204 → resolve(undefined). One-liner.
- [ ] Vitest specs (AC: #11)
  - [ ] `src/routes/poll/SubmitConfirm.spec.ts`:
    - Mount with draft complete → Submit click → mock api.post resolves → asserts `responseDraftStore.reset()` called + `router.replace('poll-thanks')`
    - Mount with draft incomplete → asserts immediate `router.replace` to `/q/<missing>` with `?showError=1`
    - Submit with 422 partial-submission (mock api.post rejects with `ProblemDetailsError({status:422, type:'...partial-submission', missing:['<feature_key>']})`) → asserts redirect to the offending question
    - Submit with 410 → asserts `pollPublicStore.fetchState='expired'` + route back to landing
    - Submit with 500 → asserts inline alert rendered + submit button re-enabled
    - Click Back → asserts `router.push` to `q/:lastIndex`
  - [ ] `src/routes/poll/Thanks.spec.ts`:
    - Renders title + body from copy deck
    - Does NOT call any API
    - Renders even if `pollPublicStore.poll === null` (no dependency on poll state)
  - [ ] `src/routes/poll/Question.spec.ts` (extend):
    - Mount with `route.query.showError='1'` → asserts `<KanoLikert :show-error="true">`
    - First `update:modelValue` emit → asserts `router.replace` called with query without `showError`
- [ ] Playwright E2E — the golden-path keyboard-only spec (AC: #12)
  - [ ] `e2e/respondent/keyboard-only.spec.ts`:
    - Seed DB via API: project + 8 features on epoch 1 + non-expired poll
    - `page.goto('/poll/<uuid>')`
    - Press Tab to focus Begin button, press Enter
    - For each of the 16 questions: press a digit 1–5 (parametrized: alternate 3s and 2s to exercise different Kano cells)
    - At index=8 (halfway), assert halfway microcopy visible (one-shot check)
    - On the last question's keypress, assert URL is `/submit-confirm`
    - Focus Submit button via Tab, press Enter
    - Assert URL is `/poll/<uuid>/thanks`
    - Assert thanks title rendered
    - Assert one `submission` row and 8 `response` rows persisted in the DB (via test helper / direct DB query)
    - Run `AxeBuilder().analyze()` on the thanks page → zero violations
- [ ] Playwright — error-path specs (AC: #4, #5, #6, #7)
  - [ ] `e2e/respondent/submit-errors.spec.ts`:
    - **Missing-answer 422**: intentionally skip one answer by manipulating store state, navigate directly to `/submit-confirm`, click Submit, assert `route.mock` returns 422 partial-submission → URL changes to `/q/<specific-index>?showError=1` and `<KanoLikert>` shows red border + inline error
    - **Expired 410**: seed a poll that expires mid-flow (via DB fixture backdating `expires_at` after the draft is built), click Submit → assert landing page renders with expired state
    - **500 generic**: mock server to 500 → assert inline alert + submit button re-enabled + retry works
    - Manipulate Pinia state via `page.evaluate()` + `window.__pinia__` (Pinia exposes the state for devtools when `__VUE_PROD_DEVTOOLS__` is true in test mode) OR via a test-only mounting hook — document which approach is chosen
- [ ] Bundle check (reuse Story 3.8 + 4.4 gate)
  - [ ] Confirm `npm run build` still passes the 150 KB gzipped respondent-chunk limit

## Dev Notes

### The 204 → empty-body wrinkle

Most `fetch`/`useApi` wrappers assume every response has a JSON body. 204 has no body. If Story 1.6's `useApi` calls `response.json()` unconditionally, it'll throw on 204. Audit that file and patch if needed:

```ts
if (response.status === 204) return undefined as T
```

This affects only the submission endpoint in v1, but it's the right shape for any future empty-response endpoint.

### Error-at-source (FR24 + UX-DR27)

UX-spec §Flow Optimization Principle 3 line 791: "Errors surface at their source. Likert submit missing answers → inline error on the specific missing question, not a top-level banner."

This is why the redirect-to-missing pattern exists. A banner at the top of submit-confirm saying "You missed question 7" is worse:
- Marcus has to read the banner, then navigate back, then find question 7 manually
- Error context is separated from the control that produces the error
- Screen readers have to announce the banner, then re-announce the route, then announce the question — confusing

Redirect-with-`?showError=1` puts the error on the same screen as the control. `<KanoLikert>`'s existing error-variant from Story 4.5 is reused verbatim.

### Priority order for 422 responses

Server 422 carries `missing`, `unexpected`, and `duplicates` arrays (Story 4.2). Client-side priority:
1. `missing[0]` (most common — user skipped one)
2. `unexpected[0]` (rare — the feature set changed underfoot; treat as "this feature doesn't belong here" and redirect to landing to re-init)
3. `duplicates[0]` (very rare — shouldn't happen from the UI; treat as soft corruption, reset draft, route to landing)

Document this priority in `handleSubmitError` as a code comment pointing here. If the server ever returns all three non-empty, priority `missing` wins first render; subsequent attempts re-trigger the guard.

### Submit idempotency

A double-tap on Submit shouldn't create two submissions. The `:disabled="submitting"` + `:loading="submitting"` props on the v-btn prevent the second click from reaching the handler. If race-condition paranoia is warranted (it's not, for an internal tool), a `submissionInFlight` module-level flag could backstop — but Vuetify's disabled state + setTimeout semantics in JSDOM are tested in the Vitest spec.

The server side is also idempotent-ish: a POST with a fresh UUIDv4 always succeeds. There's no client-generated idempotency token in v1; not needed until abuse patterns emerge.

### Why `router.replace`, not `router.push`, for thanks

After Submit succeeds, the user is on a new logical phase (post-submission). Back from the thanks page should NOT return to submit-confirm (they'd try to submit again and get... 404? 422 on unexpected?). `router.replace` removes the submit-confirm entry from history; Back from thanks lands on the last question. If Marcus wants to close the tab, he does — there's nothing more to do.

### Why the thanks page doesn't re-check poll state

Epics line 1178 + UX-DR25: "no next-action CTA, no social-share." The thanks page is a respectful close, not a dashboard. Re-fetching the poll to check if it somehow expired between 204-ack and thanks-render would be paranoid ceremony with no user benefit — the server already accepted the submission. The acknowledgement is earned.

### Accessibility note on route-change announcements

Vue Router's default behavior on route change doesn't announce anything to screen readers. If we want the thanks page to be auto-announced ("You are now on the thanks page"), we'd add a `v-main :aria-live="polite"` wrapper in `RespondentLayout` — but Story 4.8 is the right place to evaluate whether that's needed after manual testing. For now, the thanks page has a visible heading (title) and screen readers will read it on focus-shift to the new route's main landmark; the route change itself need not be announced.

### Test-only Pinia state manipulation

Playwright can manipulate Pinia state via `window.__PINIA__` (or whatever the Pinia devtools hook is — verify on the selected version) when `__VUE_PROD_DEVTOOLS__: true` is set in `vite.config.ts` for the test build. Alternative: build a test-only Vite mode that exposes stores via `window.__testStores__`. Either is fine; document the choice in the E2E file's top comment.

Avoid hacking via DOM events (e.g., 16 real keypresses) for the error-path spec — that's the golden-path spec's job. Error-path can start from "draft is almost complete, one answer missing" and set that state synthetically.

### Not in scope

- Post-submission analytics or ping-backs — v2
- Multi-submission (same respondent answering again) — not in v1; PRD says one-and-done
- Respondent-side "copy my answers" for audit — not requested
- Manual a11y sweep across the full flow including submit-confirm / thanks — Story 4.8

### Project Structure Notes

Files:
- `kano-frontend/src/routes/poll/SubmitConfirm.vue` (wholesale replaces Story 4.6's placeholder)
- `kano-frontend/src/routes/poll/SubmitConfirm.spec.ts` (new)
- `kano-frontend/src/routes/poll/Thanks.vue` (new)
- `kano-frontend/src/routes/poll/Thanks.spec.ts` (new)
- Extend `kano-frontend/src/routes/poll/Question.vue` (add `?showError=1` handling)
- Extend `kano-frontend/src/routes/poll/Question.spec.ts` (cover `?showError=1`)
- Extend `kano-frontend/src/router.ts` (register `poll-thanks` route)
- Extend `kano-frontend/src/copy/en.ts` (keys above)
- Possibly extend `kano-frontend/src/composables/useApi.ts` (or wherever Story 1.6's wrapper lives) for 204 handling
- `kano-frontend/e2e/respondent/keyboard-only.spec.ts` (new — the golden-path PRD readiness-gate spec)
- `kano-frontend/e2e/respondent/submit-errors.spec.ts` (new)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR24, FR25, FR26] — completeness gate + partial discard + confirmation page
- [Source: _bmad-output/planning-artifacts/prd.md#MVP Readiness Gates] — keyboard-only E2E on respondent flow
- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — WCAG 2.1 AA
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — 204 status code + client `useApi` contract
- [Source: _bmad-output/planning-artifacts/architecture.md#Process Patterns] — typed `useApi` errors (`ValidationError`, `ConflictError`, `NotFoundError`, `ServerError`) carrying Problem Details payload (line 727)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#User Journey Flows] — Flow 2 (line 676–704); thank-you page as "relationship artifact" (line 959)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Button Hierarchy] — 48 px primary (line 978)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Flow Optimization Principles] — errors-at-source (line 791), reversible-before-commit (line 792), quiet success (line 793)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.7] — original AC + thanks-page wording + no-CTA constraint
- [Source: _bmad-output/implementation-artifacts/1-6-vue-spa-scaffold-with-tixeo-vuetify-theme-two-layouts-and-useapi-composable.md] — `useApi` wrapper (audit for 204 support)
- [Source: _bmad-output/implementation-artifacts/3-8-respondent-landing-stub-with-expired-page-handling.md] — `ExpiredPoll` reuse + bundle gate
- [Source: _bmad-output/implementation-artifacts/4-3-public-poll-submission-endpoint-csrf-exempt.md] — 204 contract + 400/410/422/500 Problem Details shapes
- [Source: _bmad-output/implementation-artifacts/4-4-respondent-landing-page-replacing-the-e3-stub.md] — `pollPublicStore`
- [Source: _bmad-output/implementation-artifacts/4-5-kanolikert-component-with-auto-advance-and-keyboard-1-5.md] — error variant contract
- [Source: _bmad-output/implementation-artifacts/4-6-one-question-per-screen-respondent-flow-with-honest-progress.md] — `responseDraftStore`, `firstMissing()`, Question.vue shape

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
