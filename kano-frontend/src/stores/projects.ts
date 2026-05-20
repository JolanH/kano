/**
 * Projects store — single source of truth for the PM workspace's project
 * state.
 *
 * Per architecture §Frontend Component Boundaries, components never call
 * `useApi()` directly for domain data. Pages and components consume this
 * store; the store owns every backend round-trip.
 *
 * `current` is null when no project detail is loaded yet, or when the most
 * recent `loadProject()` call resolved to a 404. `lastLoadError` lets pages
 * branch on `NotFoundError` without re-throwing.
 */

import { defineStore } from 'pinia'

import { KanoApiError, NotFoundError } from '@/api/types'
import type {
  Feature,
  Project,
  ProjectCreateInput,
  ProjectDetail,
  ProjectSummary,
  ProjectUpdateInput,
} from '@/api/types'
import { useApi } from '@/composables/useApi'

export interface FeatureMutationOptions {
  acknowledged?: boolean
}

export interface FeatureCreateInput {
  name: string
  description?: string | null
}

export interface FeatureUpdateInput {
  name?: string
  description?: string | null
}

interface ProjectsState {
  items: ProjectSummary[]
  current: ProjectDetail | null
  isLoading: boolean
  lastLoadError: KanoApiError | null
  pastEpochFeatures: Feature[] | null
  pastEpochNumber: number | null
}

export const useProjectsStore = defineStore('projects', {
  state: (): ProjectsState => ({
    items: [],
    current: null,
    isLoading: false,
    lastLoadError: null,
    pastEpochFeatures: null,
    pastEpochNumber: null,
  }),

  actions: {
    async loadProjects(): Promise<void> {
      const api = useApi()
      this.isLoading = true
      this.lastLoadError = null
      try {
        const { data } = await api.get<ProjectSummary[]>('/projects/')
        this.items = data
      } catch (err) {
        if (err instanceof KanoApiError) this.lastLoadError = err
        throw err
      } finally {
        this.isLoading = false
      }
    },

    async createProject(input: ProjectCreateInput): Promise<Project> {
      const api = useApi()
      const { data } = await api.post<Project>('/projects/', input)
      // Optimistically prepend to the in-memory list — backend orders
      // newest-first, so this matches the post-refresh ordering.
      this.items = [
        {
          id: data.id,
          name: data.name,
          version: data.version,
          current_epoch: data.current_epoch,
          created_at: data.created_at,
        },
        ...this.items,
      ]
      return data
    },

    async loadProject(id: string): Promise<void> {
      const api = useApi()
      this.isLoading = true
      this.lastLoadError = null
      this.current = null
      try {
        const { data } = await api.get<ProjectDetail>(`/projects/${id}`)
        this.current = data
      } catch (err) {
        if (err instanceof NotFoundError) {
          this.lastLoadError = err
          return
        }
        if (err instanceof KanoApiError) this.lastLoadError = err
        throw err
      } finally {
        this.isLoading = false
      }
    },

    async updateProject(id: string, input: ProjectUpdateInput): Promise<void> {
      const api = useApi()
      const { data } = await api.patch<Project>(`/projects/${id}`, input)
      // Mirror the change in both `current` and the list-row projection.
      if (this.current && this.current.id === id) {
        this.current = { ...this.current, ...data }
      }
      this.items = this.items.map((p) =>
        p.id === id
          ? {
              id: data.id,
              name: data.name,
              version: data.version,
              current_epoch: data.current_epoch,
              created_at: data.created_at,
            }
          : p,
      )
    },

    async refreshCurrent(): Promise<void> {
      if (!this.current) return
      await this.loadProject(this.current.id)
    },

    async loadProjectEpochFeatures(projectId: string, epoch: number): Promise<void> {
      const api = useApi()
      const { data } = await api.get<Feature[]>(
        `/projects/${projectId}/epochs/${epoch}/features`,
      )
      this.pastEpochFeatures = data
      this.pastEpochNumber = epoch
    },

    clearPastEpoch(): void {
      this.pastEpochFeatures = null
      this.pastEpochNumber = null
    },

    async createFeature(
      projectId: string,
      input: FeatureCreateInput,
      { acknowledged = false }: FeatureMutationOptions = {},
    ): Promise<Feature> {
      const api = useApi()
      const path = `/projects/${projectId}/features`
      const body: Record<string, unknown> = {
        name: input.name,
        description: input.description ?? null,
      }
      if (acknowledged) body.acknowledged = true
      const { data } = await api.post<Feature>(path, body)
      // If we're showing the detail page for this project, push the new
      // feature into the active list so the editor reflects state without a
      // refetch round-trip. Only do so on Branch A (in-place create at the
      // same epoch); on Branch C the bump invalidates everything and the
      // parent will call `refreshCurrent`.
      if (this.current && this.current.id === projectId && data.epoch === this.current.current_epoch) {
        this.current = {
          ...this.current,
          active_features: [...this.current.active_features, data],
        }
      }
      return data
    },

    async updateFeature(
      projectId: string,
      featureKey: string,
      input: FeatureUpdateInput,
      { acknowledged = false }: FeatureMutationOptions = {},
    ): Promise<Feature> {
      const api = useApi()
      const path = `/projects/${projectId}/features/${featureKey}`
      const body: Record<string, unknown> = {}
      if (input.name !== undefined) body.name = input.name
      if (input.description !== undefined) body.description = input.description
      if (acknowledged) body.acknowledged = true
      const { data } = await api.patch<Feature>(path, body)

      if (
        this.current &&
        this.current.id === projectId &&
        data.epoch === this.current.current_epoch
      ) {
        this.current = {
          ...this.current,
          active_features: this.current.active_features.map((f) =>
            f.feature_key === featureKey ? { ...f, ...data } : f,
          ),
        }
      }
      return data
    },

    async deleteFeature(
      projectId: string,
      featureKey: string,
      { acknowledged = false }: FeatureMutationOptions = {},
    ): Promise<void> {
      const api = useApi()
      const path = `/projects/${projectId}/features/${featureKey}`
      const body = acknowledged ? { acknowledged: true } : undefined
      await api.delete<null>(path, body)
      if (this.current && this.current.id === projectId) {
        this.current = {
          ...this.current,
          active_features: this.current.active_features.filter(
            (f) => f.feature_key !== featureKey,
          ),
        }
      }
    },
  },
})
