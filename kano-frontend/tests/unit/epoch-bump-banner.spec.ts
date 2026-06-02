// @vitest-environment jsdom
/**
 * EpochBumpBanner — auto-dismiss timer + explicit close.
 *
 * Mounts with `v-alert` stubbed to a plain div so jsdom doesn't try to load
 * Vuetify's CSS. The behavioral contract tested is wholly inside our
 * component's setup() — copy lookup, timer, emit.
 */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import EpochBumpBanner from '@/components/EpochBumpBanner.vue'

const VAlertStub = defineComponent({
  props: ['type', 'variant', 'closable', 'role', 'closeLabel'],
  emits: ['click:close'],
  setup(_, { slots, emit, attrs }) {
    return () =>
      h(
        'div',
        {
          role: 'status',
          'data-testid': 'v-alert-stub',
          onMouseenter: attrs.onMouseenter as ((e: Event) => void) | undefined,
          onMouseleave: attrs.onMouseleave as ((e: Event) => void) | undefined,
          onFocusin: attrs.onFocusin as ((e: Event) => void) | undefined,
          onFocusout: attrs.onFocusout as ((e: Event) => void) | undefined,
        },
        [
          slots.default?.(),
          h(
            'button',
            {
              type: 'button',
              'data-testid': 'v-alert-close',
              onClick: () => emit('click:close'),
            },
            'close',
          ),
        ],
      )
  },
})

const globalStubs = { 'v-alert': VAlertStub }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('EpochBumpBanner', () => {
  test('renders the inPlace copy with the current epoch substituted', () => {
    const wrapper = mount(EpochBumpBanner, {
      props: { currentEpoch: 3 },
      global: { stubs: globalStubs },
    })

    expect(wrapper.text()).toContain('Epoch 3 updated in place')
  })

  test('auto-dismisses after 4000ms', async () => {
    const wrapper = mount(EpochBumpBanner, {
      props: { currentEpoch: 1 },
      global: { stubs: globalStubs },
    })

    expect(wrapper.emitted('dismiss')).toBeFalsy()
    await vi.advanceTimersByTimeAsync(3999)
    expect(wrapper.emitted('dismiss')).toBeFalsy()
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  test('explicit close emits dismiss and clears the timer (no double-emit)', async () => {
    const wrapper = mount(EpochBumpBanner, {
      props: { currentEpoch: 1 },
      global: { stubs: globalStubs },
    })

    await wrapper.find('[data-testid="v-alert-close"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)

    // The auto-dismiss timer must have been cleared — advancing past 4s
    // doesn't fire it a second time.
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  test('WCAG 2.2.1 — pauses on hover, resumes on mouseleave', async () => {
    const wrapper = mount(EpochBumpBanner, {
      props: { currentEpoch: 1 },
      global: { stubs: globalStubs },
    })
    const root = wrapper

    // Read ~3s of the 4s window, then hover (mouseenter) to pause.
    await vi.advanceTimersByTimeAsync(3000)
    await root.trigger('mouseenter')

    // No matter how long the user lingers, no dismiss while hovered.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(wrapper.emitted('dismiss')).toBeFalsy()

    // Leaving the banner resumes with the ~1s remainder.
    await root.trigger('mouseleave')
    await vi.advanceTimersByTimeAsync(999)
    expect(wrapper.emitted('dismiss')).toBeFalsy()
    await vi.advanceTimersByTimeAsync(2)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  test('WCAG 2.2.1 — focus pauses, focusout resumes', async () => {
    const wrapper = mount(EpochBumpBanner, {
      props: { currentEpoch: 1 },
      global: { stubs: globalStubs },
    })
    const root = wrapper

    await root.trigger('focusin')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(wrapper.emitted('dismiss')).toBeFalsy()

    await root.trigger('focusout')
    await vi.advanceTimersByTimeAsync(3999)
    expect(wrapper.emitted('dismiss')).toBeFalsy()
    await vi.advanceTimersByTimeAsync(2)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  test('WCAG 2.2.1 — hover + focus both leave still keeps paused', async () => {
    const wrapper = mount(EpochBumpBanner, {
      props: { currentEpoch: 1 },
      global: { stubs: globalStubs },
    })
    const root = wrapper

    await root.trigger('mouseenter')
    await root.trigger('focusin')
    // Mouse leaves but focus stays — must still pause.
    await root.trigger('mouseleave')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(wrapper.emitted('dismiss')).toBeFalsy()

    // Now focus also leaves — resume + tick out.
    await root.trigger('focusout')
    await vi.advanceTimersByTimeAsync(4001)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})
