<script setup lang="ts">
/**
 * <AnalysisErrorSurface> — typed error rendering for the analysis page.
 *
 * Branches on `useApi`'s `KanoApiError` subclass hierarchy (Story 1.6 +
 * Story 3.4 precedent), never on raw numeric status codes:
 *
 * - `NotFoundError` (404) → a `v-card` with the "Poll not found" copy and
 *   a back-to-projects link. No retry — the URL is wrong, retrying won't
 *   help.
 * - Everything else (5xx `ServerError`, native `fetch` failures from
 *   offline / DNS / CORS that `useApi` does NOT wrap into a typed
 *   `KanoApiError`, JSON-parse failures, etc.) → a `v-alert` with a retry
 *   button that re-invokes the parent page's `load`. The alternative is a
 *   blank surface with a console error, which is worse for Paola.
 */

import { NotFoundError } from '@/api/types'
import { useCopy } from '@/composables/useCopy'

interface Props {
  // Widened to `Error` so native `fetch` failures (which propagate as
  // `TypeError`s without being re-classified into `KanoApiError`) can be
  // surfaced through the same retryable-alert branch as 5xx errors.
  error: Error
  projectId: string | null
}

defineProps<Props>()
const emit = defineEmits<{ (e: 'retry'): void }>()

const copy = useCopy()
</script>

<template>
  <div class="analysis-error">
    <v-card
      v-if="error instanceof NotFoundError"
      class="error-card"
      variant="outlined"
      data-testid="analysis-error-not-found"
    >
      <v-card-title class="error-title">
        {{ copy('analysis.error.notFound.title') }}
      </v-card-title>
      <v-card-text class="error-body">
        {{ copy('analysis.error.notFound.body') }}
      </v-card-text>
      <v-card-actions>
        <v-btn
          :to="projectId
            ? { name: 'project-detail', params: { id: projectId } }
            : { name: 'projects' }"
          color="primary"
          variant="text"
          data-testid="analysis-error-back-link"
        >
          {{ copy('analysis.error.notFound.cta') }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-alert
      v-else
      type="error"
      variant="tonal"
      class="error-alert"
      :title="copy('analysis.error.load.title')"
      :text="copy('analysis.error.load.body')"
      data-testid="analysis-error-load"
    >
      <template #append>
        <v-btn
          color="error"
          variant="text"
          data-testid="analysis-error-retry"
          @click="emit('retry')"
        >
          {{ copy('analysis.error.load.retry') }}
        </v-btn>
      </template>
    </v-alert>
  </div>
</template>

<style scoped>
.analysis-error {
  max-width: 1440px;
  margin: 48px auto;
}

.error-card {
  padding: 24px;
}

.error-title {
  font-size: 20px;
  font-weight: 700;
}

.error-body {
  font-size: 16px;
  color: rgb(var(--v-theme-on-surface-variant));
}

.error-alert {
  margin: 0;
}
</style>
