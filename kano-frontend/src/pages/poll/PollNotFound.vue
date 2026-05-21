<template>
  <v-card class="pa-6 text-center" data-testid="poll-not-found">
    <v-icon icon="mdi-link-variant-off" size="48" color="error" class="mb-4" aria-hidden="true" />
    <h1 class="text-h3 mb-3">{{ copy('respondent.notFound.title') }}</h1>
    <p class="text-body-1 mb-5">{{ copy('respondent.notFound.body') }}</p>
    <v-btn
      :href="mailtoHref"
      size="large"
      variant="tonal"
      color="primary"
      :text="copy('respondent.expired.contactCta')"
      data-testid="poll-not-found-contact"
    />
  </v-card>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

import { useCopy } from '@/composables/useCopy'

const copy = useCopy()

const mailtoHref = computed(() => {
  const target = import.meta.env.VITE_PRODUCT_CONTACT_EMAIL || 'product@tixeo.com'
  return `mailto:${target}`
})
</script>
