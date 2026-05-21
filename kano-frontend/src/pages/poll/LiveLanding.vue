<template>
  <section class="live-landing" data-testid="live-landing">
    <header class="brand">
      <span class="brand-mark">{{ copy('respondent.landing.brand') }}</span>
    </header>
    <main class="content">
      <p class="trust-line" data-testid="live-landing-trust-line">
        {{ copy('respondent.landing.trustLine') }}
      </p>
      <v-btn
        ref="beginBtn"
        size="large"
        color="primary"
        class="begin-cta"
        data-testid="live-landing-begin"
        :aria-label="copy('respondent.landing.beginAriaLabel')"
        :text="copy('respondent.landing.beginCta')"
        @click="emit('begin')"
      />
    </main>
  </section>
</template>

<script lang="ts" setup>
/**
 * The "live poll" state for the respondent landing.
 *
 * One primary action: Begin. Nothing else. The trust line is the entire
 * pre-commit content per the UX spec — no privacy boilerplate, no share
 * widgets, no time-to-complete countdown beyond the "2–3 minutes" beat in
 * the trust line itself. UX-spec §Button Hierarchy line 978: one primary
 * button per visible section.
 *
 * Parent (`Landing.vue`) handles routing on `@begin`.
 */
import { nextTick, onMounted, ref } from 'vue'

import type { PollPublic } from '@/api/types'
import { useCopy } from '@/composables/useCopy'

const copy = useCopy()

defineProps<{ poll: PollPublic }>()
const emit = defineEmits<{ begin: [] }>()

// Vuetify wraps `<v-btn>` as a component; the underlying focusable
// element exposes `.$el` (or `.focus()` on v4+). On mount, push focus to
// the Begin CTA — Story 4-8 AC #7: "Begin button is the initial focus on
// landing". Vue Router does not auto-manage focus, so each route opts in
// explicitly.
const beginBtn = ref<{ $el?: HTMLElement; focus?: () => void } | null>(null)
onMounted(async () => {
  await nextTick()
  const target =
    typeof beginBtn.value?.focus === 'function'
      ? beginBtn.value
      : (beginBtn.value?.$el as HTMLElement | undefined)
  target?.focus?.()
})
</script>

<style scoped>
.live-landing {
  display: flex;
  flex-direction: column;
  min-height: 70vh;
  gap: 32px;
}

.brand {
  display: flex;
  justify-content: center;
  padding-top: 24px;
}

.brand-mark {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--v-theme-primary, currentColor);
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  text-align: center;
}

.trust-line {
  /* 18 px body-large per UX spec for the single pre-commit line. */
  font-size: 1.125rem;
  line-height: 1.5;
  color: var(--v-theme-on-surface, inherit);
  max-width: 32ch;
  margin: 0;
}

.begin-cta {
  /* 48 px thumb-friendly tap target per UX-spec §Button Hierarchy line 978. */
  min-height: 48px;
  min-width: 160px;
}
</style>
