<template>
  <v-card class="pa-6 text-center" data-testid="expired-poll">
    <v-icon icon="mdi-clock-alert" size="48" color="warning" class="mb-4" aria-hidden="true" />
    <h1 class="text-h3 mb-3">{{ copy('respondent.expired.title') }}</h1>
    <p class="text-body-1 mb-5">{{ copy('respondent.expired.body') }}</p>
    <v-btn
      :href="mailtoHref"
      size="large"
      variant="tonal"
      color="primary"
      :text="copy('respondent.expired.contactCta')"
      data-testid="expired-poll-contact"
    />
  </v-card>
</template>

<script lang="ts" setup>
/**
 * Production-quality (per Story 3.8 Dev Notes — NOT a stub) expired-poll
 * surface. FR27 is fully satisfied here; Story 4.4 reuses this component
 * verbatim.
 *
 * The mailto target is configurable via `VITE_PRODUCT_CONTACT_EMAIL`; the
 * default ("product@tixeo.com") covers the standard Tixeo deployment.
 */
import { computed } from 'vue'

import { useCopy } from '@/composables/useCopy'

const copy = useCopy()

const mailtoHref = computed(() => {
  const target = import.meta.env.VITE_PRODUCT_CONTACT_EMAIL || 'product@tixeo.com'
  return `mailto:${target}`
})
</script>
