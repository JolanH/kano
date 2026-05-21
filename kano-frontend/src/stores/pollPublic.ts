/**
 * Pinia store for the respondent-facing poll snapshot.
 *
 * The shape served by `GET /api/v1/polls/:uuid` (Story 3.4) is fetched
 * once on `/poll/:uuid` and read by every downstream respondent screen
 * (`/poll/:uuid/q/:index` — Story 4.6, `/poll/:uuid/submit-confirm` —
 * Story 4.7). Re-fetching on each route transition would burn a network
 * round-trip per question and risk mid-flow `expires_at` drift.
 *
 * **Scope guard**: this store is imported only by `/poll/*` code. PM-side
 * code (`/app/*`) must NEVER import `usePollPublicStore`; the respondent
 * bundle gate (`scripts/check-respondent-bundle.mjs`, Story 3.8) enforces
 * the reverse direction. The architectural separation matters: this
 * store carries no PII and the wire shape it holds is intentionally
 * narrow (NFR8), so cross-pollination with PM state would break that
 * minimal-disclosure contract.
 */

import { defineStore } from 'pinia'

import { KanoApiError, type PollPublic } from '@/api/types'
import { useApi } from '@/composables/useApi'

export type PollPublicFetchState =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'expired'
  | 'not-found'
  | 'error'

export interface PollPublicState {
  poll: PollPublic | null
  fetchState: PollPublicFetchState
  error: KanoApiError | null
}

export const usePollPublicStore = defineStore('pollPublic', {
  state: (): PollPublicState => ({
    poll: null,
    fetchState: 'idle',
    error: null,
  }),

  getters: {
    isLoaded: (state) => state.fetchState === 'loaded' && state.poll !== null,
    featureCount: (state) => state.poll?.features.length ?? 0,
    expiresAt: (state) => state.poll?.expires_at ?? null,
  },

  actions: {
    /**
     * Fetch `GET /api/v1/polls/:uuid` and translate the response (or
     * `KanoApiError`) into a `fetchState`. 410 → `'expired'`,
     * 404 → `'not-found'`, anything else (5xx, network) → `'error'`.
     */
    async loadPoll(uuid: string): Promise<void> {
      this.fetchState = 'loading'
      this.error = null
      const api = useApi()
      try {
        const { data } = await api.get<PollPublic>(`/polls/${uuid}`)
        this.poll = data
        this.fetchState = 'loaded'
      } catch (err) {
        if (err instanceof KanoApiError) {
          this.error = err
          if (err.status === 410) this.fetchState = 'expired'
          else if (err.status === 404) this.fetchState = 'not-found'
          else this.fetchState = 'error'
        } else {
          this.fetchState = 'error'
        }
      }
    },

    reset(): void {
      this.poll = null
      this.fetchState = 'idle'
      this.error = null
    },
  },
})
