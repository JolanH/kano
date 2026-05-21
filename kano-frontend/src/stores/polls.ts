/**
 * Polls store — single source of truth for the PM-facing polls list and the
 * "I just created this poll" handoff into the share view.
 *
 * Per architecture §Frontend Component Boundaries, components do NOT call
 * `useApi()` directly; the store owns every poll-related round trip.
 *
 * `currentPoll` is the load-bearing field for Story 3-6's authoring → share
 * handoff: `createPoll` sets it, then `PollShare.vue` reads it on mount.
 * The cross-project list in `items` (Story 3-7) is prepended optimistically
 * on create so the PM home reflects the new poll without a refetch.
 *
 * `selectPollById` lets the PM home seed `currentPoll` from a cached row
 * before pushing to `/app/projects/:id/polls/:pollId/share` — without it,
 * every row click on the home page would round-trip through a redirect
 * (PollShare → project detail) because the post-create handoff is the only
 * other code path that sets `currentPoll`.
 */

import { defineStore } from 'pinia'

import { KanoApiError } from '@/api/types'
import type { PollSummary, PollSummaryWithProject } from '@/api/types'
import { useApi } from '@/composables/useApi'

interface PollsState {
  items: PollSummaryWithProject[]
  currentPoll: PollSummary | null
  // `hasLoaded` flips true after the first `loadAllPolls` resolves (success
  // or error). The PM home reads it alongside `isLoading` to suppress the
  // empty-state flash on first mount — without it, `items=[]` and
  // `isLoading=false` are simultaneously true for one frame on every visit.
  hasLoaded: boolean
  isLoading: boolean
  lastLoadError: KanoApiError | null
}

export const usePollsStore = defineStore('polls', {
  state: (): PollsState => ({
    items: [],
    currentPoll: null,
    hasLoaded: false,
    isLoading: false,
    lastLoadError: null,
  }),

  actions: {
    /**
     * `POST /projects/:id/polls`. On success sets `currentPoll` and prepends
     * to `items` with the project context lifted from the existing items[]
     * cache (or the projects store, if available) — never falls back to a
     * raw UUID for display. `loadAllPolls` later reconciles via refetch.
     *
     * On 422 `poll-requires-features`, re-raises the typed
     * `PollRequiresFeaturesError` so the calling view can show the inline
     * "Add at least one feature" warning instead of a generic toast.
     */
    async createPoll(
      projectId: string,
      projectContext?: { name: string; version: string },
    ): Promise<PollSummary> {
      const api = useApi()
      const { data } = await api.post<PollSummary>(
        `/projects/${projectId}/polls`,
        {},
      )
      this.currentPoll = data

      // Reuse the project name/version we already have (caller passes from
      // ProjectDetail.vue's projectsStore.current). Falling back to empty
      // strings is fine because the home view's UUID-display fallback was
      // replaced by a copy-deck placeholder — no raw UUID ever leaks to UI.
      const optimistic: PollSummaryWithProject = {
        ...data,
        project_name: projectContext?.name ?? '',
        project_version: projectContext?.version ?? '',
      }
      this.items = [optimistic, ...this.items]
      return data
    },

    /** `GET /polls` — populates the cross-project list (Story 3-7). */
    async loadAllPolls(): Promise<void> {
      const api = useApi()
      this.isLoading = true
      this.lastLoadError = null
      try {
        const { data } = await api.get<PollSummaryWithProject[]>('/polls')
        this.items = data
      } catch (err) {
        if (err instanceof KanoApiError) this.lastLoadError = err
        throw err
      } finally {
        this.isLoading = false
        this.hasLoaded = true
      }
    },

    /** `GET /projects/:id/polls` — per-project list (Story 3-7 / future use). */
    async loadPollsForProject(projectId: string): Promise<PollSummary[]> {
      const api = useApi()
      const { data } = await api.get<PollSummary[]>(
        `/projects/${projectId}/polls`,
      )
      return data
    },

    /**
     * Seed `currentPoll` from a cached `items[]` row so PollShare.vue can
     * render directly after a polls-home → share-panel navigation.
     * Returns true if a matching row was found and assigned, false if not
     * (caller can then redirect or refetch).
     */
    selectPollById(pollId: string): boolean {
      const found = this.items.find((p) => p.id === pollId)
      if (!found) return false
      this.currentPoll = found
      return true
    },

    /**
     * Clear the share-view handoff state. Called by `PollShare.vue` on
     * unmount so back-then-forward navigation can't re-render a stale
     * poll from a previous flow.
     */
    clearCurrentPoll(): void {
      this.currentPoll = null
    },
  },
})