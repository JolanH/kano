# Story 4.8: Respondent flow accessibility close-out and manual gates

Status: ready-for-dev

## Story

As a solo dev,
I want the full respondent flow to pass automated a11y gates plus documented manual smoke tests on real devices,
so that Marcus's experience works for assistive tech users, over cellular, on the device he actually uses.

## Acceptance Criteria

1. **Given** Stories 4.4 through 4.7 have landed (landing → question × 2N → submit-confirm → thanks, plus expired / not-found / error surfaces), **when** the `axe-core` CI check runs on each respondent route, **then** zero violations are reported across all states: live landing, question (mid-flow + halfway + `?showError=1`), submit-confirm (happy + inline-error), thanks, expired, not-found, and error.
2. A Playwright E2E test completes the full keyboard-only flow end-to-end (landing → 2N questions via `1`–`5` keys → submit-confirm → Submit via Enter/Space → thanks) with **no mouse, no touch events** emitted — verified via Playwright's input modality assertions. This is distinct from Story 4.7's golden-path spec: Story 4.7 covers the "does it work" contract; this story covers the "is it a11y-clean" contract across every route.
3. **Touch-target audit** (automated in the E2E): every interactive element on every respondent route renders with bounding-box `width ≥ 44 && height ≥ 44` at 360 px viewport. Applies to: Begin button, each `<KanoLikert>` option card, progress bar (if interactive — it is not in v1, so skip), Back / Retry / Submit buttons, mailto anchor on expired + not-found, Retry button on error.
4. **Reduced-motion contract** across the full flow: with `prefers-reduced-motion: reduce` set, the Playwright E2E confirms:
   - `<KanoLikert>` auto-advance is instant (no 150 ms delay) — already tested at unit level in Story 4.5; this adds the E2E-level confirmation via timing assertions
   - `<v-progress-linear>` updates without a fill animation (transition duration 0)
   - halfway microcopy renders without a fade transition
   - any Vuetify default animation (dialog open, alert slide) on error surfaces is suppressed
5. **Manual milestone verification** before the epic closes (Kanaud executes):
   - **VoiceOver on iOS Safari (latest + one prior)**: correctly announces the landing trust line, Begin button role + name, each KanoLikert option label, the question being answered, the progress state ("Question 9 of 16" or the equivalent announcement), the halfway microcopy (once), the submit-confirm heading + Submit button, the thanks page title
   - **TalkBack on Android Chrome**: announces the same events consistently; any cross-platform divergence is documented as a known issue with severity
   - **DevTools 3G throttle**: landing → first question renders within acceptable latency (no stuck states, no race conditions between route change and draft initialization); specifically, `pollPublicStore.loadPoll` completes before Question.vue tries to read `features`
