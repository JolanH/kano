# Story 5.3: CatBadge component for Kano category rendering

Status: ready-for-dev

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

- [ ] Component scaffold (AC: #1, #3, #4)
  - [ ] New file `src/components/CatBadge.vue`:
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
  - [ ] Template usage always uses the PascalCase form `<CatBadge :category="c" />` — never `<cat-badge>` (architecture §Naming line 552).
- [ ] `Category` type wire (AC: #1)
  - [ ] Extend `src/api/types.ts` — `export type Category = 'M' | 'L' | 'E' | 'I' | 'C' | 'D'`. If the type already exists from Story 5.1's frontend-type prep (it may not; verify), reuse it. Ensure the 6-letter wire contract is the single source of truth across the frontend.
- [ ] Theme tokens — add Kano palette to Vuetify theme (AC: #2)
  - [ ] Extend `src/theme/tixeo.ts` (Story 1.6's theme definition) to include the 6 Kano category colors as theme tokens:
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
  - [ ] Vuetify 4 exposes custom colors as `var(--v-theme-<name>)` in the DOM — the component's `<style>` block consumes those vars directly (no hex literals in the `.vue` file, per AC #2).
  - [ ] If Story 1.6's theme was already merged without Kano tokens, extend it here; document the extension as intentional (this story is where the palette first enters the theme). If Story 1.6 already included them (check `src/theme/tixeo.ts` on the branch where this story starts), skip the extension and just consume.
- [ ] Copy-deck verification (AC: #1, #7, #8)
  - [ ] Verify `src/copy/en.ts` already has `pm.category.must`, `pm.category.perf`, `pm.category.del`, `pm.category.ind`, `pm.category.rev`, `pm.category.que` — these were seeded by Story 1.7 AC #3. If any are missing (e.g., typo or drift), add them with the human-readable names per UX spec line 482–493:
    - `pm.category.must` → "Must-have"
    - `pm.category.perf` → "Performance"
    - `pm.category.del` → "Delighter"
    - `pm.category.ind` → "Indifferent"
    - `pm.category.rev` → "Reverse"
    - `pm.category.que` → "Questionable"
  - [ ] `docs/copy-deck.md` (Story 1.7 AC #5) — update if any key changed.
- [ ] Theme-audit extension (AC: #5)
  - [ ] Extend `src/routes/dev/ThemeAudit.vue` (Story 1.8) — the Colors section already shows 6 swatches with hex values; add a sibling row rendering `<CatBadge v-for="c in categories" :category="c" :key="c" />` so the theme-audit visually proves the component uses the same tokens as the raw swatches.
  - [ ] Ensure the new row is captured by the Story 1.8 Playwright visual-regression screenshot (`e2e/screenshots/theme-audit-baseline.png`) — re-baseline the snapshot in this PR if the diff is structural (document in PR description).
- [ ] Vitest spec (AC: #7)
  - [ ] `src/components/CatBadge.spec.ts`:
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
  - [ ] The `useCopy` composable may need a test-level setup to resolve keys against the real `en.ts` dict (or a mock). Follow the same test-setup pattern Story 2.10 / 4.5 established; reuse their `src/test/setup.ts` if it exists.
- [ ] ESLint check (from Story 1.7)
  - [ ] The `vue/no-bare-strings-in-template` rule runs over `src/components/**/*.vue` — `CatBadge.vue` contains zero bare strings (the template has only `{{ label }}` interpolations). The lint gate should pass on first run; if it flags anything, refactor to copy-deck.

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
