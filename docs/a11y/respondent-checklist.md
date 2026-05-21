# Respondent flow — manual a11y checklist (VoiceOver iOS + TalkBack Android)

**Story:** 4-8
**Status:** Awaiting human execution — Kanaud runs this against the merged Epic 4 build on real iOS + Android devices and signs off below.
**Last updated:** 2026-05-21

This checklist is the manual half of the Epic 4 a11y gate. The automatable
half lives in `kano-frontend/e2e/respondent/a11y.spec.ts` (axe-core +
tap-target audit) and `kano-frontend/e2e/respondent/keyboard-a11y.spec.ts`
(keyboard-only + reduced-motion + focus management). Together they fulfil
PRD §NFR9–11 and the architecture's "WCAG 2.1 AA + axe-core in CI"
enforcement rule.

Parallel to Story 2-13's PM-surface checklist (`paola-authoring-checklist.md`).
The structure mirrors that file for consistency; the **content** is separate
because the persona, devices, and assistive tech differ.

## Environment

| Platform | Browser | Screen reader | Notes |
|---|---|---|---|
| iOS (latest stable + one prior) | Safari | VoiceOver (built-in) | Settings → Accessibility → VoiceOver; triple-press Home/Side to toggle; one-finger swipe right/left to navigate; double-tap to activate; rotor (two-finger twist) → Form Controls / Headings |
| Android (latest stable + one prior) | Chrome | TalkBack (built-in) | Settings → Accessibility → TalkBack; swipe right/left to navigate; double-tap to activate; swipe down-then-right for global menu; reading control swipe up/down for granularity |

**Setup:**

1. Bring the stack up via `docker compose up -d` (Story 1-9).
2. From a desktop, seed a project with 8 features and create a poll
   (PRD-realistic length — exercises the halfway microcopy at the
   meaningful midpoint):
   ```bash
   # Replace UUIDs with real values from the API responses.
   curl -X POST http://localhost:5000/api/v1/projects/ \
     -H 'Content-Type: application/json' \
     -d '{"name": "A11y test", "version": "1.0"}'
   # …add 8 features via /projects/<id>/features, then:
   curl -X POST http://localhost:5000/api/v1/projects/<id>/polls
   ```
3. Note the poll UUID; build the public URL:
   `http://<dev-host>/poll/<poll-uuid>`
4. Throttle to 3G via Chrome DevTools (Android device USB-tethered) or
   Apple Configurator / Network Link Conditioner (iOS device).
5. Set `prefers-reduced-motion: reduce` in each device's OS-level
   accessibility settings for the reduced-motion pass; clear for the
   default pass.

## Per-screen checklist

Mark each row Pass / Fail / Defect. "Defect" = needs a follow-up fix;
cite the GitHub issue in the **Notes** column. Each screen runs twice:
once under VoiceOver/iOS, once under TalkBack/Android.

### Screen: `/poll/:uuid` (live landing, LiveLanding.vue)

| # | Check | VO/iOS | TB/Android | Notes |
|---|---|---|---|---|
| 1 | Page loads; trust line announces with the brand anchor + time cost + value beat |  |  | "Tixeo · 2–3 minutes · shapes our roadmap" |
| 2 | Begin button announces with role=button and accessible name "Begin the poll" |  |  | aria-label is set in LiveLanding.vue |
| 3 | Begin button has initial focus on mount (no extra swipe needed) |  |  | LiveLanding's onMounted hook focuses the ref |
| 4 | Activating Begin (double-tap / Enter / keyboard activation) routes to `/q/0` |  |  | |
| 5 | Tap target ≥ 44×44 on Begin |  |  | Automatable; manual confirmation guards against device-specific overrides |
| 6 | No horizontal scrolling at 360 px |  |  | Pre-checked by axe spec |

### Screen: `/poll/:uuid` (expired, ExpiredPoll.vue)

| # | Check | VO/iOS | TB/Android | Notes |
|---|---|---|---|---|
| 1 | Title announces ("This poll is closed") |  |  | |
| 2 | Body explains in plain language ("The link you used is no longer accepting responses") |  |  | |
| 3 | Mailto contact button announces with role=link and accessible name |  |  | "Get in touch with our product team" |
| 4 | Activating the mailto opens the OS mail client |  |  | iOS Mail / Android default |
| 5 | Tap target ≥ 44×44 on the contact button |  |  | |

