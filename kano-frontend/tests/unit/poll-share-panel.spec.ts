// @vitest-environment jsdom
/**
 * PollSharePanel — URL rendering, Copy click → clipboard.writeText,
 * snackbar / button-label transition, execCommand fallback, manual-copy
 * snackbar when both paths fail.
 *
 * Vuetify primitives are stubbed (see {@link globalStubs}) so the spec runs
 * without loading Vuetify's CSS bundle in jsdom.
 */

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import PollSharePanel from '@/components/PollSharePanel.vue'
import type { PollSummary } from '@/api/types'

// Lazy-loaded `qrcode` module — stub it out so the dynamic import resolves
// synchronously in jsdom and we don't fight with real QR rendering.
vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async () => 'data:image/png;base64,STUB'),
}))

const passthrough = (name: string) =>
  defineComponent({
    name,
    setup(_, { slots, attrs }) {
      return () => h('div', { 'data-stub': name, ...attrs }, slots.default?.())
    },
  })

const VTextFieldStub = defineComponent({
  props: ['modelValue', 'label', 'readonly', 'density', 'hideDetails'],
  setup(props, { attrs }) {
    return () =>
      h('div', { 'data-stub': 'v-text-field' }, [
        h('input', {
          value: props.modelValue,
          readonly: props.readonly,
          'aria-label': (attrs['aria-label'] as string) ?? props.label,
          'data-testid': attrs['data-testid'] ?? undefined,
        }),
      ])
  },
})

const VBtnStub = defineComponent({
  props: ['text', 'prependIcon', 'color', 'variant', 'disabled', 'loading'],
  emits: ['click'],
  setup(props, { emit, attrs }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          'aria-label': attrs['aria-label'] as string,
          'data-testid': attrs['data-testid'] ?? undefined,
          'data-icon': props.prependIcon,
          onClick: () => emit('click'),
        },
        props.text,
      )
  },
})

const VSnackbarStub = defineComponent({
  props: ['modelValue', 'timeout', 'location', 'color'],
  emits: ['update:modelValue'],
  setup(props, { slots, attrs }) {
    return () =>
      props.modelValue
        ? h(
            'div',
            {
              role: (attrs.role as string) ?? 'status',
              'aria-live': (attrs['aria-live'] as string) ?? 'polite',
              'data-testid': attrs['data-testid'] ?? undefined,
            },
            slots.default?.(),
          )
        : null
  },
})

const globalStubs = {
  'v-card': passthrough('v-card'),
  'v-text-field': VTextFieldStub,
  'v-btn': VBtnStub,
  'v-snackbar': VSnackbarStub,
}

const fixturePoll: PollSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  project_id: '22222222-2222-4222-8222-222222222222',
  epoch: 1,
  created_at: '2026-05-20T12:00:00Z',
  expires_at: '2026-05-27T12:00:00Z',
  response_count: 0,
  is_expired: false,
}

function setup() {
  return mount(PollSharePanel, {
    props: { poll: fixturePoll },
    global: { stubs: globalStubs },
  })
}

const EXPECTED_URL = `${window.location.origin}/poll/${fixturePoll.id}`

describe('PollSharePanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('renders the share URL', async () => {
    const wrapper = setup()
    await flushPromises()
    const input = wrapper.find<HTMLInputElement>('input')
    expect(input.element.value).toBe(EXPECTED_URL)
  })

  test('Copy button carries the correct aria-label', async () => {
    const wrapper = setup()
    await flushPromises()
    const btn = wrapper.find('[data-testid="poll-share-copy"]')
    expect(btn.attributes('aria-label')).toBe('Copy poll URL')
  })

  test('click → clipboard.writeText called with the URL + snackbar shown + label transitions', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })

    const wrapper = setup()
    await flushPromises()

    await wrapper.find('[data-testid="poll-share-copy"]').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(EXPECTED_URL)

    // Snackbar visible with the copied announcement
    const snackbar = wrapper.find('[data-testid="poll-share-snackbar"]')
    expect(snackbar.exists()).toBe(true)
    expect(snackbar.text()).toContain('Copied to clipboard')

    // Button label flipped to "Copied"
    const btn = wrapper.find('[data-testid="poll-share-copy"]')
    expect(btn.text()).toContain('Copied')
    expect(btn.attributes('data-icon')).toBe('mdi-check')

    // After 1200ms the button reverts and the snackbar dismisses
    vi.advanceTimersByTime(1200)
    await flushPromises()
    expect(wrapper.find('[data-testid="poll-share-copy"]').text()).toContain('Copy')
    expect(wrapper.find('[data-testid="poll-share-snackbar"]').exists()).toBe(false)
  })

  test('clipboard absent → synchronous execCommand fallback runs inside click handler', async () => {
    // No `navigator.clipboard` available → the component must use the
    // synchronous execCommand path, called inside the click handler so the
    // browser's transient user-activation is still in scope. We hard-delete
    // the clipboard surface to simulate the legacy / non-secure-context case.
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
      writable: true,
    })

    const wrapper = setup()
    await flushPromises()
    await wrapper.find('[data-testid="poll-share-copy"]').trigger('click')
    await flushPromises()

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(
      wrapper.find('[data-testid="poll-share-snackbar"]').exists(),
    ).toBe(true)
  })

  test('clipboard.writeText rejection → manual-copy snackbar (no microtask execCommand)', async () => {
    // Regression for the adversarial review: chaining execCommand from
    // `.catch()` of `clipboard.writeText` runs in a microtask after the
    // user activation is consumed — Firefox + Safari silently no-op. The
    // component now does NOT chain execCommand from the rejection path;
    // instead it surfaces the manual-copy snackbar with the URL selected.
    const writeText = vi.fn(async () => {
      throw new Error('clipboard unavailable')
    })
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', {
      value: execCommand,
      configurable: true,
      writable: true,
    })

    const wrapper = setup()
    await flushPromises()
    await wrapper.find('[data-testid="poll-share-copy"]').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledTimes(1)
    // We must NOT chain execCommand from the async catch — that's the
    // exact pattern the review flagged as silently broken.
    expect(execCommand).not.toHaveBeenCalled()
    const failed = wrapper.find('[data-testid="poll-share-snackbar-failed"]')
    expect(failed.exists()).toBe(true)
    expect(failed.text()).toContain("Couldn't copy automatically")
  })

  test('clipboard absent and execCommand returns false → manual-copy snackbar', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn(() => false),
      configurable: true,
      writable: true,
    })

    const wrapper = setup()
    await flushPromises()
    await wrapper.find('[data-testid="poll-share-copy"]').trigger('click')
    await flushPromises()

    const failed = wrapper.find('[data-testid="poll-share-snackbar-failed"]')
    expect(failed.exists()).toBe(true)
    expect(failed.text()).toContain("Couldn't copy automatically")
  })
})
