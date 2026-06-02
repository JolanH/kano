// @vitest-environment jsdom
/**
 * EpochSelector — renders a static label at epoch 1, a v-menu dropdown
 * otherwise, and pushes a router query change on pick.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import EpochSelector from '@/components/EpochSelector.vue'

const pushMock = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

// Stub Vuetify primitives the component uses; render their default slots
// so we can assert on text + click events.
const passthrough = (name: string, extraProps: string[] = []) =>
  defineComponent({
    name,
    props: extraProps,
    emits: ['click'],
    setup(_, { slots, attrs, emit }) {
      return () =>
        h(
          name === 'v-btn' ? 'button' : 'div',
          {
            ...attrs,
            'data-stub': name,
            onClick: () => emit('click'),
          },
          slots.default ? slots.default() : [],
        )
    },
  })

const VMenuStub = defineComponent({
  name: 'VMenuStub',
  props: ['modelValue'],
  setup(_, { slots }) {
    return () =>
      h('div', { 'data-stub': 'v-menu' }, [
        slots.activator?.({ props: {} }),
        slots.default?.(),
      ])
  },
})

const globalStubs = {
  'v-menu': VMenuStub,
  'v-btn': passthrough('v-btn'),
  'v-list': passthrough('v-list'),
  'v-list-item': passthrough('v-list-item'),
  'v-list-item-title': passthrough('v-list-item-title'),
}

describe('EpochSelector', () => {
  test('current epoch === 1 renders a static label with no dropdown', () => {
    const wrapper = mount(EpochSelector, {
      props: { currentEpoch: 1, projectId: 'p-1' },
      global: { stubs: globalStubs },
    })

    expect(wrapper.find('[data-testid="epoch-selector-static"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="epoch-selector-trigger"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Epoch 1')
  })

  test('current epoch > 1 renders one list item per version, newest first', () => {
    const wrapper = mount(EpochSelector, {
      props: { currentEpoch: 3, projectId: 'p-1' },
      global: { stubs: globalStubs },
    })

    expect(wrapper.find('[data-testid="epoch-selector-trigger"]').exists()).toBe(true)
    const items = wrapper.findAll('[role="option"]')
    expect(items.map((i) => i.attributes('data-epoch'))).toEqual(['3', '2', '1'])
  })

  test('picking a past version pushes a query change', async () => {
    pushMock.mockReset()
    const wrapper = mount(EpochSelector, {
      props: { currentEpoch: 3, projectId: 'p-9' },
      global: { stubs: globalStubs },
    })

    await wrapper.find('[data-testid="epoch-selector-item-2"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      path: '/app/projects/p-9',
      query: { epoch: '2' },
    })
  })

  test('picking the current version strips the query', async () => {
    pushMock.mockReset()
    const wrapper = mount(EpochSelector, {
      props: { currentEpoch: 3, projectId: 'p-9' },
      global: { stubs: globalStubs },
    })

    await wrapper.find('[data-testid="epoch-selector-item-3"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      path: '/app/projects/p-9',
      query: {},
    })
  })

  test('aria-current marks the currently-selected version in the dropdown', () => {
    const wrapper = mount(EpochSelector, {
      props: { currentEpoch: 3, projectId: 'p-9' },
      global: { stubs: globalStubs },
    })
    const current = wrapper.find('[data-testid="epoch-selector-item-3"]')
    const other = wrapper.find('[data-testid="epoch-selector-item-2"]')
    expect(current.attributes('aria-current')).toBe('true')
    expect(other.attributes('aria-current')).toBeUndefined()
  })
})
