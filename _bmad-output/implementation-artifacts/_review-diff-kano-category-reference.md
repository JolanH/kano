# Focused diff — Kano category reference panel

> Scope note: the repo's working tree already contained a large uncommitted
> stack (Stories 5-6 / 5-7 and a pie-chart follow-up; `PerCategoryPanels.vue`
> and `per-category-panels.spec.ts` are themselves untracked). The hunks below
> are ONLY the changes introduced by *this* feature — a standing Kano category
> reference panel beside the "By category" section. Pre-existing pie/help code
> is out of scope.

---

## NEW FILE: kano-frontend/src/components/KanoCategoryReference.vue

```vue
<script setup lang="ts">
/**
 * <KanoCategoryReference> — standing Kano glossary rendered as an `<aside>`
 * to the right of the "By category" section (PerCategoryPanels). Lists ALL
 * six categories in the canonical `CATEGORY_CODES` order (M→L→E→I→C→D),
 * each with its theme color swatch, name, and a short Kano-faithful
 * description. This is reference content, not a data view: every category
 * is always present, independent of which categories the poll's features
 * fall into.
 *
 * Accessibility mirrors the codebase's "color + accessible fallback"
 * pairing — the swatch is decorative (`aria-hidden`); the category name and
 * its description are the sole accessible channel (NFR10, UX spec line 580).
 * The aside is labelled by its own heading so a screen reader announces the
 * region before reading the entries.
 *
 * Descriptions come from the `analysis.categoryRef.desc.*` copy namespace —
 * deliberately separate from the terse `pm.category.help.*` CatBadge
 * first-use tooltips (Story 5-7): a standing glossary has room for a fuller
 * sentence than a hover nudge. The swatch class names are shared with
 * CatBadge (`SWATCH_CLASS`) but their background rules are declared locally
 * (scoped styles don't cross component boundaries) — same convention as
 * KanoStackedBar's local `fill-*` map.
 */

import { CATEGORY_CODES, COPY_KEY, DESC_KEY, SWATCH_CLASS } from '@/components/kano-categories'
import { useCopy } from '@/composables/useCopy'

const copy = useCopy()

const HEADING_ID = 'kano-category-reference-heading'
</script>

<template>
  <aside
    class="category-reference"
    :aria-labelledby="HEADING_ID"
    data-testid="kano-category-reference"
  >
    <h3 :id="HEADING_ID" class="reference-heading">
      {{ copy('analysis.categoryRef.heading') }}
    </h3>
    <dl class="reference-list">
      <div
        v-for="cat in CATEGORY_CODES"
        :key="cat"
        class="reference-item"
        :data-testid="`category-reference-item-${cat}`"
      >
        <dt class="reference-term">
          <span :class="['ref-swatch', SWATCH_CLASS[cat]]" aria-hidden="true" />
          <span class="ref-name">{{ copy(COPY_KEY[cat]) }}</span>
        </dt>
        <dd class="reference-desc">{{ copy(DESC_KEY[cat]) }}</dd>
      </div>
    </dl>
  </aside>
</template>

<style scoped>
.category-reference {
  flex: 0 0 300px;
  align-self: flex-start;
  padding: 16px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: 8px;
  background-color: rgb(var(--v-theme-surface-bright));
}
.reference-heading { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
.reference-list { margin: 0; }
.reference-item { margin-bottom: 14px; }
.reference-item:last-child { margin-bottom: 0; }
.reference-term { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.ref-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
.ref-name { font-size: 14px; font-weight: 600; line-height: 1.2; }
.reference-desc { margin: 0; font-size: 13px; line-height: 1.45; color: rgb(var(--v-theme-on-surface-variant)); }
.swatch-must { background-color: rgb(var(--v-theme-category-must)); }
.swatch-perf { background-color: rgb(var(--v-theme-category-perf)); }
.swatch-del  { background-color: rgb(var(--v-theme-category-del)); }
.swatch-ind  { background-color: rgb(var(--v-theme-category-ind)); }
.swatch-cont { background-color: rgb(var(--v-theme-category-cont)); }
.swatch-doub { background-color: rgb(var(--v-theme-category-doub)); }
</style>
```

---

## MODIFIED: kano-frontend/src/components/kano-categories.ts (added block)

```ts
/**
 * Per-category long-form definition surfaced by `<KanoCategoryReference>` —
 * the standing glossary aside beside the "By category" section. Fuller and
 * Kano-textbook-grounded, intentionally distinct from the terse `HELP_KEY`
 * first-use tooltips (different surface, different length budget). The
 * `analysis.categoryRef.desc.*` namespace mirrors the six `CATEGORY_CODES`.
 */
export const DESC_KEY: Record<Category, CopyKey> = {
  M: 'analysis.categoryRef.desc.must',
  L: 'analysis.categoryRef.desc.perf',
  E: 'analysis.categoryRef.desc.del',
  I: 'analysis.categoryRef.desc.ind',
  C: 'analysis.categoryRef.desc.cont',
  D: 'analysis.categoryRef.desc.doub',
}
```

---

## MODIFIED: kano-frontend/src/copy/en.ts (added before the closing `} as const`)

