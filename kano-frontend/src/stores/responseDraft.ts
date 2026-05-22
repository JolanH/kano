/**
 * In-memory draft of the respondent's answers — Story 4.6.
 *
 * Per FR25 (silent discard of partial submissions) and architecture
 * line 382 ("responseDraftStore … in-memory only"), this store carries
 * **no persistence**: closing the tab purges everything. Do not add
 * `persist: true`, do not write to localStorage, do not write to
 * sessionStorage.
 *
 * The store is keyed by `feature_key` (not `feature_id`) so it
 * round-trips through the public wire shape (`PollPublic.features[].
 * feature_key`) and matches Story 4.2's submission service which
 * resolves keys → ids before INSERT.
 *
 * Story 4.7 reads the same Map to assemble the submission body and to
 * decide whether the user is allowed to leave the submit-confirm page
 * (`isComplete`).
 */

import { defineStore } from 'pinia'

export type LikertQuestion = 'functional' | 'dysfunctional'

export interface DraftAnswerPair {
  fq_answer: number | null
  dq_answer: number | null
}

export interface FirstMissing {
  featureKey: string
  question: LikertQuestion
}

export interface ResponseDraftState {
  // Plain object instead of Map so Pinia devtools serialize it; the
  // key set is feature_key strings.
  answers: Record<string, DraftAnswerPair>
  activePollId: string | null
}

function blank(): DraftAnswerPair {
  return { fq_answer: null, dq_answer: null }
}

export const useResponseDraftStore = defineStore('responseDraft', {
  state: (): ResponseDraftState => ({
    answers: {},
    activePollId: null,
  }),

  getters: {
    isComplete(state): boolean {
      const entries = Object.values(state.answers)
      if (entries.length === 0) return false
      return entries.every(
        (pair) => pair.fq_answer !== null && pair.dq_answer !== null,
      )
    },
    answeredCount(state): number {
      let n = 0
      for (const pair of Object.values(state.answers)) {
        if (pair.fq_answer !== null) n += 1
        if (pair.dq_answer !== null) n += 1
      }
      return n
    },
  },

  actions: {
    /**
     * Seed the draft for a poll. If the active poll changes (user
     * pasted a new URL), the prior draft is purged — FR25 plus
     * the cross-poll isolation invariant.
     */
    initForPoll(uuid: string, featureKeys: string[]): void {
      if (this.activePollId === uuid) {
        // Re-init same poll: ensure every key has an entry, but keep
        // existing answers. New features can appear on a back-nav if the
        // PollPublic snapshot is reloaded (shouldn't happen — snapshot
        // is frozen — but defend cheaply).
        for (const key of featureKeys) {
          if (!(key in this.answers)) this.answers[key] = blank()
        }
        return
      }
      this.activePollId = uuid
      const next: Record<string, DraftAnswerPair> = {}
      for (const key of featureKeys) next[key] = blank()
      this.answers = next
    },

    setAnswer(featureKey: string, question: LikertQuestion, value: number): void {
      if (!(featureKey in this.answers)) this.answers[featureKey] = blank()
      if (question === 'functional') this.answers[featureKey].fq_answer = value
      else this.answers[featureKey].dq_answer = value
    },

    getAnswer(featureKey: string, question: LikertQuestion): number | null {
      const pair = this.answers[featureKey]
      if (!pair) return null
      return question === 'functional' ? pair.fq_answer : pair.dq_answer
    },

    /**
     * Story 4.7's submit guard uses this to scroll the respondent
     * back to the first un-answered question.
     *
     * **Caller invariant**: `featureKeys` MUST be the active poll's
     * features in the same order as `PollPublic.features`. The store
     * deliberately doesn't own the canonical order so it stays a thin
     * pure-state slice; passing a reordered or filtered list will
     * return a wrong answer (e.g. `[fk-b, fk-a]` could route the user
     * back to `fk-b` even though `fk-a` is also missing and rendered
     * first). The only correct caller pattern is
     * `pollPublicStore.poll.features.map(f => f.feature_key)`.
     */
    firstMissing(featureKeys: string[]): FirstMissing | null {
      for (const key of featureKeys) {
        const pair = this.answers[key]
        if (!pair) return { featureKey: key, question: 'functional' }
        if (pair.fq_answer === null) return { featureKey: key, question: 'functional' }
        if (pair.dq_answer === null) return { featureKey: key, question: 'dysfunctional' }
      }
      return null
    },

    reset(): void {
      this.answers = {}
      this.activePollId = null
    },
  },
})
