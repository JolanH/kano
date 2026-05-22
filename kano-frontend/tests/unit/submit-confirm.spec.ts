// @vitest-environment jsdom
/**
 * SubmitConfirm.vue (Story 4-7) — terminal Submit flow.
 *
 * Covers the happy 204 path, the defensive in-app completeness guard,
 * the 422 partial-submission server bounce (priority missing →
 * unexpected → duplicates), the 410 expired escape hatch, and the
 * 500 generic-error path.
 */

import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'
import { defineComponent, h, ref } from 'vue'

import SubmitConfirm from '@/pages/poll/SubmitConfirm.vue'
import {
  KanoApiError,
  ValidationError,
  ServerError,
  type PollPublic,
  type ProblemDetails,
} from '@/api/types'
import { usePollPublicStore } from '@/stores/pollPublic'
import { useResponseDraftStore } from '@/stores/responseDraft'

const pushMock = vi.fn()
const replaceMock = vi.fn()
const postMock = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { uuid: 'poll-uuid' } }),
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))

vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    post: (path: string, body: unknown) => postMock(path, body),
  }),
}))

const passthrough = (name: string) =>
  defineComponent({
    name,
    setup(_, { slots, attrs }) {
      return () =>
        h('div', { 'data-stub-component': name, ...attrs }, slots.default?.())
    },
  })

const VBtnStub = defineComponent({
  props: ['text', 'loading', 'disabled', 'variant'],
  setup(props, { attrs }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          'data-testid': attrs['data-testid'] as string,
          'data-loading': props.loading ? 'true' : 'false',
          disabled: props.disabled || undefined,
          onClick: attrs.onClick as ((e: MouseEvent) => void) | undefined,
        },
        props.text,
      )
  },
})

const VAlertStub = defineComponent({
  props: ['type', 'text'],
  setup(props, { attrs }) {
    return () =>
      h(
        'div',
        {
          'data-testid': attrs['data-testid'] as string,
          role: 'alert',
          'data-alert-type': props.type,
        },
        props.text,
      )
  },
})

const globalStubs = {
  'v-card': passthrough('v-card'),
  'v-card-title': passthrough('v-card-title'),
  'v-card-text': passthrough('v-card-text'),
  'v-card-actions': passthrough('v-card-actions'),
  'v-spacer': passthrough('v-spacer'),
  'v-btn': VBtnStub,
  'v-alert': VAlertStub,
}

const POLL: PollPublic = {
  id: 'poll-uuid',
  expires_at: '2026-12-31T00:00:00Z',
  features: [
    { feature_key: 'fk-a', name: 'A', description: null },
    { feature_key: 'fk-b', name: 'B', description: null },
  ],
}

function makeProblem(
  status: number,
  slug: string,
  extra: Record<string, unknown> = {},
): ProblemDetails {
  return {
    type: `https://kano.example.com/problems/${slug}`,
    title: slug,
    status,
    detail: null,
    instance: '/api/v1/polls/poll-uuid/submit',
    request_id: 'rid',
    ...(extra as object),
  } as ProblemDetails
}

function seedFullDraft(): void {
  const draft = useResponseDraftStore()
  draft.initForPoll('poll-uuid', ['fk-a', 'fk-b'])
  for (const key of ['fk-a', 'fk-b']) {
    draft.setAnswer(key, 'functional', 3)
    draft.setAnswer(key, 'dysfunctional', 5)
  }
}

function seedPoll(): void {
  const store = usePollPublicStore()
  store.$patch({ fetchState: 'loaded', poll: POLL, error: null })
}

beforeEach(() => {
  setActivePinia(createPinia())
  pushMock.mockReset()
  replaceMock.mockReset()
  postMock.mockReset()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SubmitConfirm — happy path', () => {
  test('204 → draft reset + replace to thanks', async () => {
    seedPoll()
    seedFullDraft()
    postMock.mockResolvedValueOnce({ data: null, requestId: 'r', status: 204 })

    const wrapper = mount(SubmitConfirm, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="submit-confirm-submit"]').trigger('click')
    await flushPromises()

    expect(postMock).toHaveBeenCalledWith('/polls/poll-uuid/submit', {
      answers: [
        { feature_key: 'fk-a', fq_answer: 3, dq_answer: 5 },
        { feature_key: 'fk-b', fq_answer: 3, dq_answer: 5 },
      ],
    })
    const draft = useResponseDraftStore()
    expect(draft.answers).toEqual({})
    expect(replaceMock).toHaveBeenCalledWith({
      name: 'poll-thanks',
      params: { uuid: 'poll-uuid' },
    })
  })

  test('Back routes to the last feature index', async () => {
    // Per-feature progression (Story 4-6 amendment 2026-05-22): lastIndex
    // is `features.length - 1`. For the 2-feature POLL fixture, that's
    // index 1, not 3 (the old 2N-1 = 3 was per-question denominator).
    seedPoll()
    seedFullDraft()
    const wrapper = mount(SubmitConfirm, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="submit-confirm-back"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'poll-question',
      params: { uuid: 'poll-uuid', index: 1 },
    })
  })
})

