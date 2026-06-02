// @vitest-environment jsdom
/**
 * KanoLikert (Story 4-5) — auto-advance timing, keyboard 1–5,
 * reduced-motion, and error-state semantics.
 *
 * Vuetify's `v-radio-group` is stubbed because the test cares about the
 * component's contract (emits, model wiring, ARIA wiring) rather than
 * Vuetify's internal radio rendering. The stub exposes the modelValue
 * change via a single `data-testid` button per option.
 */

import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import KanoLikert from '@/components/KanoLikert.vue'

const VRadioGroupStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(_, { slots, emit, attrs }) {
    return () =>
      h(
        'div',
        {
          role: 'radiogroup',
          'aria-labelledby': attrs['aria-labelledby'] as string,
          // Expose a programmatic hook so the test can fire the update.
          onClickCapture: (event: Event) => {
            const target = event.target as HTMLElement
            const raw = target?.getAttribute?.('data-value')
            if (raw !== null && raw !== undefined) emit('update:modelValue', Number(raw))
          },
        },
        slots.default?.(),
      )
  },
})

const VRadioStub = defineComponent({
  props: ['value', 'label'],
  setup(props, { attrs }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          'data-value': props.value,
          'data-testid': attrs['data-testid'] as string,
          'aria-label': props.label,
        },
        props.label,
      )
  },
})

const globalStubs = {
  'v-radio-group': VRadioGroupStub,
  'v-radio': VRadioStub,
}

const feature = {
  feature_key: 'fk-1',
  name: 'Auto-save',
  description: null,
}

function setReducedMotion(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }))
}

beforeEach(() => {
  setReducedMotion(false)
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

import { afterEach } from 'vitest'

describe('KanoLikert', () => {
  test('renders 5 options in order with copy-deck labels', async () => {
    const wrapper = mount(KanoLikert, {
      props: { question: 'functional', feature, modelValue: null },
      global: { stubs: globalStubs },
    })
    const labels = wrapper
      .findAll('[data-testid^="kano-likert-option-"]')
      .map((el) => el.text())
    expect(labels).toEqual([
      'Like it',
      'Expect it',
      'Neutral',
      'Can tolerate it',
      'Dislike it',
    ])
  })

  test('functional question template renders from the copy deck', async () => {
    const wrapper = mount(KanoLikert, {
      props: { question: 'functional', feature, modelValue: null },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('legend').text()).toBe(
      'How would you feel if feature is available?',
    )
  })

  test('dysfunctional question template renders from the copy deck', async () => {
    const wrapper = mount(KanoLikert, {
      props: { question: 'dysfunctional', feature, modelValue: null },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('legend').text()).toBe(
      'How would you feel if feature is not available?',
    )
  })

  test('aria-labelledby on the radiogroup points at the legend', async () => {
    const wrapper = mount(KanoLikert, {
      props: { question: 'functional', feature, modelValue: null },
      global: { stubs: globalStubs },
    })
    const legendId = wrapper.find('legend').attributes('id')
    const radiogroupLabelledBy = wrapper
      .find('[role="radiogroup"]')
      .attributes('aria-labelledby')
    expect(legendId).toBeTruthy()
    expect(radiogroupLabelledBy).toBe(legendId)
  })

  test('click on option emits update:modelValue and auto-advance after 150 ms', async () => {
    const wrapper = mount(KanoLikert, {
      props: { question: 'functional', feature, modelValue: null },
      global: { stubs: globalStubs },
    })
    await wrapper.find('[data-testid="kano-likert-option-3"]').trigger('click')

    // Synchronous: update:modelValue is emitted immediately.
    expect(wrapper.emitted('update:modelValue')).toEqual([[3]])
    // auto-advance is deferred until the confirmation animation ends.
    expect(wrapper.emitted('auto-advance')).toBeUndefined()

    vi.advanceTimersByTime(150)
    expect(wrapper.emitted('auto-advance')).toEqual([[3]])
  })

  test('confirmationMs=0 fires auto-advance synchronously', async () => {
    const wrapper = mount(KanoLikert, {
      props: { question: 'functional', feature, modelValue: null, confirmationMs: 0 },
      global: { stubs: globalStubs },
    })
    await wrapper.find('[data-testid="kano-likert-option-5"]').trigger('click')
    expect(wrapper.emitted('auto-advance')).toEqual([[5]])
  })

  test('reduced-motion collapses delay to 0', async () => {
    setReducedMotion(true)
    const wrapper = mount(KanoLikert, {
      props: { question: 'functional', feature, modelValue: null },
      global: { stubs: globalStubs },
    })
    await wrapper.find('[data-testid="kano-likert-option-1"]').trigger('click')
    // No timer advance needed — the emit fires on the same tick.
    expect(wrapper.emitted('auto-advance')).toEqual([[1]])
  })

  test.each(['1', '2', '3', '4', '5'])(
    'keyboard %s selects matching option',
    async (key) => {
      const wrapper = mount(KanoLikert, {
        props: { question: 'functional', feature, modelValue: null, confirmationMs: 0 },
        global: { stubs: globalStubs },
      })
      await wrapper.find('fieldset').trigger('keydown', { key })
      expect(wrapper.emitted('update:modelValue')).toEqual([[Number(key)]])
      expect(wrapper.emitted('auto-advance')).toEqual([[Number(key)]])
    },
  )

  test('keyboard 6 / letter keys are ignored', async () => {
    const wrapper = mount(KanoLikert, {
      props: { question: 'functional', feature, modelValue: null, confirmationMs: 0 },
      global: { stubs: globalStubs },
    })
    await wrapper.find('fieldset').trigger('keydown', { key: '6' })
    await wrapper.find('fieldset').trigger('keydown', { key: 'a' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  test('keyboard 1 with modifier (Ctrl-1) is ignored (browser nav)', async () => {
    const wrapper = mount(KanoLikert, {
      props: { question: 'functional', feature, modelValue: null, confirmationMs: 0 },
      global: { stubs: globalStubs },
    })
    await wrapper
      .find('fieldset')
      .trigger('keydown', { key: '1', ctrlKey: true })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  test('showError=true renders alert and has-error class', async () => {
    const wrapper = mount(KanoLikert, {
      props: { question: 'functional', feature, modelValue: null, showError: true },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('fieldset').classes()).toContain('has-error')
    const alert = wrapper.find('[data-testid="kano-likert-error"]')
    expect(alert.exists()).toBe(true)
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toBe('Please select an answer before continuing.')

    // aria-describedby links the fieldset to the error message.
    const describedBy = wrapper.find('fieldset').attributes('aria-describedby')
    expect(describedBy).toBe(alert.attributes('id'))
  })

  test('showError=false clears the alert + class', async () => {
    const wrapper = mount(KanoLikert, {
      props: { question: 'functional', feature, modelValue: null, showError: true },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('fieldset').classes()).toContain('has-error')
    await wrapper.setProps({ showError: false })
    await flushPromises()
    expect(wrapper.find('fieldset').classes()).not.toContain('has-error')
    expect(wrapper.find('[data-testid="kano-likert-error"]').exists()).toBe(false)
  })
})