### Screen: `/poll/:uuid` (not-found, PollNotFound.vue)

| # | Check | VO/iOS | TB/Android | Notes |
|---|---|---|---|---|
| 1 | Title announces ("We couldn't find that poll") |  |  | |
| 2 | Body suggests typo recovery |  |  | |
| 3 | Mailto off-ramp behaves like the expired screen |  |  | |

### Screen: `/poll/:uuid` (server error, PollLoadError.vue)

| # | Check | VO/iOS | TB/Android | Notes |
|---|---|---|---|---|
| 1 | Title announces ("We couldn't load this poll right now") |  |  | |
| 2 | Body and Retry button announce in order |  |  | |
| 3 | Activating Retry re-issues the GET and resolves to LiveLanding on success |  |  | Force a server 500 by stopping the backend container, then restarting |

### Screen: `/poll/:uuid/q/:index` (Question.vue, mid-flow)

| # | Check | VO/iOS | TB/Android | Notes |
|---|---|---|---|---|
| 1 | Progress label announces ("Question N of 2N") |  |  | |
| 2 | Progress bar exposes aria-valuenow / valuemin / valuemax with current position |  |  | |
| 3 | Feature description (when present) reads in line as a paragraph |  |  | |
| 4 | KanoLikert legend announces the question text interpolated with the feature name |  |  | "How do you feel if Auto-save is available?" |
| 5 | Each of 5 options announces with its plain-language label in order |  |  | |
| 6 | Keyboard 1–5 selects the matching option |  |  | iOS Bluetooth keyboard or TalkBack Braille input |
| 7 | After selection, auto-advance routes to next question (announcement varies by SR) |  |  | |
| 8 | Esc / Backspace navigates back to previous index; previously-selected answer remains selected |  |  | Question.vue's onKeydown |
| 9 | Tap target ≥ 44×44 on every option card |  |  | |
| 10 | Currently focused option has a visible focus ring |  |  | Vuetify default; check both light and dark themes |

### Screen: `/poll/:uuid/q/:index` (halfway, index === N)

| # | Check | VO/iOS | TB/Android | Notes |
|---|---|---|---|---|
| 1 | Halfway microcopy ("Halfway there — this is genuinely helpful") announces once as a polite live region |  |  | role="status" → aria-live="polite" |
| 2 | The announcement does NOT steal focus |  |  | Current question's option still has focus |
| 3 | The microcopy disappears on the next route transition |  |  | v-if unmounts on index change |
| 4 | Under reduced motion: no fade transition |  |  | @media (prefers-reduced-motion: reduce) override |

### Screen: `/poll/:uuid/q/:index?showError=1` (KanoLikert error variant)

| # | Check | VO/iOS | TB/Android | Notes |
|---|---|---|---|---|
| 1 | Error message ("Please select an answer before continuing.") announces with role="alert" |  |  | |
| 2 | Focus stays on the radio group (does not jump to the error text) |  |  | |
| 3 | aria-describedby on the fieldset links to the error message |  |  | KanoLikert.vue's labelId/errorId pattern |
| 4 | First answer selection clears the error (visually and aria) |  |  | router.replace strips ?showError; KanoLikert's showError prop flips |
| 5 | Red border + inline message resolved via Tixeo theme tokens (no hex literals) |  |  | |

### Screen: `/poll/:uuid/submit-confirm` (SubmitConfirm.vue, happy path)

| # | Check | VO/iOS | TB/Android | Notes |
|---|---|---|---|---|
| 1 | Heading "Review & submit" announces on mount |  |  | |
| 2 | Body explains the gate ("You've answered every question") |  |  | |
| 3 | Submit button has initial focus |  |  | SubmitConfirm's onMounted hook |
| 4 | Back button announces with role=button and "Back" accessible name |  |  | |
| 5 | Activating Submit shows the loading state (button disabled + spinner inline) |  |  | |
| 6 | On 204 success, route replaces to `/thanks`; back gesture does NOT return to submit-confirm |  |  | router.replace, not push |
| 7 | Tap targets ≥ 44×44 on both Submit and Back |  |  | |

### Screen: `/poll/:uuid/submit-confirm` (server error variant)

