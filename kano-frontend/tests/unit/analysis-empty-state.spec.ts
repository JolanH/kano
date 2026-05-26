// @vitest-environment jsdom
/**
 * AnalysisEmptyState (Story 5-5) — FR37 full-table replacement when
 * `total_submissions === 0`. Pins the copy-deck wording (per Story
 * Recommendation A: drop the `{expected}` interpolation) and the
 * test-id used by the page-level branching.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import { defineComponent, h } from 'vue'

import AnalysisEmptyState from '@/components/AnalysisEmptyState.vue'
import en from '@/copy/en'

const VCardStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { 'data-stub': 'v-card' }, slots.default?.())
  },
})

describe('AnalysisEmptyState', () => {
  test('renders the copy-deck empty-state string', () => {
    const wrapper = mount(AnalysisEmptyState, {
      global: { stubs: { 'v-card': VCardStub } },
    })
    expect(wrapper.text()).toBe(en['analysis.emptyState'])
  })

  test('carries the analysis-empty-state test-id for page-level branching', () => {
    const wrapper = mount(AnalysisEmptyState, {
      global: { stubs: { 'v-card': VCardStub } },
    })
    expect(wrapper.find('[data-testid="analysis-empty-state"]').exists()).toBe(true)
  })

  test('does not render any v-data-table descendant', () => {
    // FR37 contract: the empty state REPLACES the table, not adorns it.
    const wrapper = mount(AnalysisEmptyState, {
      global: { stubs: { 'v-card': VCardStub } },
    })
    expect(wrapper.find('table').exists()).toBe(false)
  })
})