```ts
  // KanoCategoryReference — standing glossary `<aside>` ... (comment trimmed)
  'analysis.categoryRef.heading': 'What the categories mean',
  'analysis.categoryRef.desc.must':
    'A basic expectation. Its absence causes strong dissatisfaction, yet its presence is taken for granted — the price of entry.',
  'analysis.categoryRef.desc.perf':
    'The more, the better. Satisfaction rises and falls in direct proportion to how well this is delivered.',
  'analysis.categoryRef.desc.del':
    "An unexpected extra. Users don't ask for it, but its presence sparks delight and sets the product apart.",
  'analysis.categoryRef.desc.ind':
    'Users are unmoved either way — its presence or absence makes little difference to how satisfied they feel.',
  'analysis.categoryRef.desc.cont':
    "Respondents' paired answers worked against each other, so no stable preference emerged. Treat as inconclusive.",
  'analysis.categoryRef.desc.doub':
    'An extreme or unlikely answer pattern. The signal is questionable until more responses arrive.',
```

(Also: a matching "Kano category reference panel" section with one table row
per key added to `docs/copy-deck.md` — required by the bidirectional
`useCopy.spec.ts` ↔ copy-deck sync gate.)

---

## MODIFIED: kano-frontend/src/components/PerCategoryPanels.vue

Added import:
```ts
import KanoCategoryReference from '@/components/KanoCategoryReference.vue'
```

Template — the existing pie + `v-for` sections were wrapped in a flex layout,
with the reference aside added as a sibling (pie/lists otherwise unchanged):
```vue
    <h2 class="panels-heading">{{ copy('analysis.panels.heading') }}</h2>
    <div class="panels-layout">
      <div class="panels-main">
        <KanoCategoryPie :analysis="analysis" />
        <section v-for="panel in panels" ...> ... unchanged ... </section>
      </div>
      <KanoCategoryReference class="panels-reference" />
    </div>
```

Added CSS:
```css
.panels-layout {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  align-items: flex-start;
}
.panels-main { flex: 1 1 480px; min-width: 0; }
.panels-reference { flex: 0 0 300px; }
```

---

## MODIFIED: kano-frontend/tests/unit/per-category-panels.spec.ts

Added a stub + registered it in `globalStubs`:
```ts
const KanoCategoryReferenceStub = defineComponent({
  setup() {
    return () => h('aside', { 'data-testid': 'kano-category-reference-stub' })
  },
})
const globalStubs = {
  CatBadge: CatBadgeStub,
  KanoCategoryPie: KanoCategoryPieStub,
  KanoCategoryReference: KanoCategoryReferenceStub,
}
```

Added a test:
```ts
test('Kano category reference aside mounts alongside the pie + section lists', () => {
  const wrapper = mount(PerCategoryPanels, {
    global: { stubs: globalStubs },
    props: { analysis: analysis([mkFeature('a','A',['M'],70), mkFeature('b','B',['L'],60)]) },
  })
  expect(wrapper.find('[data-testid="kano-category-reference-stub"]').exists()).toBe(true)
  expect(wrapper.find('[data-testid="kano-category-pie-stub"]').exists()).toBe(true)
  expect(wrapper.findAll('section.category-panel')).toHaveLength(2)
})
```

---

## NEW FILE: kano-frontend/tests/unit/kano-category-reference.spec.ts

```ts
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import KanoCategoryReference from '@/components/KanoCategoryReference.vue'
import { CATEGORY_CODES, COPY_KEY, DESC_KEY, SWATCH_CLASS } from '@/components/kano-categories'
import en from '@/copy/en'

describe('KanoCategoryReference', () => {
  test('renders all six categories in the canonical M → L → E → I → C → D order', () => {
    const wrapper = mount(KanoCategoryReference)
    const items = wrapper.findAll('.reference-item')
    expect(items).toHaveLength(6)
    expect(items.map((i) => i.find('.ref-name').text()))
      .toEqual(CATEGORY_CODES.map((c) => en[COPY_KEY[c]]))
  })

  test('each entry pairs the copy-deck name with its copy-deck description', () => {
    const wrapper = mount(KanoCategoryReference)
    for (const cat of CATEGORY_CODES) {
      const item = wrapper.find(`[data-testid="category-reference-item-${cat}"]`)
      expect(item.find('.ref-name').text()).toBe(en[COPY_KEY[cat]])
      expect(item.find('.reference-desc').text()).toBe(en[DESC_KEY[cat]])
    }
  })

  test('the color swatch is decorative (aria-hidden) and carries the category class', () => {
    const wrapper = mount(KanoCategoryReference)
    for (const cat of CATEGORY_CODES) {
      const swatch = wrapper.find(`[data-testid="category-reference-item-${cat}"]`).find('.ref-swatch')
      expect(swatch.attributes('aria-hidden')).toBe('true')
      expect(swatch.classes()).toContain(SWATCH_CLASS[cat])
    }
  })

  test('the aside heading sources copy and labels the region', () => {
    const wrapper = mount(KanoCategoryReference)
    const aside = wrapper.find('[data-testid="kano-category-reference"]')
    expect(aside.element.tagName).toBe('ASIDE')
    const heading = aside.find('.reference-heading')
    expect(heading.element.tagName).toBe('H3')
    expect(heading.text()).toBe(en['analysis.categoryRef.heading'])
    expect(aside.attributes('aria-labelledby')).toBe(heading.attributes('id'))
  })
})
```
