// @vitest-environment jsdom
/**
 * EpochBumpDialog — confirm calls onConfirm, error keeps dialog open, cancel
 * + Esc both emit cancelled.
 *
 * Vuetify primitives are stubbed (see {@link globalStubs}) so the spec runs
 * without loading Vuetify's CSS bundle in jsdom.
 */

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import EpochBumpDialog from '@/components/EpochBumpDialog.vue'

const VDialogStub = defineComponent({
  props: ['modelValue', 'width', 'persistent'],
  emits: ['update:modelValue', 'keydown'],
  setup(props, { slots, emit }) {
    return () =>
      h(
        'div',
        {
          'data-testid': 'v-dialog-stub',
          tabindex: '-1',
          onKeydown: (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
              emit('update:modelValue', false)
            }
          },
        },
        props.modelValue ? [slots.default?.()] : [],
      )
  },
})

const passthrough = (name: string) =>
  defineComponent({
    name,
    setup(_, { slots, attrs }) {
      return () => h('div', { 'data-stub': name, ...attrs }, slots.default?.())
    },
  })

const VBtnStub = defineComponent({
  props: ['text', 'disabled', 'loading', 'color', 'variant'],
  emits: ['click'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          disabled: props.disabled || props.loading,
          onClick: () => emit('click'),
        },
        props.text,
      )
  },
})

const globalStubs = {
  'v-dialog': VDialogStub,
  'v-card': passthrough('v-card'),
  'v-card-title': passthrough('v-card-title'),
  'v-card-text': passthrough('v-card-text'),
  'v-card-actions': passthrough('v-card-actions'),
  'v-spacer': passthrough('v-spacer'),
  'v-alert': passthrough('v-alert'),
  'v-btn': VBtnStub,
}

function setup(onConfirm: () => Promise<void>) {
  return mount(EpochBumpDialog, {
    props: {
      modelValue: true,
      currentEpoch: 2,
      wouldBeEpoch: 3,
      onConfirm,
    },
    global: { stubs: globalStubs },
  })
}

describe('EpochBumpDialog', () => {
  test('title and body interpolate the epoch numbers', () => {
    const wrapper = setup(async () => undefined)
    expect(wrapper.text()).toContain('Create Version 3?')
    expect(wrapper.text()).toContain('Version 2 will be preserved')
    expect(wrapper.text()).toContain('New polls will use Version 3')
  })

  test('Confirm calls onConfirm and emits confirmed + closes dialog', async () => {
    const onConfirm = vi.fn(async () => undefined)
    const wrapper = setup(onConfirm)

    await wrapper.find('[data-testid="epoch-bump-confirm"]').trigger('click')
    await flushPromises()

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('confirmed')).toHaveLength(1)
    const last = wrapper.emitted('update:modelValue')?.at(-1)
    expect(last?.[0]).toBe(false)
  })

  test('Confirm with a throwing handler keeps the dialog open and shows an error', async () => {
    const onConfirm = vi.fn(async () => {
      throw new Error('backend went bang')
    })
    const wrapper = setup(onConfirm)

    await wrapper.find('[data-testid="epoch-bump-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('confirmed')).toBeFalsy()
    // Dialog stays open — `update:modelValue` not emitted with false.
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    expect(wrapper.text()).toContain("We couldn't bump the version")
  })

  test('Cancel emits cancelled + closes', async () => {
    const wrapper = setup(async () => undefined)

    await wrapper.find('[data-testid="epoch-bump-cancel"]').trigger('click')

    expect(wrapper.emitted('cancelled')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toBe(false)
  })

  test('Vuetify update:modelValue=false (Esc / outside click) emits cancelled', async () => {
    // Vuetify's `v-dialog` handles Esc + outside-click natively and reports
    // closure via `update:modelValue`. The component's `onDialogUpdate`
    // intercepts that to emit `cancelled`. The Playwright spec (Story 2-13
    // a11y sweep) exercises the full keyboard path end-to-end.
    const wrapper = setup(async () => undefined)
    const dialogStub = wrapper.findAllComponents(VDialogStub)[0]
    expect(dialogStub.exists()).toBe(true)
    dialogStub.vm.$emit('update:modelValue', false)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('cancelled')).toHaveLength(1)
  })
})
