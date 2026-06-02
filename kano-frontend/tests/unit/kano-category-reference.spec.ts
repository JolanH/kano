// @vitest-environment jsdom
/**
 * KanoCategoryReference — the standing Kano glossary `<aside>` to the right
 * of the "By category" section. Asserts:
 *
 * - All six categories render in the canonical M → O → A → I → R → Q order,
 *   regardless of which categories any poll's data falls into (it's a
 *   glossary, not a data view — the component takes no props).
 * - Each entry's name + description are sourced from the copy deck
 *   (`COPY_KEY` / `DESC_KEY` → en.ts); no inline literals.
 * - The color swatch is decorative (`aria-hidden`) — name + description are
 *   the sole accessible channel (NFR10 / UX spec line 580).
 * - The aside is labelled by its own heading (`aria-labelledby`).
 */

import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'

import KanoCategoryReference from '@/components/KanoCategoryReference.vue'
import { CATEGORY_CODES, COPY_KEY, DESC_KEY, SWATCH_CLASS } from '@/components/kano-categories'
import en from '@/copy/en'

describe('KanoCategoryReference', () => {
  test('renders all six categories in the canonical M → O → A → I → R → Q order', () => {
    const wrapper = mount(KanoCategoryReference)

    const items = wrapper.findAll('.reference-item')
    expect(items).toHaveLength(6)

    const renderedOrder = items.map((item) => item.find('.ref-name').text())
    const expectedOrder = CATEGORY_CODES.map((cat) => en[COPY_KEY[cat]])
    expect(renderedOrder).toEqual(expectedOrder)
  })

  test('each entry pairs the copy-deck name with its copy-deck description', () => {
    const wrapper = mount(KanoCategoryReference)

    for (const cat of CATEGORY_CODES) {
      const item = wrapper.find(`[data-testid="category-reference-item-${cat}"]`)
      expect(item.exists()).toBe(true)
      expect(item.find('.ref-name').text()).toBe(en[COPY_KEY[cat]])
      expect(item.find('.reference-desc').text()).toBe(en[DESC_KEY[cat]])
    }
  })

  test('the color swatch is decorative (aria-hidden) and carries the category class', () => {
    const wrapper = mount(KanoCategoryReference)

    for (const cat of CATEGORY_CODES) {
      const swatch = wrapper
        .find(`[data-testid="category-reference-item-${cat}"]`)
        .find('.ref-swatch')
      expect(swatch.exists()).toBe(true)
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

    // aria-labelledby points at the heading's id.
    const headingId = heading.attributes('id')
    expect(headingId).toBeTruthy()
    expect(aside.attributes('aria-labelledby')).toBe(headingId)
  })
})
