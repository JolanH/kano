// @vitest-environment jsdom
/**
 * Pinia store for the respondent-facing poll snapshot — Story 4-4.
 *
 * Asserts the status-code → fetchState mapping (410 → expired,
 * 404 → not-found, anything else → error), getters, and that a
 * `reset()` blanks the in-memory state so re-mounts don't flash stale
 * data.
 */

import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import {
  KanoApiError,
  NotFoundError,
  ServerError,
  type PollPublic,
  type ProblemDetails,
} from '@/api/types'
import { usePollPublicStore } from '@/stores/pollPublic'

const getMock = vi.fn()
vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    get: (path: string) => getMock(path),
  }),
}))

const samplePollPublic: PollPublic = {
  id: 'test-poll-id',
  expires_at: '2026-05-27T12:00:00Z',
  features: [
    { feature_key: 'fk-1', name: 'A', description: null },
    { feature_key: 'fk-2', name: 'B', description: null },
  ],
}

function makeProblem(status: number, slug: string): ProblemDetails {
  return {
    type: `https://kano.example.com/problems/${slug}`,
    title: slug,
    status,
    detail: null,
    instance: '/api/v1/polls/test-poll-id',
    request_id: 'rid',
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  getMock.mockReset()
})

describe('usePollPublicStore', () => {
  test('initial state is idle / no poll / no error', () => {
    const store = usePollPublicStore()
    expect(store.fetchState).toBe('idle')
    expect(store.poll).toBeNull()
    expect(store.error).toBeNull()
    expect(store.isLoaded).toBe(false)
    expect(store.featureCount).toBe(0)
    expect(store.expiresAt).toBeNull()
  })

  test('loadPoll 200 → loaded + populated', async () => {
    getMock.mockResolvedValueOnce({ data: samplePollPublic, requestId: 'r', status: 200 })
    const store = usePollPublicStore()
    await store.loadPoll('test-poll-id')
    expect(store.fetchState).toBe('loaded')
    expect(store.poll).toEqual(samplePollPublic)
    expect(store.isLoaded).toBe(true)
    expect(store.featureCount).toBe(2)
    expect(store.expiresAt).toBe('2026-05-27T12:00:00Z')
  })

  test('loadPoll 410 → expired', async () => {
    getMock.mockRejectedValueOnce(new KanoApiError(makeProblem(410, 'poll-expired'), 410))
    const store = usePollPublicStore()
    await store.loadPoll('test-poll-id')
    expect(store.fetchState).toBe('expired')
    expect(store.error).toBeInstanceOf(KanoApiError)
    expect(store.poll).toBeNull()
  })

  test('loadPoll 404 → not-found', async () => {
    getMock.mockRejectedValueOnce(
      new NotFoundError(makeProblem(404, 'entity-not-found'), 404),
    )
    const store = usePollPublicStore()
    await store.loadPoll('test-poll-id')
    expect(store.fetchState).toBe('not-found')
  })

  test('loadPoll 500 → error', async () => {
    getMock.mockRejectedValueOnce(
      new ServerError(makeProblem(500, 'internal-server-error'), 500),
    )
    const store = usePollPublicStore()
    await store.loadPoll('test-poll-id')
    expect(store.fetchState).toBe('error')
  })

  test('non-Kano rejection (network) → error', async () => {
    getMock.mockRejectedValueOnce(new TypeError('network down'))
    const store = usePollPublicStore()
    await store.loadPoll('test-poll-id')
    expect(store.fetchState).toBe('error')
    // No KanoApiError in flight → `error` ref stays null per current
    // contract (we only attach typed problems).
    expect(store.error).toBeNull()
  })

  test('reset() blanks state', async () => {
    getMock.mockResolvedValueOnce({ data: samplePollPublic, requestId: 'r', status: 200 })
    const store = usePollPublicStore()
    await store.loadPoll('test-poll-id')
    store.reset()
    expect(store.fetchState).toBe('idle')
    expect(store.poll).toBeNull()
    expect(store.error).toBeNull()
  })
})
