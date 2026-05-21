<template>
  <v-card class="pa-6 text-center" data-testid="poll-load-error">
    <v-icon icon="mdi-alert-circle-outline" size="48" color="error" class="mb-4" aria-hidden="true" />
    <h1 class="text-h3 mb-3">{{ copy('respondent.loadError.title') }}</h1>
    <p class="text-body-1 mb-5">{{ copy('respondent.loadError.body') }}</p>
    <v-btn
      size="large"
      color="primary"
      :text="copy('respondent.loadError.retry')"
      data-testid="poll-load-error-retry"
      @click="emit('retry')"
    />
  </v-card>
</template>

<script lang="ts" setup>
/**
 * Distinct surface for non-410/404 errors (5xx, network, parse). Keeps
 * deploy outages from masquerading as "URL not found" and gives the
 * respondent a retry affordance instead of an apologetic dead-end.
 *
 * Reused by Story 4.4's full landing (same composition, different
 * mount point).
 */
import { useCopy } from '@/composables/useCopy'

const copy = useCopy()
const emit = defineEmits<{ retry: [] }>()
</script>