| # | Check | VO/iOS | TB/Android | Notes |
|---|---|---|---|---|
| 1 | On 500: inline alert announces error text |  |  | |
| 2 | Submit button returns to active (not stuck in loading) |  |  | |
| 3 | Retry click re-issues the POST |  |  | |
| 4 | On 422 partial-submission: 800 ms inline notice "Some answers are missing — we've taken you back" announces, then route changes to `/q/<index>?showError=1` |  |  | |
| 5 | On 410 expired: bounce to landing in expired state; draft is discarded |  |  | |

### Screen: `/poll/:uuid/thanks` (Thanks.vue)

| # | Check | VO/iOS | TB/Android | Notes |
|---|---|---|---|---|
| 1 | Title "Thanks — your input is on the record" announces on mount |  |  | |
| 2 | Body explains follow-up ("Your product manager will see this on a short horizon") |  |  | |
| 3 | Heading has initial focus (programmatically focusable via tabindex="-1") |  |  | |
| 4 | NO next-action CTA, share button, or footer link rendered |  |  | Per epics line 1177 + UX-DR25 |
| 5 | Page does not call any API (verify in DevTools Network tab) |  |  | |
| 6 | Page renders correctly even if poll is now expired (unconditional render) |  |  | Backdate `expires_at` mid-flow to test |

## Real-device smoke test (AC #6)

| Device | OS | Browser | 8-feature poll completed end-to-end? | Stuck states? | Viewport jumps? | Keyboard issues? | Tester signoff |
|---|---|---|---|---|---|---|---|
| iPhone (model) | iOS (version) | Safari |  |  |  |  |  |
| Android (model) | Android (version) | Chrome |  |  |  |  |  |

Attach screenshots / a short screen recording as `docs/a11y/respondent-evidence/<device>-<date>.{png,mov}`.

## 3G throttle observations (AC #5 second bullet)

| Path | Acceptable latency? | Loading spinner shown? | Race condition observed? | Notes |
|---|---|---|---|---|
| `/poll/<uuid>` cold load |  |  |  | |
| `/poll/<uuid>/q/3` direct deep-link (Pinia state purged) |  |  |  | |
| Browser refresh mid-flow at `/q/4` |  |  |  | |

## Reduced-motion contract (AC #4)

| Surface | Animation under default | Animation under reduce | Pass? |
|---|---|---|---|
| KanoLikert auto-advance delay | 150 ms confirmation | 0 ms — instant |  |
| `v-progress-linear` fill | Smooth fill transition | No transition |  |
| Halfway microcopy fade-in | 300 ms opacity fade | No transition |  |
| Vuetify alert slide on submit error | Slide-in default | Suppressed |  |

## Focus management (AC #7)

| Route | Initial focus target | Pass? | Notes |
|---|---|---|---|
| `/poll/:uuid` (live) | Begin button |  | LiveLanding onMounted ref focus |
| `/poll/:uuid/q/:index` | First KanoLikert option (Vuetify default) |  | Verify across browsers |
| `/poll/:uuid/q/:index?showError=1` | Radio group (not error text) |  | aria-describedby wires error to group |
| `/poll/:uuid/submit-confirm` | Submit button |  | SubmitConfirm onMounted ref focus |
| `/poll/:uuid/thanks` | Page heading (tabindex="-1") |  | Thanks onMounted heading focus |

## Issue log

| # | Platform | Screen | Severity | Description | Status | Fix commit / follow-up ticket |
|---|---|---|---|---|---|---|
|   |          |        |          |             |        |                                |

Severity calibration:
- **Blocker** — user cannot complete the flow; MUST fix in this story
- **Major** — announcement wrong / missing but flow completable; fix preferred in this story, deferrable with explicit rationale
- **Minor** — subtle mispronunciation / cosmetic; defer to follow-up

## Signoff

| Platform | Tester | Date | Status |
|---|---|---|---|
| VoiceOver / iOS Safari | _Kanaud_ | _YYYY-MM-DD_ | Pending |
| TalkBack / Android Chrome | _Kanaud_ | _YYYY-MM-DD_ | Pending |

**Final signoff statement (to fill in after both passes):**

> All blockers resolved. Non-blockers tracked in: [link to GitHub project / Linear issue list]. Epic 4 a11y gate signed off on [DATE] by Kanaud.

Until this checklist is signed, Story 4-8 is _dev-side ready_ but the
respondent flow has NOT cleared the MVP a11y readiness gate. Same posture
as Story 2-13.