describe('SubmitConfirm — defensive completeness guard', () => {
  test('mount with incomplete draft → immediate replace to first missing', async () => {
    seedPoll()
    const draft = useResponseDraftStore()
    draft.initForPoll('poll-uuid', ['fk-a', 'fk-b'])
    draft.setAnswer('fk-a', 'functional', 3)
    // Per-feature progression: fk-a is featureIndex 0, regardless of
    // which question (functional/dysfunctional) is missing — Question.vue
    // surfaces the correct per-Likert error border once it renders.

    mount(SubmitConfirm, { global: { stubs: globalStubs } })
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith({
      name: 'poll-question',
      params: { uuid: 'poll-uuid', index: 0 },
      query: { showError: '1' },
    })
    expect(postMock).not.toHaveBeenCalled()
  })

  test('Submit with incomplete draft → no API call, bounce to missing', async () => {
    seedPoll()
    const draft = useResponseDraftStore()
    draft.initForPoll('poll-uuid', ['fk-a', 'fk-b'])
    draft.setAnswer('fk-a', 'functional', 3)
    draft.setAnswer('fk-a', 'dysfunctional', 5)
    // fk-b entirely missing → featureIndex 1.

    const wrapper = mount(SubmitConfirm, { global: { stubs: globalStubs } })
    await flushPromises()
    replaceMock.mockClear()

    // The onMount guard already fired; clear and click Submit directly.
    await wrapper.find('[data-testid="submit-confirm-submit"]').trigger('click')
    await flushPromises()

    expect(postMock).not.toHaveBeenCalled()
    expect(replaceMock).toHaveBeenCalledWith({
      name: 'poll-question',
      params: { uuid: 'poll-uuid', index: 1 },
      query: { showError: '1' },
    })
  })
})

describe('SubmitConfirm — server error handling', () => {
  test('422 partial-submission → inline notice → redirect to missing[0]', async () => {
    seedPoll()
    seedFullDraft()
    postMock.mockRejectedValueOnce(
      new ValidationError(
        makeProblem(422, 'partial-submission', {
          missing: ['fk-b'],
          unexpected: [],
          duplicates: [],
        }),
        422,
      ),
    )

    const wrapper = mount(SubmitConfirm, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="submit-confirm-submit"]').trigger('click')
    await flushPromises()

    // Inline notice rendered before the bounce.
    expect(
      wrapper.find('[data-testid="submit-confirm-missing-redirect"]').exists(),
    ).toBe(true)

    // Advance the 800 ms acknowledgement window.
    await vi.advanceTimersByTimeAsync(800)
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith({
      name: 'poll-question',
      params: { uuid: 'poll-uuid', index: 1 },
      query: { showError: '1' },
    })
  })

  test('422 with only unexpected[] (feature unknown to SPA) → draft reset + bounce to landing', async () => {
    // By definition, `unexpected[]` carries feature_keys the server saw in
    // the submission but doesn't know about — meaning they're NOT in the
    // local PollPublic snapshot. Story 4.7 Dev Notes: treat this as
    // snapshot drift, reset the draft, and route to the landing so the
    // user re-initialises against the fresh poll state.
    seedPoll()
    seedFullDraft()
    const stranger = 'fk-not-in-local-snapshot'
    postMock.mockRejectedValueOnce(
      new ValidationError(
        makeProblem(422, 'partial-submission', {
          missing: [],
          unexpected: [stranger],
          duplicates: [],
        }),
        422,
      ),
    )

    const wrapper = mount(SubmitConfirm, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="submit-confirm-submit"]').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(800)
    await flushPromises()

    const draft = useResponseDraftStore()
    expect(draft.answers).toEqual({})
    expect(replaceMock).toHaveBeenCalledWith({
      name: 'poll-landing',
      params: { uuid: 'poll-uuid' },
    })
  })

  test('410 expired → fetchState=expired, draft reset, bounce to landing', async () => {
    seedPoll()
    seedFullDraft()
    postMock.mockRejectedValueOnce(
      new KanoApiError(makeProblem(410, 'poll-expired'), 410),
    )

    const wrapper = mount(SubmitConfirm, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="submit-confirm-submit"]').trigger('click')
    await flushPromises()

    const pollStore = usePollPublicStore()
    expect(pollStore.fetchState).toBe('expired')
    const draft = useResponseDraftStore()
    expect(draft.answers).toEqual({})
    expect(replaceMock).toHaveBeenCalledWith({
      name: 'poll-landing',
      params: { uuid: 'poll-uuid' },
    })
  })

  test('500 → inline alert + Submit button re-enabled', async () => {
    seedPoll()
    seedFullDraft()
    postMock.mockRejectedValueOnce(
      new ServerError(makeProblem(500, 'internal-server-error'), 500),
    )

    const wrapper = mount(SubmitConfirm, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="submit-confirm-submit"]').trigger('click')
    await flushPromises()

    const alert = wrapper.find('[data-testid="submit-confirm-error"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Something went wrong')
    const submitBtn = wrapper.find('[data-testid="submit-confirm-submit"]')
    expect(submitBtn.attributes('data-loading')).toBe('false')
    expect(submitBtn.attributes('disabled')).toBeUndefined()
  })

  test('500 retry → recovers after a successful second call', async () => {
    seedPoll()
    seedFullDraft()
    postMock
      .mockRejectedValueOnce(
        new ServerError(makeProblem(500, 'internal-server-error'), 500),
      )
      .mockResolvedValueOnce({ data: null, requestId: 'r', status: 204 })

    const wrapper = mount(SubmitConfirm, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.find('[data-testid="submit-confirm-submit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="submit-confirm-submit"]').trigger('click')
    await flushPromises()

    expect(postMock).toHaveBeenCalledTimes(2)
    expect(replaceMock).toHaveBeenLastCalledWith({
      name: 'poll-thanks',
      params: { uuid: 'poll-uuid' },
    })
  })
})