6. **Real-device close-out**: one real iOS device and one real Android device each successfully complete an 8-feature poll (16 questions) through to the thanks page without intervention — no stuck states, no unexpected keyboard pop-ups, no viewport jumps, no scroll-bar intrusion
7. **Focus management** is correct end-to-end: no focus traps, no focus-loss on route transition, auto-advance preserves a sensible focus target on the next question (first option receives focus on route mount), Begin button is the initial focus on landing, Submit button is the initial focus on submit-confirm
8. The manual checklist results are committed as `docs/a11y/respondent-checklist.md` with a dated signoff (Kanaud's initials + date) + screenshots of any issues found or fixed. Checklist follows the structure of `docs/a11y/paola-authoring-checklist.md` (Story 2.13) for consistency.
9. Any issues discovered are either fixed in this story OR filed as follow-up tickets with explicit acceptance criteria. Blocker-severity issues must be fixed in this story; non-blocker may ship as tracked follow-ups.

## Tasks / Subtasks

- [ ] Author `docs/a11y/respondent-checklist.md` (AC: #5, #8)
  - [ ] Structure mirrors Story 2.13's PM-side checklist for consistency
  - [ ] **Environment setup** section:
    - iOS Safari + VoiceOver: latest iOS + one prior major version
    - Android Chrome + TalkBack: latest Android + one prior major version
    - 3G throttle via Chrome DevTools
    - Real-device testing: Kanaud's iPhone + an Android device (BrowserStack acceptable if no Android hardware)
  - [ ] **Checklist per screen**:
    - `/poll/:uuid` (live landing): announces trust line; Begin role + name; focus on Begin via VO rotor/TalkBack swipe
    - `/poll/:uuid` (expired): announces title + body + off-ramp button role + name; mailto href validates
    - `/poll/:uuid` (not-found): announces title + body + off-ramp
    - `/poll/:uuid/q/:index` (happy): announces question legend, each option label in order, current selection state, progress-bar value; keyboard `1`–`5` selection announced; auto-advance transitions read as "navigating to next question" (or silent if SR prefers)
    - `/poll/:uuid/q/:index` (halfway): announces the halfway microcopy once as a polite live region update, doesn't steal focus
    - `/poll/:uuid/q/:index?showError=1` (error variant): announces the error message with `role="alert"` priority, keeps focus on the radio group
    - `/poll/:uuid/submit-confirm`: announces heading, body, Back + Submit button roles + names
    - `/poll/:uuid/submit-confirm` (inline error after network/server failure): announces the `v-alert` error text, Submit returns to active state
    - `/poll/:uuid/thanks`: announces title + body; no auto-focus steal; page renders without dependencies
  - [ ] **Issue log**: table with columns `Platform | Screen | Severity (blocker / major / minor) | Description | Status (open / fixed / deferred) | Fix commit / follow-up ticket`
  - [ ] **Signoff** section: date, initials per platform, explicit statement "All blockers resolved; non-blockers tracked in [link]"
- [ ] Execute the manual checklist (AC: #5, #6)
  - [ ] Run each screen through VoiceOver on iOS Safari
  - [ ] Run each screen through TalkBack on Android Chrome
  - [ ] Capture screenshots of any issues
  - [ ] For each finding: either fix in the responsible component file (reference the fix commit in the checklist) OR open a follow-up ticket with the specific AC
- [ ] Real-device smoke test (AC: #6, #8)
  - [ ] On one iPhone: open a test-poll URL, complete all 16 questions, submit, confirm thanks page renders
  - [ ] On one Android: same, on Chrome
  - [ ] Record: any stuck states, any viewport jumps, any keyboard issues
  - [ ] Commit screenshots or a brief video clip as checklist evidence
- [ ] Extend CI axe-core coverage (AC: #1)
  - [ ] New file `e2e/respondent/a11y.spec.ts`:
    - Seed DB: project + 3-feature non-expired poll + a 1-feature already-expired poll
    - Navigate to each respondent route + state combination:
      - `/poll/<live-uuid>` (landing, happy)
      - `/poll/<live-uuid>/q/0` (first question, no error)
      - `/poll/<live-uuid>/q/0?showError=1` (question with error variant)
      - `/poll/<live-uuid>/q/3` (halfway — N=3 → index=3 is halfway for a 3-feature poll; recompute for the seeded count)
      - `/poll/<live-uuid>/q/5` (last question)
      - `/poll/<live-uuid>/submit-confirm` (draft complete, mocked)
      - `/poll/<live-uuid>/submit-confirm` (inline server-error state, via Route.fulfill({status:500}))
      - `/poll/<live-uuid>/thanks`
      - `/poll/<expired-uuid>` (expired state)
      - `/poll/00000000-0000-0000-0000-000000000000` (not-found state)
      - Error state on landing (via Route.fulfill({status:500}))
    - For each: `await new AxeBuilder({ page }).analyze()` → assert `violations.length === 0`
    - On failure, attach `violations` array to the test report for debugging
  - [ ] Run at 360 px viewport (Playwright `devices['iPhone SE']` preset)
  - [ ] Also snapshot run at 420 px viewport as a second breakpoint
- [ ] Playwright E2E keyboard-only across the full flow (AC: #2)
  - [ ] New file `e2e/respondent/keyboard-a11y.spec.ts` (distinct from Story 4.7's golden-path keyboard-only spec; this one validates no-touch, no-mouse across every route + state, including error paths)
  - [ ] Use Playwright's `emulateMedia({ reducedMotion: 'reduce' })` for one parametrized run and the default for another
  - [ ] Assert `page.mouse` is never called (this is implicit; just document in comments)
  - [ ] Use only `page.keyboard.press()` and `page.keyboard.type()` — zero click() calls
  - [ ] Full flow: Tab to Begin → Enter → press `3` sixteen times → Enter on Submit → assert thanks
- [ ] Touch-target audit (AC: #3)
  - [ ] In the a11y spec above, after navigating to each route, enumerate all interactive elements via a custom locator:
    ```ts
    const interactive = page.locator('button, [role="button"], a[href], input, [tabindex]:not([tabindex="-1"])')
    const count = await interactive.count()
    for (let i = 0; i < count; i++) {
      const box = await interactive.nth(i).boundingBox()
      if (box) expect(box.width).toBeGreaterThanOrEqual(44)
      if (box) expect(box.height).toBeGreaterThanOrEqual(44)
    }
    ```
  - [ ] Skip hidden elements (bounding box null)
  - [ ] Known exceptions: none expected. If any Vuetify default element is < 44 px (e.g., the `v-radio`'s inner circle), the audit catches it and we either override the theme or fail — don't list exceptions preemptively
- [ ] Reduced-motion E2E assertions (AC: #4)
  - [ ] In `keyboard-a11y.spec.ts`'s reduced-motion run:
    - Measure the delay between a `page.keyboard.press('3')` on `/q/0` and the URL changing to `/q/1`; assert < 50 ms (instant; no 150 ms setTimeout). Use `page.waitForURL` with a start timestamp.
    - Inspect `v-progress-linear` computed `transition-duration` — assert it's `0s` or the reduced-motion override is applied
    - Halfway microcopy: assert its computed `transition` CSS is `none` under reduced-motion
- [ ] Focus management checks (AC: #7)
  - [ ] In the Playwright spec:
    - On landing mount, `page.evaluate(() => document.activeElement?.getAttribute('data-role') || document.activeElement?.textContent)` should be Begin button (or whatever identifier the landing uses to mark the initial focus target)
    - On Question.vue mount, initial focus is the first KanoLikert option (matching `v-radio-group`'s default; verify Vuetify 4 behavior)
    - On route transition via auto-advance, assert focus is on the new Question's first option — not lost to body
    - On SubmitConfirm mount, initial focus is the Submit button
    - On Thanks mount, focus is on the page heading or the main landmark (not lost to body)
  - [ ] Add an explicit `autofocus` or `onMounted(() => button.value?.focus())` hook in each route component if needed — document the pattern in Dev Notes

## Dev Notes

### Why this story is Epic 4's gate

PRD NFR9–11 + MVP Readiness Gates: the full E2E suite must be green and WCAG 2.1 AA compliant before the first PM study. The earlier automated checks (axe-core in CI from Story 1.10, per-component specs throughout Epic 4) catch structural violations. This story is the **manual verification** that no automatable gap has slipped through — specifically around screen-reader semantic quality, which axe can only partially assess.

Schedule this story **after** 4.4–4.7 merge — there's nothing to test until the full respondent UI is in place.

### Why parallel to Story 2.13, not duplicate

Story 2.13 owns PM-side a11y close-out (VoiceOver + NVDA on Paola's authoring flow). This story owns respondent-side (VoiceOver + TalkBack on Marcus's flow). The two are parallel by design:
- Different personas, different devices, different assistive tech
- Different screen-reader behaviors across mobile vs desktop
- Different content tone (authoring vs answering)

The checklist file structure is shared for consistency (`docs/a11y/*.md` both follow the same sections), but the **content** is separate. Do not merge the two files.

### TalkBack vs NVDA

Story 2.13 used NVDA (Windows desktop). This story uses TalkBack (Android mobile). Rationale: respondents are on mobile (Epic 4's defining constraint); NVDA on respondent routes would test a surface no real user touches. Respondent-on-desktop is a valid path too — but desktop-Chrome + ChromeVox is covered implicitly by the VO/TalkBack tests; adding NVDA would duplicate.

### 3G throttle test — what to look for

PRD doesn't set a specific latency number for respondent landing → first question. "Acceptable latency" is judgment-based. Indicators of failure:
- Landing renders blank for > 2 seconds (no loading spinner, or spinner appears too late)
- Question renders before `pollPublicStore.loadPoll` resolves, causing a flash of empty state
- Draft initialization (Story 4.6's `responseDraftStore.initForPoll`) races with Question.vue's mount, causing `features` to be undefined momentarily

Test the slow-network path by exercising browser refresh mid-flow AND a direct-navigate to `/q/3` on a fresh tab. Both paths should render a graceful loading state.

### What counts as "fixed" in this story

- **Trivial fix** (missing `aria-label`, incorrect heading hierarchy, color contrast failure): fix in the responsible component, note in checklist, re-verify, merge in this story
- **Complex fix** (requires re-architecting a Vuetify interaction, upstream library change): file a follow-up with a clear AC, document in checklist with tracking link, flag severity; this story can ship if the issue is non-blocker. A blocker must be fixed in this story (not deferred)
- **Won't-fix with rationale** (known Vuetify / browser limitation we choose to accept): documented in the checklist's issue log with severity + rationale

### Focus management — a common regression

Vue Router does not auto-manage focus on route change. Each route component should explicitly set focus on its primary interactive element on mount:

```vue
<script setup>
const btn = ref<HTMLElement | null>(null)
onMounted(() => btn.value?.focus())
</script>
<template>
  <v-btn ref="btn" ...>{{ copy('...') }}</v-btn>
</template>
```

Apply to Landing (Begin), SubmitConfirm (Submit), and the initial KanoLikert option on Question.vue. Thanks page focuses its heading (set `tabindex="-1"` on the `<h1>` so it's programmatically focusable without being in the tab order, then focus it on mount).

### Known Vuetify limitation to watch for

Vuetify's `v-radio-group` may not announce the group label consistently across SR/browser combos. Story 4.5 sets `aria-labelledby` as backup. If the manual checklist flags "SR doesn't announce feature name when the group gains focus," verify both `fieldset` + `legend` AND `aria-labelledby` are wired — this belt-and-braces should cover all combos.

### Severity calibration

- **Blocker**: any route returns a screen-reader-broken experience where the user cannot complete the flow. Must fix before ship.
- **Major**: a specific announcement is wrong, confusing, or missing, but the user can still complete the flow. Fix in this story preferred; deferrable with explicit rationale.
- **Minor**: a subtle mispronunciation, verbose announcement, or cosmetic focus-ring issue. Defer to follow-up; acceptable to ship.

### Not in scope

- Analysis-page a11y (Epic 5 has its own close-out, Story 5.8)
- PM-surface a11y (Story 2.13)
- AAA-level compliance
- Color-blindness specific verification (covered in Story 1.8's theme audit + Story 5.4's Kano palette tests; any respondent-surface finding here overlaps)

### Project Structure Notes

Files:
- `docs/a11y/respondent-checklist.md` (new)
- `kano-frontend/e2e/respondent/a11y.spec.ts` (new — axe across all states)
- `kano-frontend/e2e/respondent/keyboard-a11y.spec.ts` (new — keyboard-only + reduced-motion + focus)
- Any fix commits referenced from the checklist (scoped edits to `Landing.vue`, `Question.vue`, `SubmitConfirm.vue`, `Thanks.vue`, `KanoLikert.vue`, or their sub-components as findings warrant)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — WCAG 2.1 AA + axe-core + accessible fallback
- [Source: _bmad-output/planning-artifacts/prd.md#MVP Readiness Gates] — full E2E Playwright suite green before first PM study
- [Source: _bmad-output/planning-artifacts/architecture.md#Accessibility] — axe-core CI enforcement; reduced-motion; touch targets; keyboard parity
- [Source: _bmad-output/planning-artifacts/architecture.md#Cross-Cutting Concerns] — item 7 accessibility implementation (line 79)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Testing Strategy] — automated axe-core + manual at milestone gates (lines 1118–1134)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility Considerations] — keyboard parity, focus rings, screen-reader semantics (line 575)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.8] — original AC
- [Source: _bmad-output/implementation-artifacts/2-13-paola-authoring-flow-manual-a11y-sweep-voiceover-nvda.md] — parallel PM-surface a11y gate (structure for checklist)
- [Source: _bmad-output/implementation-artifacts/4-4-respondent-landing-page-replacing-the-e3-stub.md] — landing states + routes under test
- [Source: _bmad-output/implementation-artifacts/4-5-kanolikert-component-with-auto-advance-and-keyboard-1-5.md] — component-level a11y contract (fieldset/legend, reduced-motion, keyboard 1–5)
- [Source: _bmad-output/implementation-artifacts/4-6-one-question-per-screen-respondent-flow-with-honest-progress.md] — question flow states + progress bar
- [Source: _bmad-output/implementation-artifacts/4-7-terminal-submit-with-inline-missing-answer-error-and-thank-you-page.md] — submit / thanks / error surfaces + `?showError=1` contract

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
