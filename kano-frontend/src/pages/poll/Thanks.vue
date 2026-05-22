<template>
  <section class="respondent-thanks" data-testid="poll-thanks">
    <v-card class="pa-6 text-center">
      <!-- tabindex="-1" makes the heading programmatically focusable
           without entering the tab order; Story 4-8 AC #7 sets initial
           focus here so screen readers announce the page on landing. -->
      <h1
        ref="heading"
        tabindex="-1"
        class="thanks-title v-card-title"
        data-testid="poll-thanks-title"
      >
        {{ copy('respondent.thanks.title') }}
      </h1>
      <v-card-text>{{ copy('respondent.thanks.body') }}</v-card-text>
    </v-card>
  </section>
</template>

<script lang="ts" setup>
/**
 * Respondent thanks page — the respectful close of the flow.
 *
 * Per epics line 1177 + UX-DR25: NO next-action CTA, NO "answer
 * another survey," NO social-share, NO footer links. Just an
 * acknowledgement that the submission landed.
 *
 * The route does NOT re-fetch the poll, NOT re-open the draft, NOT
 * call any API. The submission has already been accepted (204 from
 * `/polls/:uuid/submit`); re-validating the poll state here would
 * be paranoid ceremony with no user benefit. Even if the poll has
 * since expired between the 204 and this render, the acknowledgement
 * is unconditional.
 */
import { nextTick, onMounted, ref } from 'vue'

import { useCopy } from '@/composables/useCopy'

const copy = useCopy()

const heading = ref<HTMLElement | null>(null)
onMounted(async () => {
  await nextTick()
  heading.value?.focus()
})
</script>

<style scoped>
.respondent-thanks {
  padding-top: 24px;
}

.thanks-title {
  /* Remove the *default* outline for mouse focus only; keep a visible ring
   * for keyboard users so :focus-visible from the programmatic focus()
   * call satisfies WCAG 2.1 SC 2.4.7 (Focus Visible). */
  outline: none;
}

.thanks-title:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary, 25 118 210));
  outline-offset: 4px;
  border-radius: 4px;
}
</style>
