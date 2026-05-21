// @vitest-environment jsdom
/**
 * In-memory response-draft store — Story 4.6.
 *
 * Asserts the initForPoll lifecycle (seed on first poll, preserve on
 * same uuid, purge on switch), set/get round-trip, isComplete invariant,
 * firstMissing ordering, and reset semantics.
 */

import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, test } from 'vitest'

import { useResponseDraftStore } from '@/stores/responseDraft'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useResponseDraftStore', () => {
  test('initForPoll seeds null pairs for every feature_key', () => {
    const store = useResponseDraftStore()
    store.initForPoll('poll-1', ['fk-a', 'fk-b', 'fk-c'])
    expect(store.activePollId).toBe('poll-1')
    expect(Object.keys(store.answers)).toEqual(['fk-a', 'fk-b', 'fk-c'])
    for (const pair of Object.values(store.answers)) {
      expect(pair).toEqual({ fq_answer: null, dq_answer: null })
    }
  })

  test('setAnswer + getAnswer round-trip', () => {
    const store = useResponseDraftStore()
    store.initForPoll('poll-1', ['fk-a'])
    store.setAnswer('fk-a', 'functional', 3)
    store.setAnswer('fk-a', 'dysfunctional', 5)
    expect(store.getAnswer('fk-a', 'functional')).toBe(3)
    expect(store.getAnswer('fk-a', 'dysfunctional')).toBe(5)
  })

  test('getAnswer returns null for unknown feature_key', () => {
    const store = useResponseDraftStore()
    store.initForPoll('poll-1', ['fk-a'])
    expect(store.getAnswer('missing', 'functional')).toBeNull()
  })

  test('isComplete is false until every pair is fully answered', () => {
    const store = useResponseDraftStore()
    store.initForPoll('poll-1', ['fk-a', 'fk-b'])
    expect(store.isComplete).toBe(false)
    store.setAnswer('fk-a', 'functional', 3)
    store.setAnswer('fk-a', 'dysfunctional', 5)
    expect(store.isComplete).toBe(false)
    store.setAnswer('fk-b', 'functional', 2)
    expect(store.isComplete).toBe(false)
    store.setAnswer('fk-b', 'dysfunctional', 4)
    expect(store.isComplete).toBe(true)
  })

  test('isComplete is false on an empty store (no features yet)', () => {
    const store = useResponseDraftStore()
    expect(store.isComplete).toBe(false)
  })

  test('answeredCount counts each non-null Likert separately', () => {
    const store = useResponseDraftStore()
    store.initForPoll('poll-1', ['fk-a', 'fk-b'])
    expect(store.answeredCount).toBe(0)
    store.setAnswer('fk-a', 'functional', 3)
    store.setAnswer('fk-b', 'dysfunctional', 5)
    expect(store.answeredCount).toBe(2)
  })

  test('firstMissing walks features in caller order', () => {
    const store = useResponseDraftStore()
    store.initForPoll('poll-1', ['fk-a', 'fk-b', 'fk-c'])
    expect(store.firstMissing(['fk-a', 'fk-b', 'fk-c'])).toEqual({
      featureKey: 'fk-a',
      question: 'functional',
    })
    store.setAnswer('fk-a', 'functional', 3)
    expect(store.firstMissing(['fk-a', 'fk-b', 'fk-c'])).toEqual({
      featureKey: 'fk-a',
      question: 'dysfunctional',
    })
    store.setAnswer('fk-a', 'dysfunctional', 5)
    expect(store.firstMissing(['fk-a', 'fk-b', 'fk-c'])).toEqual({
      featureKey: 'fk-b',
      question: 'functional',
    })
  })

  test('firstMissing returns null when complete', () => {
    const store = useResponseDraftStore()
    store.initForPoll('poll-1', ['fk-a'])
    store.setAnswer('fk-a', 'functional', 3)
    store.setAnswer('fk-a', 'dysfunctional', 5)
    expect(store.firstMissing(['fk-a'])).toBeNull()
  })

  test('initForPoll on the SAME uuid preserves existing answers', () => {
    const store = useResponseDraftStore()
    store.initForPoll('poll-1', ['fk-a'])
    store.setAnswer('fk-a', 'functional', 3)
    store.initForPoll('poll-1', ['fk-a'])
    expect(store.getAnswer('fk-a', 'functional')).toBe(3)
  })

  test('initForPoll on a NEW uuid purges the prior draft', () => {
    const store = useResponseDraftStore()
    store.initForPoll('poll-1', ['fk-a'])
    store.setAnswer('fk-a', 'functional', 3)
    store.initForPoll('poll-2', ['fk-x', 'fk-y'])
    expect(store.activePollId).toBe('poll-2')
    expect(store.answers).toEqual({
      'fk-x': { fq_answer: null, dq_answer: null },
      'fk-y': { fq_answer: null, dq_answer: null },
    })
  })

  test('reset() purges everything', () => {
    const store = useResponseDraftStore()
    store.initForPoll('poll-1', ['fk-a'])
    store.setAnswer('fk-a', 'functional', 3)
    store.reset()
    expect(store.activePollId).toBeNull()
    expect(store.answers).toEqual({})
  })
})
