// @vitest-environment jsdom
/**
 * AnalysisErrorSurface (Story 5-5) — typed-error branching. Asserts:
 *
 * - `NotFoundError` → "Poll not found" card + a `Back to projects`-style
 *   link routed to either the project-detail (projectId present) or the
 *   projects list (projectId null).
 * - any other `KanoApiError` (ServerError, NetworkError, unclassified) →
 *   the retryable `v-alert` with a `retry` event on click.
 *
 * Branching MUST be done via `instanceof` on the typed-error hierarchy,
 * never on `.status` — pinning that here means a regression to numeric-
 * code sniffing fails the spec.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import {
  KanoApiError,
  NotFoundError,
  ServerError,
  type ProblemDetails,
} from '@/api/types'
import AnalysisErrorSurface from '@/components/AnalysisErrorSurface.vue'

const passthrough = (name: string) =>
  defineComponent({
    setup(_, { slots, attrs }) {
      return () =>
        h(
          'div',
          { 'data-stub': name, 'data-testid': attrs['data-testid'] ?? undefined },
          slots.default?.(),
        )
    },
  })

const VBtnStub = defineComponent({
  props: ['to', 'color', 'variant'],
  emits: ['click'],
  setup(props, { emit, slots, attrs }) {
    return () =>
      h(
        'a',
        {
          'data-testid': attrs['data-testid'] ?? undefined,
          'data-to': props.to ? JSON.stringify(props.to) : undefined,
          onClick: () => emit('click'),
        },
        slots.default?.(),
      )
  },
})

const VAlertStub = defineComponent({
  props: ['type', 'title', 'text', 'variant'],
  setup(props, { slots, attrs }) {
    return () =>
      h(
        'div',
        {
          'data-stub': 'v-alert',
          'data-testid': attrs['data-testid'] ?? undefined,
          'data-type': props.type,
        },
        [h('div', { 'data-slot': 'title' }, props.title), h('div', { 'data-slot': 'text' }, props.text), slots.append?.()],
      )
  },
})

const globalStubs = {
  'v-card': passthrough('v-card'),
  'v-card-title': passthrough('v-card-title'),
  'v-card-text': passthrough('v-card-text'),
  'v-card-actions': passthrough('v-card-actions'),
  'v-btn': VBtnStub,
  'v-alert': VAlertStub,
}

function problem(overrides: Partial<ProblemDetails> = {}): ProblemDetails {
  return {
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: null,
    instance: '',
    request_id: null,
    ...overrides,
  }
}

describe('AnalysisErrorSurface — NotFound (404)', () => {
  test('renders 404 card with back-to-project link when projectId present', () => {
    const wrapper = mount(AnalysisErrorSurface, {
      global: { stubs: globalStubs },
      props: {
        error: new NotFoundError(problem({ title: 'Poll missing' }), 404),
        projectId: 'proj-123',
      },
    })

    expect(wrapper.find('[data-testid="analysis-error-not-found"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="analysis-error-load"]').exists()).toBe(false)
    const link = wrapper.find('[data-testid="analysis-error-back-link"]')
    expect(link.exists()).toBe(true)
    const to = JSON.parse(link.attributes('data-to') ?? '{}')
    expect(to.name).toBe('project-detail')
    expect(to.params).toEqual({ id: 'proj-123' })
  })

  test('falls back to projects list when projectId is null', () => {
    const wrapper = mount(AnalysisErrorSurface, {
      global: { stubs: globalStubs },
      props: {
        error: new NotFoundError(problem(), 404),
        projectId: null,
      },
    })

    const link = wrapper.find('[data-testid="analysis-error-back-link"]')
    const to = JSON.parse(link.attributes('data-to') ?? '{}')
    expect(to.name).toBe('projects')
  })

  test('renders no retry button on 404 (URL is wrong, retrying does not help)', () => {
    const wrapper = mount(AnalysisErrorSurface, {
      global: { stubs: globalStubs },
      props: {
        error: new NotFoundError(problem(), 404),
        projectId: 'proj-x',
      },
    })
    expect(wrapper.find('[data-testid="analysis-error-retry"]').exists()).toBe(false)
  })
})

describe('AnalysisErrorSurface — ServerError + other KanoApiError', () => {
  test('renders retryable v-alert for 500', () => {
    const wrapper = mount(AnalysisErrorSurface, {
      global: { stubs: globalStubs },
      props: {
        error: new ServerError(problem({ status: 500, title: 'Boom' }), 500),
        projectId: 'proj-x',
      },
    })
    expect(wrapper.find('[data-testid="analysis-error-load"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="analysis-error-not-found"]').exists()).toBe(false)
  })

  test('renders retryable v-alert for unclassified KanoApiError (e.g. network)', () => {
    const wrapper = mount(AnalysisErrorSurface, {
      global: { stubs: globalStubs },
      props: {
        error: new KanoApiError(problem({ status: 0, title: 'Network' }), 0),
        projectId: null,
      },
    })
    expect(wrapper.find('[data-testid="analysis-error-load"]').exists()).toBe(true)
  })

  test('retry button emits `retry` event', async () => {
    const wrapper = mount(AnalysisErrorSurface, {
      global: { stubs: globalStubs },
      props: {
        error: new ServerError(problem({ status: 500 }), 500),
        projectId: 'proj-x',
      },
    })
    await wrapper.find('[data-testid="analysis-error-retry"]').trigger('click')
    expect(wrapper.emitted('retry')).toBeTruthy()
    expect(wrapper.emitted('retry')!.length).toBe(1)
  })
})
