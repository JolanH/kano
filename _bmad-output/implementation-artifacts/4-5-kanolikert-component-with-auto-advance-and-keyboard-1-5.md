# Story 4.5: KanoLikert component with auto-advance and keyboard 1–5

Status: ready-for-dev

## Story

As Marcus,
I want a single Likert picker that shows me 5 plain-language options stacked vertically, auto-advances when I tap one, and respects my reduced-motion preference,
so that I don't feel interrogated by Next buttons or thrashed by animation.

## Acceptance Criteria

1. **Given** `<KanoLikert :question="'functional' | 'dysfunctional'" :feature="f" v-model="answer" :show-error="boolean" />` is mounted in a respondent-layout context, **when** the component renders, **then** the question text is at respondent body-large (18 px, font-weight 500), ≤ 2 lines, with `aria-label` on the underlying radio group referencing the feature being evaluated — all copy sourced from the copy deck via string keys keyed on `props.question` + `props.feature`.
2. 5 full-width option cards render stacked vertically; each card is ≥ 56 px tall and ≥ 44 px touch target; copy-deck sourced labels in order (top→bottom): "I'd love it" / "nice-to-have" / "neutral" / "can live without it" / "would dislike it" (exact wording per epics line 1126). Selected option has a visible selection state (background color from Tixeo primary token + contrast-safe text).
3. The component wraps Vuetify's `v-radio-group` under the hood (UX-spec §Custom Components line 831) — not a hand-rolled radio implementation. `v-radio-group`'s ARIA + keyboard defaults remain intact where they align with this spec.
4. **When** the user taps an option, **then** the option shows a ~150 ms visual confirmation (color fill + scale transition) and the component emits an `auto-advance` event **after** the animation completes, with the selected value as payload. `v-model` is updated synchronously on selection; the `auto-advance` emit fires at the end of the confirmation transition.
5. **When** `prefers-reduced-motion: reduce` is set (CSS media query detected via `window.matchMedia`), **then** the 150 ms confirmation collapses to an instant state change and the `auto-advance` event fires on the same tick as the selection (no delay, no animation).
6. **Keyboard**: keys `1`–`5` select options 1–5 respectively (works anywhere inside the component's focus scope); Tab focuses the first option; arrow Up/Down navigate between options; Enter/Space selects the focused option. Keyboard selection also triggers auto-advance (same timing as tap).
7. **Error variant**: when `:show-error="true"` (set by Story 4.7's missing-answer guard), the component renders with a red border on the radio group + an inline error message sourced from `copy('respondent.likert.error.unanswered')` below the options, `role="alert"`, `aria-describedby` linking the error to the radio group. Error state clears when the user selects any option.
8. The component ships with a Vitest unit test covering: keyboard `1`–`5` selection, auto-advance emission with correct timing (150 ms default / 0 ms reduced-motion), reduced-motion behavior (JSDOM `matchMedia` mock), error-state render + clearing, and aria-label resolution from the feature + question props.
9. No inline literals — all strings (option labels, error copy, aria-labels) go through `useCopy`; ESLint rule from Story 1.7 enforces.
10. The component is CSS/token-driven: background, border, spacing, color tokens resolve to Vuetify + Tixeo theme vars (Story 1.6's theme setup). No hard-coded hex values; no magic-number pixel math in a `<style scoped>` block except the 56 px height, 48/44 px touch targets, and 150 ms / 18 px / 500 weight magic numbers this AC explicitly names.

## Tasks / Subtasks

- [ ] `src/components/KanoLikert.vue` — component scaffold (AC: #1, #2, #3)
  - [ ] Props:
    ```ts
    interface Props {
      question: 'functional' | 'dysfunctional'
      feature: PollPublicFeature  // { feature_key, name, description }
      modelValue: number | null   // 1–5 selected, or null
      showError?: boolean
      confirmationMs?: number     // default 150; tests override to 0 for speed
    }
    ```
  - [ ] Emits: `update:modelValue` (number), `auto-advance` (number, the selected value)
  - [ ] Template skeleton:
    ```vue
    <template>
      <fieldset
        class="kano-likert"
        :class="{ 'has-error': showError }"
        :aria-describedby="showError ? errorId : undefined"
      >
        <legend class="question" :id="labelId">{{ questionText }}</legend>
        <v-radio-group
          :model-value="modelValue"
          @update:model-value="onSelect"
          :aria-labelledby="labelId"
          hide-details
        >
          <v-radio
            v-for="(opt, idx) in options"
            :key="opt.value"
            :value="opt.value"
            :label="opt.label"
            :data-value="opt.value"
            class="option-card"
          />
        </v-radio-group>
        <p v-if="showError" :id="errorId" class="error-message" role="alert">
          {{ copy('respondent.likert.error.unanswered') }}
        </p>
      </fieldset>
    </template>
    ```
  - [ ] `labelId`/`errorId`: unique per-mount IDs via `useId()` or a prop-fallback pattern; needed for screen-reader wiring
  - [ ] `questionText` computed: resolves `copy(\`respondent.likert.question.\${props.question}\`, { featureName: props.feature.name })` — see copy-deck tasks for key format
- [ ] Option definitions (AC: #2, #6)
  - [ ] Internal constant array (not a prop):
    ```ts
    const options = [
      { value: 1, label: copy('respondent.likert.options.love') },        // "I'd love it"
      { value: 2, label: copy('respondent.likert.options.niceToHave') },  // "nice-to-have"
      { value: 3, label: copy('respondent.likert.options.neutral') },     // "neutral"
      { value: 4, label: copy('respondent.likert.options.liveWithout') }, // "can live without it"
      { value: 5, label: copy('respondent.likert.options.dislike') },     // "would dislike it"
    ]
    ```
  - [ ] Order is fixed top→bottom 1→5 (matches Likert convention from the UX spec; don't randomize)
- [ ] Auto-advance timing (AC: #4, #5)
  - [ ] `useReducedMotion()` composable: `const reducedMotion = ref(window.matchMedia('(prefers-reduced-motion: reduce)').matches)`; also listen for changes via `matchMedia.addEventListener('change', ...)` and update the ref. Can be a local helper or a reusable composable under `src/composables/useReducedMotion.ts` (candidate for reuse in Story 4.6's halfway microcopy + progress bar).
  - [ ] `onSelect(v: number)`:
    ```ts
    emit('update:modelValue', v)
    const delay = reducedMotion.value ? 0 : (props.confirmationMs ?? 150)
    setTimeout(() => emit('auto-advance', v), delay)
    ```
  - [ ] The visual confirmation is CSS-driven — a `<style scoped>` rule that transitions background-color + transform on `[aria-checked="true"]` (v-radio applies this automatically); in reduced-motion mode, override with `transition: none`
- [ ] Keyboard handling (AC: #6)
  - [ ] Attach `@keydown` to the fieldset root; if `key` in `['1','2','3','4','5']`, `onSelect(Number(key))`, `event.preventDefault()` to avoid double-handling
  - [ ] Tab / arrow / Enter / Space: Vuetify's `v-radio-group` handles these out-of-box for its own primitive. Verify in the Vitest test; if Vuetify's arrow-nav is broken in the selected version, file a follow-up and hand-roll arrows — but **do not** reinvent if Vuetify works.
  - [ ] `key` handler lives on the fieldset, not `window`, so opening a dialog (Story 4.7's submit-confirm) doesn't double-trigger
- [ ] Error state (AC: #7)
  - [ ] When `showError=true`, apply `.has-error` class that paints a `2px solid var(--v-error-base)` border on the fieldset
  - [ ] `<p class="error-message" role="alert">` announces the error (screen readers pick up `role="alert"` live region)
  - [ ] On first `update:modelValue`, parent is responsible for resetting `showError` — the component does not manage its own error state (keeps the component pure and the error-clearing logic in Story 4.7's route guard)
- [ ] Copy deck keys — `src/copy/en.ts` (AC: #1, #2, #7)
  - [ ] `respondent.likert.options.love` — "I'd love it"
  - [ ] `respondent.likert.options.niceToHave` — "nice-to-have"
  - [ ] `respondent.likert.options.neutral` — "neutral"
  - [ ] `respondent.likert.options.liveWithout` — "can live without it"
  - [ ] `respondent.likert.options.dislike` — "would dislike it"
  - [ ] `respondent.likert.question.functional` — takes `{featureName}` interpolation. Template: `"How do you feel if {featureName} is available?"` (UX-spec line 831 / epics line 1133)
  - [ ] `respondent.likert.question.dysfunctional` — takes `{featureName}`: `"How do you feel if {featureName} is not available?"`
  - [ ] `respondent.likert.error.unanswered` — "Please select an answer before continuing."
  - [ ] `respondent.likert.group.ariaLabel` — optional if `aria-labelledby` approach covers it; include only if needed
  - [ ] Story 1.7's `useCopy(key, vars)` signature supports `{variableName}` interpolation — use it for the question keys
- [ ] Vitest spec: `src/components/KanoLikert.spec.ts` (AC: #8)
  - [ ] Mount with `confirmationMs: 0` (remove the timing dependency in tests)
  - [ ] Renders 5 v-radio options with labels in the correct order
  - [ ] `v-model` updates on click: assert `update:modelValue` emitted with correct number
  - [ ] `auto-advance` emitted after `update:modelValue`
  - [ ] Keyboard: simulate `keydown` with key `'1'`, `'5'` → assert selection + auto-advance
  - [ ] Reduced-motion: mock `window.matchMedia('(prefers-reduced-motion: reduce)').matches = true`; assert auto-advance fires on same tick (no setTimeout delay)
  - [ ] Error state: mount with `showError=true`; assert `.has-error` class present, error message rendered, `role="alert"`
  - [ ] Error clears: select an option → parent responsibility, but the component rendered without `.has-error` when `showError` prop flips to false (test via prop update)
  - [ ] `aria-labelledby` resolves to the legend's `id`; legend text matches the interpolated question
- [ ] Token-driven styling check (AC: #10)
  - [ ] Open `KanoLikert.vue` `<style scoped>` — grep for hex literals; fail review if any appear outside the 3-4 explicit magic numbers listed in AC #10
  - [ ] Background, border, active states all resolve via `var(--v-theme-primary)`, `var(--v-theme-surface)`, etc. (Vuetify 4 CSS var convention)

## Dev Notes

### Option labels — lowercase is intentional

"I'd love it" (leading cap) vs "nice-to-have" / "neutral" / "can live without it" / "would dislike it" (all lowercase). The UX spec line 831 doesn't specify, but epics line 1126 mirrors the respondent-body-large tone: conversational, not interrogative. Don't "correct" the lowercase to title case during implementation — the copy deck is the source of truth, and a future review can change all five consistently if needed.

### Confirmation timing — why 150 ms

150 ms is the UX spec's lower bound for "visible feedback without feeling laggy." Auto-advance after this delay lets Marcus see the confirmation animate before the next question replaces it — perceived stability, not a jarring cut. `confirmationMs` prop lets tests override to 0; production stays at 150.

**Do not fire auto-advance on v-model update** — fire after the setTimeout resolves. Otherwise the parent route transitions before the visual confirmation finishes, and the animation is cut mid-stride.

### Reduced motion

Per WCAG 2.1 and PRD NFR9, `prefers-reduced-motion: reduce` must neutralize animations. Two effects collapse: the 150 ms setTimeout becomes 0, AND the CSS transition on the option card is zeroed via a media query:
```scss
@media (prefers-reduced-motion: reduce) {
  .option-card[aria-checked="true"] { transition: none; }
}
```

Test this in JSDOM: mock `window.matchMedia` returning `matches: true`, verify `auto-advance` fires synchronously. Real-browser validation is Story 4.8's manual a11y gate.

### Why `v-radio-group`, not `<input type="radio">`

UX spec line 831 + architecture §Component Strategy locks Vuetify primitives under our custom components. `v-radio-group` gives us:
- ARIA `role="radiogroup"` on the wrapper
- Arrow-key navigation between radios
- Focus ring via Vuetify's theme
- `hide-details` to suppress the trailing helper-text slot we don't need

Hand-rolling radios would reinvent all four, break visual parity with other PM-side radios in the app, and fight Vuetify's CSS var system. Don't.

### `fieldset` + `legend` = the accessibility contract

Screen readers announce legends when a fieldset's radios gain focus. Using `<fieldset>` + `<legend>` for the question text is the WCAG-preferred pattern for grouped controls. The `aria-labelledby` backup on `v-radio-group` is belt-and-braces — some SR / browser combos read the legend; some read the aria-labelledby. Both cover more cases.

### The error state is "dumb" — error clearing lives in the parent

This component does not auto-clear its own error. When `showError=true` and the user selects an option, the parent (Story 4.7's router guard / Story 4.6's question component) observes the `update:modelValue` emit and must reset `showError=false` itself. This keeps KanoLikert a pure controlled-input pattern — no internal state coupling — and lets the parent decide whether clearing the error should be reactive (on first keypress) or deferred (on next submit attempt).

Epics line 1134 says "In the `error` variant … a red border + inline error message is rendered; copy-deck sourced" — does not say the component clears itself.

### 1–5 keyboard scoping

Epics line 1132: "keyboard `1`–`5` picks options 1–5 respectively; Tab focuses the first option; arrow keys navigate between options." Scope the `1`–`5` handler to the component's fieldset, not the global window. Otherwise a Story 4.7 dialog that also wants to use `1`–`5` for quick-access would double-trigger.

Vuetify's `v-radio-group` covers Tab / arrow / Enter / Space natively in v4. Verify on the selected Vuetify version (architecture line 380 locks 4.x). If a regression exists, hand-roll only the broken piece with a code comment pointing at the Vuetify issue.

### Feature-name interpolation in the aria-label

The aria-label is "How do you feel if SSO is available?" style — literal feature name embedded. This is the single reason the component needs `props.feature` and not just `props.featureName` (we also need `feature_key` for the emits, if we choose to include it in the payload — but current emit contract just emits the value).

**Do not** embed the feature description in the aria-label. Descriptions can be long; aria-labels should be short. If Marcus wants the description, it renders on-screen next to the question (Story 4.6's job) or is read out via a companion `aria-describedby` (deferred to Story 4.8 if screen-reader testing shows it's needed).

### Not in scope

- The progress bar / per-question layout — Story 4.6
- Submit flow + missing-answer route guard — Story 4.7
- VoiceOver / NVDA / TalkBack manual verification — Story 4.8
- Translations / i18n runtime — Post-MVP per PRD
- Drag-based selection (stacked bar sliders, etc.) — not a v1 pattern

### Project Structure Notes

Files:
- `kano-frontend/src/components/KanoLikert.vue` (new)
- `kano-frontend/src/components/KanoLikert.spec.ts` (new)
- `kano-frontend/src/composables/useReducedMotion.ts` (new; small helper — or inline if preferred)
- Extend `kano-frontend/src/copy/en.ts` (keys listed above)

Note: `KanoLikert` lives in `src/components/`, not `src/routes/poll/` — despite being respondent-only. Rationale:
- UX spec §Custom Components (line 825) defines it as a shared custom component
- The bundle-isolation gate from Story 3.8 ensures PM bundles don't accidentally import it
- Consistency with the other 9 custom components (`CatBadge`, `KanoStackedBar`, etc.) which all live in `src/components/`

The bundle gate still catches accidental PM-side imports because `KanoLikert` is itself only imported by `/poll/*` routes; Vite's code-splitting keeps it in the respondent chunk.

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR21, FR22] — functional + dysfunctional + 5-point Likert with plain-language labels
- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — WCAG 2.1 AA + reduced-motion + axe-core
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — Vuetify-wrapping strategy (line 398–411)
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns] — Vue component `PascalCase.vue` (line 551)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Custom Components] — `<kano-likert>` spec (line 825–834)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component Implementation Strategy] — composition-over-inheritance; copy-deck integration; testability (line 925–931)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.5] — original AC + exact option labels + keyboard contract
- [Source: _bmad-output/implementation-artifacts/1-6-vue-spa-scaffold-with-tixeo-vuetify-theme-two-layouts-and-useapi-composable.md] — Vuetify theme tokens + `useApi`
- [Source: _bmad-output/implementation-artifacts/1-7-copy-deck-scaffold-with-usecopy-composable-and-inline-literal-lint-rule.md] — `useCopy`, interpolation, ESLint gate
- [Source: _bmad-output/implementation-artifacts/2-10-featurelisteditor-inline-first-authoring-component.md] — component-authoring precedent (Vuetify-wrap + Vitest + copy-deck discipline)
- [Source: _bmad-output/implementation-artifacts/3-1-poll-sqlalchemy-model-and-pydantic-schemas.md] — `PollPublicFeature` shape consumed as `props.feature`
- [Source: _bmad-output/implementation-artifacts/3-8-respondent-landing-stub-with-expired-page-handling.md] — bundle-isolation gate

## Dev Agent Record

### Agent Model Used
{{agent_model_name_version}}
### Debug Log References
### Completion Notes List
### File List
