# Story 3.8: Respondent landing stub with expired-page handling

Status: ready-for-dev

## Story

As Paola previewing her own URL on her phone (or a respondent early-clicking an E3-era link),
I want the `/poll/:uuid` route to resolve to a themed respondent shell — either a "poll coming soon" placeholder for a live poll or the full expired-page experience for expired polls,
so that the QR-preview workflow works at E3 merge, and any respondent hitting an expired link gets a respectful closure with an off-ramp.

## Acceptance Criteria

1. **Given** the respondent route bundle is configured under `/poll/*` in `src/routes/poll/`, **when** the Vite build runs, **then** the respondent chunk is a separate **initial bundle** that does NOT statically import any symbol from `src/routes/app/**` or PM-only Vuetify components (e.g., `v-data-table`, `v-navigation-drawer`, the `PmLayout` module, `projectsStore`, `pollsStore`).
2. A build-time assertion (in `kano-frontend/vite.config.ts` via `build.rollupOptions.onwarn` + a custom post-build script, OR a `scripts/check-respondent-bundle.mjs` run in `postbuild`) fails the `npm run build` command if the respondent initial bundle exceeds **150 KB gzipped**. The gate runs on every local `npm run build`, not just in CI.
3. The `size-limit` CI gate from Story 1.10 is extended to mirror the same 150 KB respondent-initial-bundle assertion so merges are blocked on the same threshold.
4. **Given** I navigate to `/poll/<valid-non-expired-uuid>` on a mobile viewport, **when** the page mounts inside `RespondentLayout`, **then** the page calls `GET /api/v1/polls/:uuid` (Story 3.4 endpoint).
5. **On 200 (live poll)**, the page renders a themed "This poll is ready" placeholder card: Tixeo brand anchor at top; a `<v-card>` with copy-deck sourced title and body ("A short survey is being prepared. Please check back shortly."). The root element of the stub's content area carries `data-stub="true"` as a structural marker.
6. **On 410 (expired)**, the page renders the full expired-poll experience per FR27: a `<v-card>` with copy-deck sourced title "This survey closed before you could respond" and body with a product-team contact off-ramp (configurable mailto: or route, default `mailto:${env.VITE_PRODUCT_CONTACT_EMAIL}`).
7. **On 404 (unknown UUID)**, the page renders a themed "We couldn't find that poll" card with a link back to the product team (same contact anchor as AC #6).
8. The rendered page passes `axe-core` a11y checks (no violations) across all three states (live stub, expired, not-found) at both 360 px and 420 px viewport widths.
9. The page renders cleanly at 360 px viewport width; no horizontal overflow; all interactive elements are ≥ 44×44 px touch targets.
10. All user-visible strings are sourced from the copy deck.
11. An E2E Playwright test covers the happy preview flow: generate a poll via the PM SPA (uses Story 3.6) → open the URL on a mobile viewport → assert the "coming soon" stub renders → no broken route or 404 state.

## Tasks / Subtasks

- [ ] Route bundle boundary (AC: #1)
  - [ ] Create `kano-frontend/src/routes/poll/` directory
  - [ ] Ensure `router.ts` uses a dynamic `() => import('./routes/poll/Landing.vue')` for every `/poll/*` route (never static imports); Vite's automatic code-splitting then separates the respondent chunk
  - [ ] Add an ESLint rule or a simple `grep` check in the post-build script that `dist/assets/poll-*.js` does not contain any of the PM-only module identifiers (`projectsStore`, `pollsStore`, `PmLayout`, `PollSharePanel`, `FeatureListEditor`). If any appear, fail the build with a clear message pointing at this AC.
  - [ ] Confirm `RespondentLayout.vue` (from Story 1.6) is the only layout imported by `/poll/*` routes
- [ ] Build-time bundle gate (AC: #2)
  - [ ] `kano-frontend/scripts/check-respondent-bundle.mjs`:
    - Read `dist/manifest.json` (Vite emits this when `build.manifest=true`)
    - Identify entry chunk(s) whose dynamic-import root is a `src/routes/poll/**` file
    - Sum their gzipped size (use `zlib.gzipSync` on the raw file bytes, measure `.length`)
    - If sum > 150 * 1024, `process.exit(1)` with a message: `Respondent initial bundle is {size} B gzipped, limit 150 KB. Found: {file list}.`
  - [ ] Wire into `package.json` scripts: `"postbuild": "node scripts/check-respondent-bundle.mjs"` so it runs automatically after `npm run build`
  - [ ] Ensure `build.manifest: true` is set in `vite.config.ts`
- [ ] CI bundle gate (AC: #3)
  - [ ] Extend `.github/workflows/ci.yml` (from Story 1.10) — the frontend job already runs `npm run build`; the postbuild hook makes the assertion run automatically on CI. No additional workflow step needed; just verify the existing `build` step propagates the non-zero exit.
  - [ ] If Story 1.10 uses `size-limit` specifically (rather than a hand-rolled script), add a `size-limit` config entry:
    ```json
    {
      "path": "dist/assets/poll-*.js",
      "limit": "150 KB",
      "gzip": true
    }
    ```
- [ ] Router wiring (AC: #4)
  - [ ] `kano-frontend/src/router.ts` — register:
    ```ts
    {
      path: '/poll/:uuid',
      name: 'poll-landing',
      component: () => import('./routes/poll/Landing.vue'),
      meta: { layout: 'respondent' },
    }
    ```
- [ ] `src/routes/poll/Landing.vue` (AC: #4, #5, #6, #7, #9, #10)
  - [ ] Template skeleton:
    ```vue
    <template>
      <div class="poll-landing" data-stub="true">
        <header class="brand"><TixeoLogo /></header>
        <main>
          <v-progress-circular v-if="loading" indeterminate aria-label="Loading..." />
          <LivePollStub v-else-if="state === 'live'" :poll="poll!" />
          <ExpiredPoll v-else-if="state === 'expired'" />
          <PollNotFound v-else />
        </main>
      </div>
    </template>
    ```
  - [ ] Script:
    ```ts
    type State = 'loading' | 'live' | 'expired' | 'not-found';
    const state = ref<State>('loading');
    const poll = ref<PollPublic | null>(null);

    onMounted(async () => {
      try {
        poll.value = await api.get<PollPublic>(`/polls/${route.params.uuid}`);
        state.value = 'live';
      } catch (err) {
        if (err instanceof ProblemDetailsError) {
          if (err.status === 410) state.value = 'expired';
          else if (err.status === 404) state.value = 'not-found';
          else throw err;
        } else {
          throw err;
        }
      }
    });
    ```
  - [ ] **Important:** `useApi` is fine to call directly here (no Pinia store) because the respondent surface has no shared state — and pulling in `pollsStore` would violate AC #1's bundle-isolation goal. Add a code comment noting this intentional exception to the "components call stores, not `useApi`" convention (Story 2.9 Dev Notes).
  - [ ] `data-stub="true"` on the root content element so Story 4.4 can find this exact element and **delete** the file (see AC #5 commentary in epics.md line 1018)
- [ ] Sub-components in `src/routes/poll/` (AC: #5, #6, #7, #10)
  - [ ] `LivePollStub.vue`: `<v-card>` with copy-deck entries `respondent.landing.stub.title` ("This poll is ready") and `respondent.landing.stub.body` ("A short survey is being prepared. Please check back shortly."). Tixeo logo (already rendered above via the layout or the header); no CTA button.
  - [ ] `ExpiredPoll.vue`: `<v-card>` with copy-deck `respondent.expired.title` ("This survey closed before you could respond"), `respondent.expired.body` ("Thanks for taking the time to click through."), and an off-ramp anchor — an `<a>` with `href="mailto:${import.meta.env.VITE_PRODUCT_CONTACT_EMAIL || 'product@tixeo.com'}"` wrapped in a `<v-btn variant="tonal">` styled as a button link. Copy for the button: `respondent.expired.contactCta` ("Get in touch with our product team").
  - [ ] `PollNotFound.vue`: `<v-card>` with copy-deck `respondent.notFound.title` ("We couldn't find that poll") and `respondent.notFound.body` ("The link may have been typed incorrectly. If you think this is an error, please reach out."), plus the same off-ramp anchor.
  - [ ] Each of the three sub-components lives in `src/routes/poll/` (NOT `src/components/`) to keep the respondent-only chunk cohesive. They are small, specific-purpose, and have no PM-side consumers.
- [ ] Environment config
  - [ ] Add `VITE_PRODUCT_CONTACT_EMAIL` to `.env.example` (and docker-compose `env_file`) with a placeholder value; document in the existing env table (Story 1.3 scaffold)
- [ ] Copy deck additions (AC: #10)
  - [ ] Extend `kano-frontend/src/copy/en.ts`:
    - `respondent.landing.stub.title` — "This poll is ready"
    - `respondent.landing.stub.body` — "A short survey is being prepared. Please check back shortly."
    - `respondent.expired.title` — "This survey closed before you could respond"
    - `respondent.expired.body` — "Thanks for taking the time to click through."
    - `respondent.expired.contactCta` — "Get in touch with our product team"
    - `respondent.notFound.title` — "We couldn't find that poll"
    - `respondent.notFound.body` — "The link may have been typed incorrectly. If you think this is an error, please reach out."
- [ ] Vitest specs
  - [ ] `kano-frontend/src/routes/poll/Landing.spec.ts`:
    - Mock `useApi` to return a valid `PollPublic` → assert `LivePollStub` rendered, `data-stub="true"` on root
    - Mock `useApi` to reject with `ProblemDetailsError(status=410)` → assert `ExpiredPoll` rendered
    - Mock `useApi` to reject with `ProblemDetailsError(status=404)` → assert `PollNotFound` rendered
    - Loading state: `<v-progress-circular>` visible before the async resolves
- [ ] Playwright E2E (AC: #8, #9, #11)
  - [ ] `kano-frontend/e2e/respondent/landing.spec.ts`:
    - Use Playwright's `devices['iPhone SE']` preset (360 px viewport) as default for this file
    - **Happy preview path (AC #11)**:
      - Seed DB: project + 1 feature + (via API) create a poll
      - Navigate to `/poll/<pollId>`
      - Assert `data-stub="true"` element visible, stub title text visible, no console errors
      - Run `AxeBuilder().analyze()` → assert zero violations (AC #8)
    - **Expired path**:
      - Seed a poll via test-fixture with `expires_at` backdated by 1 minute
      - Navigate → assert expired title visible, contact mailto anchor has `href^="mailto:"`
      - axe-core zero violations
    - **Not-found path**:
      - Navigate to `/poll/00000000-0000-0000-0000-000000000000`
      - Assert not-found title, axe-core zero violations
    - **Responsive (AC #9)**:
      - Set viewport to 360×640 → assert no element overflows; run `page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)` → true
      - Tap targets: the mailto button's bounding box has `width >= 44 && height >= 44`

## Dev Notes

### Why a stub instead of the real landing page

Epic 3's job is to ship Critical Success Moment 2 (the handoff URL) + FR27 (expired-page handling). The real respondent landing composition — Begin CTA, intro microcopy, study context — lives in Story 4.4. Shipping the stub at E3 unblocks Paola's preview workflow (QR scan on her phone actually resolves to something real) without pulling forward Epic 4's work.

**Story 4.4 will replace this file wholesale** (not edit it) per epics.md line 1018. That's why `data-stub="true"` exists as a structural marker: it's the signal to the Story 4.4 author that they've arrived at the right place to delete. The stub's sub-components (`LivePollStub.vue`) can also be deleted or superseded at that point; the `ExpiredPoll.vue` and `PollNotFound.vue` components will be **reused** by Story 4.4 (same copy, same layout). Keep those two sub-components portable — no imports from the stub file.

### Bundle isolation is load-bearing for NFR performance

Respondent mobile users on hotel/office cellular need a lean initial payload. Architecture §Frontend Architecture line 396 sets 150 KB gzipped as the ceiling; §Responsive Design line 237 + §Performance line 243–244 explain the why: "respondent completion rate depends on frictionless mobile answering."

Accidental regressions are the main risk: a developer extends `Landing.vue` with a utility import from `src/components/PollSharePanel.vue` or `src/stores/polls.ts`, and suddenly `qrcode` + Vuetify's `v-data-table` come along for the ride. The build-time + CI assertion is the hard-stop. **Run the assertion at `npm run build` time (not just CI)** so regressions fail at commit time rather than surprising us in E7's production pipeline.

### Why call `useApi` directly, not through a store

Architecture §Frontend Component Boundaries (Story 2.9 Dev Notes line 55) says "components don't call useApi directly outside of stores." This is the **explicitly called-out exception** in architecture.md line 382: "No global app-state store; per-domain. … `responseDraftStore` (respondent-side, in-memory only per FR25 silent-discard)."

The respondent route has no state to share across components on the landing screen — the poll is fetched once, rendered once, gone. A Pinia store for this would be ceremony for nothing AND would add a store module to the respondent chunk. `useApi` directly is the correct pattern here; comment the exception in the file.

### Mobile-first styling

`RespondentLayout` (Story 1.6) targets the ≥ 360 px respondent viewport per PRD §Responsive Design line 237. Vuetify 4's responsive defaults handle most of it; the specific things to watch:
- `<v-card>` padding should render cleanly in 360 px (default Vuetify padding works; no overrides needed)
- Mailto button: `<v-btn size="large">` gives ≥ 44 px height by default
- No horizontal scroll: ensure the layout's container is `max-width: 480px` (per architecture line 394) and centered; the Playwright `scrollWidth <= innerWidth` check is the guard

### FR27 is fully satisfied here, NOT in Epic 4

Epic 3 intro (epics.md line 870) is explicit: "FR27 (expired-poll page UX) ships in this epic alongside the respondent-landing stub. FR16 (reject expired submissions) stays in Epic 4 where the submit endpoint lives."

So `ExpiredPoll.vue` is the final v1 expired experience — it is not a stub. Polish it to production quality (copy, layout, a11y, tap targets) because it won't be revisited.

### axe-core across all three states

Axe checks typically only run on the default (happy) state. This story explicitly requires zero violations in the expired and not-found branches too — those are the states most likely to skip through a11y review because they're "just an error page." Make the three Playwright axe checks explicit to avoid that blind spot.

### Not in scope

- Full respondent landing with Begin CTA — Story 4.4 replaces the live-poll stub.
- Per-question Likert flow (`/poll/:uuid/q/:featureIndex`) — Stories 4.5, 4.6.
- Submit endpoint / thank-you page — Stories 4.3, 4.7.
- FR16 (reject expired submissions) — Story 4.3.
- Translation / i18n beyond English — Post-MVP per PRD.

### Project Structure Notes

Files:
- `kano-frontend/src/routes/poll/Landing.vue` (new; will be deleted in Story 4.4)
- `kano-frontend/src/routes/poll/LivePollStub.vue` (new; will be deleted in Story 4.4)
- `kano-frontend/src/routes/poll/ExpiredPoll.vue` (new; reused by Story 4.4)
- `kano-frontend/src/routes/poll/PollNotFound.vue` (new; reused by Story 4.4)
- `kano-frontend/src/routes/poll/Landing.spec.ts` (new)
- `kano-frontend/scripts/check-respondent-bundle.mjs` (new; post-build gate)
- Extend `kano-frontend/src/router.ts` (register `/poll/:uuid`)
- Extend `kano-frontend/vite.config.ts` (`build.manifest: true`; optional `onwarn` hardening)
- Extend `kano-frontend/package.json` (`postbuild` script; `size-limit` config update)
- Extend `kano-frontend/src/copy/en.ts`
- Extend `kano-frontend/.env.example` (add `VITE_PRODUCT_CONTACT_EMAIL`)
- `kano-frontend/e2e/respondent/landing.spec.ts` (new)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR15, FR19, FR27] — public access, 7-day TTL, expired-poll page
- [Source: _bmad-output/planning-artifacts/prd.md#Responsive Design] — respondent mobile viewport (line 237)
- [Source: _bmad-output/planning-artifacts/prd.md#Performance Targets] — respondent lean bundle (line 244)
- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — WCAG 2.1 AA + axe-core
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#User Journey Flows] — Flow 5 expired link (line 755–769)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Implementation Roadmap] — Phase 3 "Respondent expired-link page composition" (line 958)
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — route-level code splitting, 150 KB gzipped ceiling (line 396)
- [Source: _bmad-output/planning-artifacts/architecture.md#Responsive Design] — respondent layout 480 px max-width (line 394)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.8] — original AC; explicit "stub will be deleted by 4.4" commentary
- [Source: _bmad-output/implementation-artifacts/1-6-vue-spa-scaffold-with-tixeo-vuetify-theme-two-layouts-and-useapi-composable.md] — `RespondentLayout`, `useApi`
- [Source: _bmad-output/implementation-artifacts/1-10-ci-baseline-pipeline-and-pre-commit-hooks.md] — existing bundle-size / `size-limit` CI gate
- [Source: _bmad-output/implementation-artifacts/3-4-public-poll-by-uuid-read-endpoint-csrf-exempt.md] — `GET /api/v1/polls/:uuid` + 200 / 410 / 404 contract consumed here

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
