# Story 1.7: Copy deck scaffold with useCopy composable and inline-literal lint rule

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a solo dev,
I want `src/copy/en.ts` serving as the string-key registry for all user-facing strings, plus a `useCopy()` composable for keyed lookup, plus a lint rule preventing inline literals,
so that the copy deck is a runtime source of truth from day one and no future PR can accidentally bypass it.

## Acceptance Criteria

1. **Given** a Vue template, **when** it renders any user-facing string, **then** the string is sourced via `useCopy('some.key')`, never as an inline literal.
2. `src/copy/en.ts` exports a flat string-key registry; missing keys return the key itself as a visible fallback.
3. Initial copy deck entries exist for: both layouts' chrome (sidebar labels, unsupported-viewport message), common feedback (snackbar success and error, button labels Primary/Secondary/Tertiary), PM category labels (Must-have, Performance, Delighter, Indifferent, Reverse, Questionable), respondent Likert options ("I'd love it", "nice-to-have", "neutral", "can live without it", "would dislike it"), and "Version" terminology (never "Epoch").
4. An ESLint rule flags inline user-facing string literals in `<template>` blocks under `src/routes/` and `src/components/`.
5. `docs/copy-deck.md` exists as the canonical human-readable reference mirroring `src/copy/en.ts`.

## Tasks / Subtasks

