/**
 * Pinia `usePollsStore` — createPoll happy + typed-422 paths, list loaders.
 */

import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import {
  PollRequiresFeaturesError,
  type ProblemDetails,
  type PollSummary,
  type PollSummaryWithProject,
} from '@/api/types'
import { usePollsStore } from '@/stores/polls'

const getMock = vi.fn()
const postMock = vi.fn()

vi.mock('@/composables/useApi', () => ({
  useApi: () => ({
    get: (path: string) => getMock(path),
    post: (path: string, body: unknown) => postMock(path, body),
    patch: () => Promise.resolve({ data: null, requestId: 'r', status: 200 }),
    delete: () => Promise.resolve({ data: null, requestId: 'r', status: 204 }),
    put: () => Promise.resolve({ data: null, requestId: 'r', status: 204 }),
    resetCsrf: () => undefined,
  }),
}))

function ok<T>(data: T, status = 200) {
  return Promise.resolve({ data, requestId: 'rid', status })
}

const samplePoll: PollSummary = {
  id: 'p-1',
  project_id: 'proj-1',
  epoch: 1,
  created_at: '2026-05-20T12:00:00Z',
  expires_at: '2026-05-27T12:00:00Z',
  response_count: 0,
  is_expired: false,
}

const sampleEnriched: PollSummaryWithProject = {
  ...samplePoll,
  project_name: 'Solo',
  project_version: '1.0',
}

beforeEach(() => {
  setActivePinia(createPinia())
  getMock.mockReset()
  postMock.mockReset()
})

describe('usePollsStore', () => {
  test('createPoll sets currentPoll and prepends to items', async () => {
    postMock.mockImplementation(() => ok(samplePoll, 201))
    const store = usePollsStore()
    const poll = await store.createPoll('proj-1')
    expect(poll).toEqual(samplePoll)
    expect(store.currentPoll).toEqual(samplePoll)
    expect(store.items).toHaveLength(1)
    expect(store.items[0]?.id).toBe('p-1')
    expect(postMock).toHaveBeenCalledWith('/projects/proj-1/polls', {})
  })

  test('createPoll re-throws PollRequiresFeaturesError on 422', async () => {
    const problem: ProblemDetails = {
      type: 'https://kano.example.com/problems/poll-requires-features',
      title: 'Poll requires at least one feature',
      status: 422,
      detail: 'No active features on epoch 1',
      instance: '/api/v1/projects/proj-1/polls',
      request_id: 'rid',
    }
    postMock.mockImplementation(() => {
      return Promise.reject(new PollRequiresFeaturesError(problem, 422))
    })
    const store = usePollsStore()
    await expect(store.createPoll('proj-1')).rejects.toBeInstanceOf(
      PollRequiresFeaturesError,
    )
    // No optimistic state on failure.
    expect(store.currentPoll).toBeNull()
    expect(store.items).toEqual([])
  })

  test('loadAllPolls populates items', async () => {
    getMock.mockImplementation(() => ok([sampleEnriched]))
    const store = usePollsStore()
    await store.loadAllPolls()
    expect(store.items).toEqual([sampleEnriched])
    expect(store.isLoading).toBe(false)
  })

  test('loadPollsForProject returns the list', async () => {
    getMock.mockImplementation(() => ok([samplePoll]))
    const store = usePollsStore()
    const polls = await store.loadPollsForProject('proj-1')
    expect(polls).toEqual([samplePoll])
    expect(getMock).toHaveBeenCalledWith('/projects/proj-1/polls')
  })

  test('clearCurrentPoll drops the handoff state', async () => {
    postMock.mockImplementation(() => ok(samplePoll, 201))
    const store = usePollsStore()
    await store.createPoll('proj-1')
    expect(store.currentPoll).not.toBeNull()
    store.clearCurrentPoll()
    expect(store.currentPoll).toBeNull()
  })
})
