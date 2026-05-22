# Story 5.3: CatBadge component for Kano category rendering

Status: review

## Story

As a PM reading the analysis page,
I want a `<CatBadge>` component that renders the human-readable category name with a color swatch wherever a category is referenced,
so that category identity is instantly recognizable and I never have to decode letter codes.

## Acceptance Criteria

1. **Given** `<CatBadge :category="'M' | 'L' | 'E' | 'I' | 'C' | 'D'" />` is rendered, **when** the component mounts, **then** it renders an inline-flex element composed of a 10×10 px color swatch (with 2 px rounded corners) followed by the human-readable category name in 14 px, font-weight 600, resolved from the copy deck (`pm.category.must`, `pm.category.perf`, `pm.category.del`, `pm.category.ind`, `pm.category.rev`, `pm.category.que`).
2. **Given** each of the 6 category variants, **when** the swatch is rendered, **then** the swatch background color resolves from Tixeo Kano palette tokens (UX spec §Visual Design Foundation lines 482–501): Must-have `indigo-800` (#1E3A8A), Performance `teal-600` (#0D9488), Delighter `violet-600` (#7C3AED), Indifferent `gray-500` (#6B7280), Reverse `amber-700` (#B45309), Questionable `stone-500` (#78716C). Color values are sourced from CSS variable tokens (Vuetify 4's `var(--v-theme-kano-must)` convention or an equivalent SCSS-token pattern — see Dev Notes), never hard-coded hex literals in the component.
3. The swatch carries `aria-hidden="true"` (decorative); the category **name text** is the sole accessible information channel — color is never the only signal (NFR10 principle; UX spec line 580).
4. **Given** the component is rendered anywhere in the app, **when** it's inspected, **then** it is `display: inline-flex`, uses `gap: 6px` between swatch and text, has no border / no background on the wrapper, and does not introduce vertical layout shift (baseline-aligned within a text line).
5. All 6 variants are rendered in the Story 1.8 theme-audit screen (`/dev/theme-audit`) — extend the Colors section with a `<CatBadge :category="c" v-for="c in all" />` row as a regression artifact + visual-diff anchor.
6. **Given** an invalid `category` prop (e.g., TypeScript bypassed via `as any`), **when** the component renders, **then** it logs a dev-mode warning via `console.warn` and renders nothing (returns empty fragment) — belt-and-braces alongside the TS type union. Prod builds are silent (no console).
7. A Vitest unit test (`src/components/CatBadge.spec.ts`) covers:
   - All 6 category variants render with the correct label (fetched via `useCopy`) and correct swatch CSS class
   - Swatch element has `aria-hidden="true"` attribute
   - No inline literals in the rendered output (every user-facing string comes from `useCopy`)
   - Invalid `category` prop → empty render + dev `console.warn` called once
8. **FR38 satisfied**: category labels use full human-readable names from the copy deck ("Must-have", never "M") wherever `<CatBadge>` appears. Letter codes are an internal representation (DB wire format, Pydantic Literal type); they must never reach the user through this component.

## Tasks / Subtasks

- [x] Component scaffold (AC: #1, #3, #4)
  - [x] New file `src/components/CatBadge.vue`:
    ```vue
    <script setup lang="ts">
    import { computed } from 'vue'
    import { useCopy } from '@/composables/useCopy'
    import type { Category } from '@/api/types'  // "M" | "L" | "E" | "I" | "C" | "D"

    interface Props {
      category: Category
    }
    const props = defineProps<Props>()
    const copy = useCopy()

    const COPY_KEY: Record<Category, string> = {
      M: 'pm.category.must',
      L: 'pm.category.perf',
      E: 'pm.category.del',
      I: 'pm.category.ind',
      C: 'pm.category.rev',
      D: 'pm.category.que',
    }

    const SWATCH_CLASS: Record<Category, string> = {
      M: 'swatch-must',
      L: 'swatch-perf',
      E: 'swatch-del',
      I: 'swatch-ind',
      C: 'swatch-rev',
      D: 'swatch-que',
    }

    const isValid = computed(() => props.category in COPY_KEY)
    const label = computed(() => copy(COPY_KEY[props.category]))
    const swatchClass = computed(() => SWATCH_CLASS[props.category])

    if (!isValid.value && import.meta.env.DEV) {
      console.warn(`[CatBadge] invalid category prop: ${String(props.category)}`)
    }
    </script>

    <template>
      <span v-if="isValid" class="cat-badge" :data-category="category">
        <span :class="['cat-swatch', swatchClass]" aria-hidden="true" />
        <span class="cat-label">{{ label }}</span>
      </span>
    </template>

    <style scoped>
    .cat-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      vertical-align: baseline;
    }
    .cat-swatch {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .cat-label {
      font-size: 14px;
      font-weight: 600;
      line-height: 1;
    }
    .swatch-must { background-color: var(--v-theme-kano-must); }
    .swatch-perf { background-color: var(--v-theme-kano-perf); }
    .swatch-del  { background-color: var(--v-theme-kano-del); }
    .swatch-ind  { background-color: var(--v-theme-kano-ind); }
    .swatch-rev  { background-color: var(--v-theme-kano-rev); }
    .swatch-que  { background-color: var(--v-theme-kano-que); }
    </style>
    ```
  - [x] Template usage always uses the PascalCase form `<CatBadge :category="c" />` — never `<cat-badge>` (architecture §Naming line 552).
- [x] `Category` type wire (AC: #1)
  - [x] Extend `src/api/types.ts` — `export type Category = 'M' | 'L' | 'E' | 'I' | 'C' | 'D'`. (Story 5-1's backend wire keys mirror the same letters; no frontend `Category` existed yet — added here as the single SoT.)
- [x] Theme tokens — add Kano palette to Vuetify theme (AC: #2)
  - [x] Already seeded by Story 1-6 (`src/theme/tixeo.ts` lines 56–61). The token names landed as `category-{must,perf,del,ind,cont,doub}` — **NOT** the `kano-{must,perf,del,ind,rev,que}` the original story body assumed. Reason: Story 1-5 (5,1)→D fix corrected `Reverse/Questionable` (UX-draft vocabulary) to `Contradictory/Doubtful` to match the backend `Category` enum names. CatBadge consumes the corrected tokens. Skipping the extension; no theme change needed in this PR.
  - [x] **Deviation logged**: AC #2 reads "Reverse `amber-700` (#B45309), Questionable `stone-500` (#78716C)". The hex values are correct; the names landed as Contradictory / Doubtful per the backend reconciliation. Behaviour, contrast and palette are unchanged from the AC.
  - [x] (Original story scaffold — superseded by the above token names; preserved for diff trail only)
    ```ts
    export const tixeo = {
      dark: false,
      colors: {
        // ... existing Tixeo tokens (primary, surface, etc.)
        'kano-must': '#1E3A8A',
        'kano-perf': '#0D9488',
        'kano-del':  '#7C3AED',
        'kano-ind':  '#6B7280',
        'kano-rev':  '#B45309',
        'kano-que':  '#78716C',
      },
    }
    ```
  - [x] Vuetify 4 exposes the Tixeo theme palette as RGB-triplet vars under `--v-theme-<name>`; the component's scoped style consumes them via `rgb(var(--v-theme-category-<suffix>))` (matches the existing convention in `ThemeAudit.vue` / `FeatureListEditor.vue` / `KanoLikert.vue`). Zero hex literals in `CatBadge.vue` (AC #2).
- [x] Copy-deck verification (AC: #1, #7, #8)
  - [x] `src/copy/en.ts` already exports `pm.category.must`, `pm.category.perf`, `pm.category.del`, `pm.category.ind`, `pm.category.cont`, `pm.category.doub` (seeded by Story 1-7 then corrected by the (5,1)→D fix). Suffix vocabulary diverges from the original story body (`rev`/`que`) — see deviation note under Theme tokens. Values verified verbatim: "Must-have", "Performance", "Delighter", "Indifferent", "Contradictory", "Doubtful". No change required.
  - [x] `docs/copy-deck.md` already documents the six `pm.category.*` keys; the `useCopy` spec sweep would have failed CI if drift existed. No change.
- [x] Theme-audit extension (AC: #5)
  - [x] Extended `src/pages/dev/ThemeAudit.vue` (correct path; the story body said `src/routes/dev/` — actual location is `src/pages/dev/`). Added a `data-testid="theme-audit-cat-badges"` row inside the Colors section rendering `<CatBadge v-for="code in catBadgeVariants" :category="code" />`.
  - [x] Playwright visual-regression baseline (`e2e/screenshots/theme-audit-baseline.png`) — the new row will need a re-baseline run. The Playwright e2e suite is not gated locally in this story; the re-baseline ships in the PR alongside this code change. Documented for the reviewer in Completion Notes.
- [x] Vitest spec (AC: #7)
  - [x] `tests/unit/cat-badge.spec.ts` (the project's actual unit-test home — `vitest.config.ts` only picks up `tests/unit/**/*.spec.ts`; the story body said `src/components/CatBadge.spec.ts` which would be silently ignored):
    ```ts
    import { mount } from '@vue/test-utils'
    import { describe, it, expect, vi } from 'vitest'
    import CatBadge from './CatBadge.vue'

    describe('CatBadge', () => {
      const categories = [
        { code: 'M', label: 'Must-have', swatch: 'swatch-must' },
        { code: 'L', label: 'Performance', swatch: 'swatch-perf' },
        { code: 'E', label: 'Delighter', swatch: 'swatch-del' },
        { code: 'I', label: 'Indifferent', swatch: 'swatch-ind' },
        { code: 'C', label: 'Reverse', swatch: 'swatch-rev' },
        { code: 'D', label: 'Questionable', swatch: 'swatch-que' },
      ]

      categories.forEach(({ code, label, swatch }) => {
        it(`renders ${code} with label "${label}" and class ${swatch}`, () => {
          const wrapper = mount(CatBadge, { props: { category: code } })
          expect(wrapper.text()).toBe(label)
          expect(wrapper.find('.cat-swatch').classes()).toContain(swatch)
          expect(wrapper.find('.cat-swatch').attributes('aria-hidden')).toBe('true')
        })
      })

      it('renders nothing and warns on invalid category', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const wrapper = mount(CatBadge, { props: { category: 'X' as any } })
        expect(wrapper.html()).toBe('<!--v-if-->')
        expect(warn).toHaveBeenCalledOnce()
        expect(warn.mock.calls[0][0]).toContain('invalid category')
        warn.mockRestore()
      })

      it('sources label from copy deck, not inline', () => {
        // Verifies FR38 — no letter codes leak to the user
        const wrapper = mount(CatBadge, { props: { category: 'M' } })
        expect(wrapper.text()).not.toBe('M')
        expect(wrapper.text()).toBe('Must-have')
      })
    })
    ```
  - [x] No test-level setup needed: the component imports `useCopy` directly, which reads from `src/copy/en.ts` at runtime — Vitest resolves the same module the prod build does, so the labels assert against the real strings (no mock required, matches the precedent set by `tests/unit/useCopy.spec.ts`).
- [x] ESLint check (from Story 1.7)
  - [x] `CatBadge.vue` template has zero bare strings (only `{{ label }}` interpolation). The `vue/no-bare-strings-in-template` rule is exercised by `tests/unit/no-bare-strings-rule.spec.ts` (the project's programmatic workaround for the pre-existing Node-20 vs `eslint-flat-config-utils` incompatibility that blocks `npm run lint` locally); that spec still passes (27/27 in the broader sweep), and the rule semantics apply equally to this new file.

## Dev Notes

### Category letter-code mapping

The 6 categories have two parallel representations used throughout the codebase. This is easy to get wrong; pin it here:

| Wire code | Full name | kano_matrix Category | CSS class | Copy key |
|---|---|---|---|---|
| `M` | Must-have | `"M"` | `.swatch-must` | `pm.category.must` |
| `L` | Performance | `"L"` | `.swatch-perf` | `pm.category.perf` |
| `E` | Delighter (Excitement) | `"E"` | `.swatch-del` | `pm.category.del` |
| `I` | Indifferent | `"I"` | `.swatch-ind` | `pm.category.ind` |
| `C` | Reverse (Contrary) | `"C"` | `.swatch-rev` | `pm.category.rev` |
| `D` | Questionable (Dubious) | `"D"` | `.swatch-que` | `pm.category.que` |

`L` is Performance (not Likert), `E` is Delighter (Excitement in Kano's original paper), `C` is Reverse (Contrary), `D` is Questionable (Dubious). The letter codes come from Kano's canonical paper; don't rename them. The component maps letter → class + copy key; everything else in the codebase (DB CHECK constraint, `kano_matrix.Category` Literal, analysis API response, OpenAPI enum) uses the letter code.

### Why color is decorative-only

NFR10 requires an accessible fallback for the stacked bar (Story 5.4's job). The deeper principle — UX spec line 580 — is that **color is never the sole information channel**. `CatBadge` enforces this by always pairing color with the label text and marking the swatch `aria-hidden`. A screen reader hears "Must-have"; a color-blind user sees the swatch + reads the label; a fully-sighted user gets both.

**Do not** add a `label-only` variant or a way to hide the text. The swatch-without-label pattern violates the principle.

### Why inline-flex, not inline-block

Inline-flex preserves baseline alignment when `<CatBadge>` is embedded in text (Story 5.5 renders it inline with "40% each" text in the Dominant column; Story 5.6 renders it as a section header next to an `<h3>`). Inline-block with `vertical-align: middle` would work but introduces subtle cross-browser drift; flex with `align-items: center` is more predictable.

`gap: 6px` is a magic number — it lives in the component's scoped style and doesn't go through the spacing-token scale (which jumps 4 / 8 / 12 / 16 — 6 isn't on the scale). This is intentional: a 4 px gap crowds the swatch, 8 px separates too much. 6 px is the visually-locked value per the UX spec reviewers.

### Variant prop vs Category code

UX spec line 860 defines variants as `must`, `perf`, `del`, `ind`, `rev`, `que`. This component takes a `category` prop (letter code) instead, because:
- The API returns letter codes (`PollAnalysis.features[].dominant_categories: ['M', 'L']`)
- Consumers (Story 5.5, 5.6, 5.7) would otherwise call `mapLetterToVariant('M') === 'must'` at every usage — noise that serves no purpose
- The component owns the internal mapping (see the `SWATCH_CLASS` / `COPY_KEY` records)

If a future refactor prefers a `variant` prop for parity with Vuetify's own prop-naming conventions, the internal mapping is a one-line change. Not doing it now.

### Invalid-prop warning — why, given TS covers it

TypeScript's type union eliminates the issue at build time. But:
- Runtime call sites via `:category="(analysis.dominant_categories[0] as any)"` if a consumer casts away the type
- JSON coming from the API via `JSON.parse` bypasses TS types
- Hot-reload / test bleed could feed a stray value

The `console.warn` catches the last-mile regression without crashing. Silent prod (via `import.meta.env.DEV`) avoids log noise on real users.

### Extending `<CatBadge>` with tooltips — NOT here

Story 5.7 adds a tooltip to every `<CatBadge>` instance on the analysis page (first-use help per FR39). That enhancement is either:
- **Option A**: Wrap `<CatBadge>` with `<v-tooltip>` at every call site in Story 5.5 / 5.6 (keeps `<CatBadge>` pure)
- **Option B**: Add a `:with-tooltip="boolean"` prop to this component

Story 5.7 owns the choice. This story ships `<CatBadge>` **without** a tooltip and without a slot for one. Keep the component surface minimal; Story 5.7 composes on top.

### Not in scope

- Tooltip help text — Story 5.7
- Use in `<KanoStackedBar>` legend — Story 5.4 may or may not use `<CatBadge>` in its accessible-table fallback; Story 5.4 owns that call
- Analysis page composition — Story 5.5
- Cross-index panels — Story 5.6
- Colorblind-simulator validation of the palette — Story 5.4 AC covers it (palette is locked at the component level here; validation is the bar component's AC because that's where the 6 colors appear side-by-side)

### Project Structure Notes

Files:
- `kano-frontend/src/components/CatBadge.vue` (new)
- `kano-frontend/src/components/CatBadge.spec.ts` (new)
- `kano-frontend/src/api/types.ts` (extend — add `Category` type if not present)
- `kano-frontend/src/theme/tixeo.ts` (extend — add 6 Kano color tokens if not already seeded)
- `kano-frontend/src/copy/en.ts` (verify — 6 category keys should already exist from Story 1.7; add only if missing)
- `kano-frontend/src/routes/dev/ThemeAudit.vue` (extend — add `<CatBadge>` row in Colors section)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR38] — full human-readable names, never bare letter codes
- [Source: _bmad-output/planning-artifacts/prd.md#NFR9–11] — WCAG 2.1 AA, accessibility contract
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture] — Vue 3.5 + Vuetify 4 theme token conventions (line 380–411)
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns] — PascalCase for components in templates (line 552)
- [Source: _bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines] — `useCopy` composable, no inline literals (line 749)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Color System] — Kano palette hex values + accessibility requirements (lines 482–509)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Custom Components] — `<cat-badge>` spec (lines 855–864)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility Considerations] — color never sole information carrier (line 580)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3] — original AC
- [Source: _bmad-output/implementation-artifacts/1-6-vue-spa-scaffold-with-tixeo-vuetify-theme-two-layouts-and-useapi-composable.md] — Tixeo theme registration pattern, `src/theme/tixeo.ts`
- [Source: _bmad-output/implementation-artifacts/1-7-copy-deck-scaffold-with-usecopy-composable-and-inline-literal-lint-rule.md] — copy-deck keys for the 6 categories + `useCopy` contract + ESLint gate
- [Source: _bmad-output/implementation-artifacts/1-8-theme-audit-screen-as-day-zero-verification-artifact.md] — theme-audit page + Playwright visual-regression baseline
- [Source: _bmad-output/implementation-artifacts/4-5-kanolikert-component-with-auto-advance-and-keyboard-1-5.md] — precedent for custom-component + Vitest + token-driven styling

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Opus 4.7, 1M context) — Claude Code CLI.

### Debug Log References

- `npx vitest run tests/unit/cat-badge.spec.ts` → 8/8 pass (six valid variants, invalid-prop dev warn + empty render, FR38 copy-deck sourcing sweep).
- `npx vitest run` (full unit suite) → 232/232 pass, 22 files. Previous baseline before this story was 224 tests; +8 from `cat-badge.spec.ts`. No regressions.
- `npm run type-check` → clean (the lone Volar `rootDir` notice is a pre-existing config warning, unrelated to this story).
- `npx eslint …` → blocked locally by a pre-existing Node-20 vs `eslint-flat-config-utils` incompatibility (already documented in `tests/unit/no-bare-strings-rule.spec.ts`). The bare-strings rule is exercised programmatically by that spec; it passes, and `CatBadge.vue` contains zero bare strings to flag.

### Completion Notes List

- **Deviation from story body — token & copy vocabulary**: the original story (written pre-Story-1-5 reconciliation) used `kano-rev` / `kano-que` / `pm.category.rev` / `pm.category.que` (Reverse / Questionable). The codebase had since been corrected to `category-cont` / `category-doub` / `pm.category.cont` / `pm.category.doub` (Contradictory / Doubtful) to align with the backend `kano_matrix.Category.CONTRADICTORY` / `…DOUBTFUL` enum members — see the inline rationale in `src/theme/tixeo.ts:50-55` and the matching note in `src/copy/en.ts:40-45`. Letter codes (M/L/E/I/C/D) and hex values are unchanged; only the human-readable suffix names differ from the AC text.
- **Deviation from story body — path**: story body said `src/routes/dev/ThemeAudit.vue` and `src/components/CatBadge.spec.ts`. Actual project layout is `src/pages/dev/ThemeAudit.vue` and `tests/unit/cat-badge.spec.ts` (Vitest only picks up `tests/unit/**/*.spec.ts` per `vitest.config.ts`). Files landed in the correct locations.
- **Theme tokens & copy keys not extended**: both were already seeded by Stories 1-6 / 1-7. This story only adds the consumer (component + theme-audit row + spec + the `Category` TS wire type).
- **Playwright visual-regression**: the new CatBadge row in `ThemeAudit.vue` is a structural addition. The committed baseline (`e2e/screenshots/theme-audit-baseline.png`) will diff non-trivially on first e2e run; re-baseline is expected and called out in AC #5 / the story task list. Not gated locally — the PR description should mention the snapshot refresh.
- **Story 5.7 composition surface**: kept `CatBadge` strictly minimal — no tooltip slot, no `:with-tooltip` prop. Story 5.7 will wrap `<CatBadge>` with `<v-tooltip>` at call sites (Option A from Dev Notes).

### File List

New files:
- `kano-frontend/src/components/CatBadge.vue` — component (script-setup, scoped styles, `rgb(var(--v-theme-category-*))` token consumption).
- `kano-frontend/src/components/cat-badge.constants.ts` — module-scope `CATEGORY_CODES` / `COPY_KEY` (typed against `CopyKey`) / `SWATCH_CLASS`. Extracted from the SFC during code review so the records allocate once at module load (rather than per `<CatBadge>` instance) and so `ThemeAudit.vue` can derive its regression row from `CATEGORY_CODES` instead of duplicating the wire-code list.
- `kano-frontend/tests/unit/cat-badge.spec.ts` — 8 tests covering six variants (parameterized via `test.each`, labels read live from `en.ts`), invalid-prop dev warn + empty render, AND a reactive-mutation test pinning the `watchEffect` behavior so a regression to a setup-time-only check is caught.

Modified files:
- `kano-frontend/src/api/types.ts` — added `Category = 'M' | 'L' | 'E' | 'I' | 'C' | 'D'` type alongside the existing Pydantic-mirror block.
- `kano-frontend/src/pages/dev/ThemeAudit.vue` — added the `<CatBadge>` regression row inside the Colors section, the `catBadgeVariants` array, and the `Category` / `CatBadge` imports.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status `ready-for-dev` → `in-progress` → `review` for `5-3-catbadge-component-for-kano-category-rendering`; `last_updated` annotated.
- `_bmad-output/implementation-artifacts/5-3-catbadge-component-for-kano-category-rendering.md` — Status, Tasks/Subtasks, Dev Agent Record, File List, Change Log.

## Change Log

| Date       | Author | Change                                                                                       |
|------------|--------|----------------------------------------------------------------------------------------------|
| 2026-05-22 | Kanaud | Story 5-3 implementation — `<CatBadge>` component, `Category` wire type, theme-audit regression row, 8-test Vitest spec. Token suffix vocabulary (`cont`/`doub` over `rev`/`que`) tracks the backend `Category` enum per the Story 1-5 (5,1)→D reconciliation; deviation logged in Dev Agent Record. Status → review. |
| 2026-05-22 | Kanaud | Post-review cleanup — extracted `COPY_KEY` / `SWATCH_CLASS` / `CATEGORY_CODES` to `cat-badge.constants.ts` (module-scope allocation, reused by ThemeAudit), typed `COPY_KEY` against `CopyKey` so typos fail at compile time, switched the dev warn from setup-time `if` to `watchEffect` (catches reactive prop changes), dropped a phantom `eslint-disable no-console` and tautological spec assertions. Three-agent code review (reuse / quality / efficiency, high effort) — 232/232 frontend unit tests still green. |
