<template>
  <v-card class="pa-6 text-center" data-testid="live-poll-stub">
    <v-icon icon="mdi-clipboard-text-clock" size="48" color="primary" class="mb-4" aria-hidden="true" />
    <h1 class="text-h3 mb-3">{{ copy('respondent.landing.stub.title') }}</h1>
    <p class="text-body-1 mb-3">{{ copy('respondent.landing.stub.body') }}</p>
    <p class="text-body-2 text-medium-emphasis" data-testid="live-poll-stub-expires">
      {{ copy('respondent.landing.stub.expiresAt', { date: formattedExpiry }) }}
    </p>
  </v-card>
</template>

<script lang="ts" setup>
/**
 * Live-poll stub shown while Story 4.4 hasn't shipped the real respondent
 * landing yet. Story 4.4 will delete this file. The `data-stub="true"`
 * marker lives on the parent (`Landing.vue`) so the structural hook
 * outlives this exact file.
 *
 * Renders the poll's `expires_at` so the public-contract field is actually
 * consumed (otherwise it's dead weight on the wire). Date formatting uses
 * the deterministic `en-GB` locale to match the rest of the English copy
 * deck — see Polls.vue for the matching PM-side choice.
 */
import { computed } from 'vue'

import type { PollPublic } from '@/api/types'
import { useCopy } from '@/composables/useCopy'

const copy = useCopy()

const props = defineProps<{ poll: PollPublic }>()

const expiryFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'UTC',
})

const formattedExpiry = computed(() => {
  const parsed = new Date(props.poll.expires_at)
  if (Number.isNaN(parsed.getTime())) return props.poll.expires_at
  return `${expiryFormatter.format(parsed)} UTC`
})
</script>