- [ ] Create string-key registry (AC: #2, #3)
  - [ ] `src/copy/en.ts` — exports `const en: Record<string, string> = { ... }` with a flat dot-keyed structure
  - [ ] Seed with at minimum:
    - `common.unsupportedViewport` — "This screen needs at least 1280px of horizontal space. Please open on a desktop."
    - `common.snackbar.success` — "Done."
    - `common.snackbar.error` — "Something went wrong. Please try again."
    - `common.button.primary` — (depends on context; prefer per-use keys like `pm.projects.create.cta`)
    - `pm.layout.sidebar.projects` — "Projects"
    - `pm.layout.sidebar.resources` — "Resources"
    - `pm.category.must` — "Must-have"
    - `pm.category.perf` — "Performance"
    - `pm.category.del` — "Delighter"
    - `pm.category.ind` — "Indifferent"
    - `pm.category.rev` — "Reverse"
    - `pm.category.que` — "Questionable"
    - `respondent.likert.1` — "I'd love it"
    - `respondent.likert.2` — "Nice to have"
    - `respondent.likert.3` — "Neutral"
    - `respondent.likert.4` — "I can live without it"
    - `respondent.likert.5` — "I would dislike it"
    - `common.version` — "Version" (copy-deck rule: never "Epoch" in user-facing text)
  - [ ] `src/copy/index.ts` — export default `en`; structure allows a future `fr.ts`, `de.ts`, etc. with minimal refactor
- [ ] `useCopy` composable (AC: #1, #2)
  - [ ] `src/composables/useCopy.ts` — `export function useCopy() { return (key: string): string => en[key] ?? key; }`
  - [ ] Missing-key behavior: return the key itself verbatim (e.g., `useCopy()('pm.nonexistent.key')` → `"pm.nonexistent.key"`). This makes missing strings **visible** on the UI during development without crashing; the ESLint rule (below) prevents new inline literals, but missing-key fallback ensures no white-screen.
  - [ ] Type-safety upgrade (future): mark `key: keyof typeof en` later to get autocomplete; v1 accepts `string` for flexibility.
- [ ] ESLint rule: no inline user-facing literals in templates (AC: #4)
  - [ ] Use `eslint-plugin-vue`'s `vue/no-bare-strings-in-template` rule; enable in `.eslintrc.cjs` with scope `src/routes/**`, `src/components/**`:
    ```js
    overrides: [
      {
        files: ['src/routes/**/*.vue', 'src/components/**/*.vue'],
        rules: {
          'vue/no-bare-strings-in-template': 'error',
        },
      },
    ]
    ```
  - [ ] Exclude `src/layouts/**` is **not** an exclusion — layouts also must use `useCopy`. But `src/theme/`, `src/composables/` have no `<template>` blocks so they're naturally excluded.
  - [ ] Test the rule: introduce a temp `<template><h1>hello</h1></template>` in a test file; assert `npm run lint` fails; remove after verification.
- [ ] Human-readable copy deck reference (AC: #5)
  - [ ] `docs/copy-deck.md` — markdown table: Key | English | Context/usage notes
  - [ ] Generation approach: **hand-maintained for v1** (no codegen). Architecture doesn't mandate automation; the file simply mirrors `en.ts`. Add a PR-template item "updated copy-deck.md when adding strings" (Story 1.1's template already covers this as a checkbox).
- [ ] Integration with Story 1.6
  - [ ] `PmLayout.vue` consumes sidebar labels via `useCopy`
  - [ ] Unsupported-viewport helper renders `useCopy('common.unsupportedViewport')`
  - [ ] If Story 1.6 landed first with placeholder literals, replace them here

## Dev Notes

### Why day-one matters

Architecture §Cross-Cutting Concerns line 78 names copy-deck centralization as load-bearing for both signal integrity (Kano respondent clarity) and future i18n. PRD Growth Features lists i18n as post-MVP; the copy deck is the scaffolding that makes a future i18n migration a **translation effort, not a refactor**.

The ESLint rule is the key enforcement: it makes the "no inline literals" rule automatic, not a code-review convention that drifts.

### The "Version" vs "Epoch" rule

Internally (code, tests, DB, API responses) we use `epoch` — it's a precise term. User-facing (PM UI labels, respondent copy, the `<epoch-selector>` dropdown button text, `<epoch-bump-dialog>` title) we use `Version`. This is a Sally-glossary rule (UX spec §Component Strategy line 882).

Register `common.version = "Version"` and enforce via code review that user-facing strings never contain `Epoch` / `epoch`. The `<epoch-bump-dialog>` will read its title as `useCopy('pm.epochBump.dialog.title')` where the value is `"Create Version {n}?"` (with Vue template interpolation for `{n}`).

### Likert option labels

The five strings ("I'd love it" → "I would dislike it") are the plain-language labels mandated by FR22. They replace the Kano-methodology jargon ("functional/dysfunctional satisfaction on a 1-5 scale"). The `<kano-likert>` component (Story 4-5) consumes `respondent.likert.1`..`respondent.likert.5`.

### Fallback behavior

`useCopy()('nonexistent')` returns `"nonexistent"` — not an exception, not an empty string. This means:

- During development, a missing key shows up as a visible "pm.foo.bar" token on screen — obvious to spot.
- In production, a missing key does the same — graceful degradation rather than crash.

The ESLint rule prevents new inline literals; missing keys are either typos (fixable) or forgotten additions to `en.ts`.

### Interpolation

`useCopy` returns a static string. For strings with placeholders (e.g., "Create Version {n}?"), either:

1. Return the template string; Vue template interpolates in the consumer: `{{ copy('pm.epochBump.title', { n: epoch + 1 }) }}` — requires extending `useCopy` to accept a params object and `String.prototype.replace` the `{key}` tokens.
2. Return the raw template and let the component concatenate.

**Recommended**: option 1, implemented in v1:

```ts
export function useCopy() {
  return (key: string, params?: Record<string, string | number>): string => {
    let str = en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replaceAll(`{${k}}`, String(v));
      }
    }
    return str;
  };
}
```

Kept ~10 LoC. No intl deps in v1.

### Not in scope

- No pluralization engine, no date/time formatting — v1 strings are static.
- No `@intlify/vue-i18n`. Copy deck is not an i18n system in v1 — it's a *keyed registry* that's i18n-**ready**. The leap to a real i18n lib is post-MVP.
- No copy-deck admin UI. Edits happen in `en.ts` via PR.

### Testing standards

- `tests/unit/useCopy.spec.ts` — assert known key returns value; unknown key returns the key itself; params interpolation works for `{n}`-style placeholders
- ESLint rule verification (one-off during implementation): introduce a bare string, run `npm run lint`, confirm fail, revert. Not a committed test.

### Project Structure Notes

Files created:
- `kano-frontend/src/copy/index.ts`, `en.ts`
- `kano-frontend/src/composables/useCopy.ts`
- `kano-frontend/src/composables/useCopy.spec.ts`
- `kano-frontend/.eslintrc.cjs` — **extend**, don't replace; add the overrides block
- `kano-frontend/docs/copy-deck.md` (architecture places this at `docs/copy-deck.md` at repo root — go with repo-root `docs/copy-deck.md` to match §File Organization Patterns line 1006)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Cross-Cutting Concerns] — copy-deck centralization rationale (line 78)
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines] — "Render every user-facing string via the copy-deck useCopy() composable — never inline literal strings in Vue templates" (line 749)
- [Source: _bmad-output/planning-artifacts/architecture.md#File Organization Patterns] — `docs/copy-deck.md` as canonical human reference (line 1006)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Component Strategy] — every custom component sources strings from the copy deck (line 832, 862, 892, 902, 922)
- [Source: _bmad-output/planning-artifacts/prd.md#FR22, FR38] — plain-language Likert labels + human-readable category names
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.7] — original AC source
- [Source: _bmad-output/implementation-artifacts/1-6-vue-spa-scaffold-*.md] — `PmLayout`, `RespondentLayout`, `useApi` — companion files consuming `useCopy`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
