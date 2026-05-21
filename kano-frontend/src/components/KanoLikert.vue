<template>
  <fieldset
    class="kano-likert"
    :class="{ 'has-error': showError }"
    :aria-describedby="showError ? errorId : undefined"
    data-testid="kano-likert"
    @keydown="onKeydown"
  >
    <legend :id="labelId" class="question">{{ questionText }}</legend>
    <v-radio-group
      :model-value="modelValue"
      :aria-labelledby="labelId"
      class="kano-likert-group"
      hide-details
      @update:model-value="onSelect"
    >
      <v-radio
        v-for="opt in options"
        :key="opt.value"
        :value="opt.value"
        :label="opt.label"
        :data-value="opt.value"
        :data-testid="`kano-likert-option-${opt.value}`"
        class="option-card"
      />
    </v-radio-group>
    <p
      v-if="showError"
      :id="errorId"
      class="error-message"
      role="alert"
      data-testid="kano-likert-error"
    >
      {{ copy('respondent.likert.error.unanswered') }}
    </p>
  </fieldset>
</template>

<script lang="ts" setup>
/**
 * The single Likert picker for respondent surfaces — five plain-language
 * options stacked vertically, auto-advancing after a 150 ms confirmation
 * (0 ms when `prefers-reduced-motion: reduce`), with keyboard `1`–`5`
 * scoped to the fieldset.
 *
 * Wraps Vuetify's `v-radio-group` per UX-spec §Custom Components line 831
 * so ARIA `role="radiogroup"`, arrow-key nav, focus ring, and theming all
 * come for free; only the auto-advance timing and the `1`–`5` shortcut
 * are bespoke.
 *
 * The component is intentionally "dumb" about its own error state — when
 * `showError=true` and the user selects an option, the parent observes
 * `update:modelValue` and flips the prop back. This keeps KanoLikert a
 * pure controlled input and defers the clearing policy (immediate vs
 * deferred) to Story 4-7's submit guard.
 */
import { computed, useId } from 'vue'

import type { PollPublicFeature } from '@/api/types'
import { useCopy } from '@/composables/useCopy'
import { useReducedMotion } from '@/composables/useReducedMotion'

interface Props {
  question: 'functional' | 'dysfunctional'
  feature: PollPublicFeature
  modelValue: number | null
  showError?: boolean
  confirmationMs?: number
}

const props = withDefaults(defineProps<Props>(), {
  showError: false,
  confirmationMs: 150,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
  'auto-advance': [value: number]
}>()

const copy = useCopy()
const reducedMotion = useReducedMotion()

const labelId = useId()
const errorId = useId()

const questionText = computed(() =>
  copy(`respondent.likert.question.${props.question}`, {
    featureName: props.feature.name,
  }),
)

const options = computed(() => [
  { value: 1, label: copy('respondent.likert.1') },
  { value: 2, label: copy('respondent.likert.2') },
  { value: 3, label: copy('respondent.likert.3') },
  { value: 4, label: copy('respondent.likert.4') },
  { value: 5, label: copy('respondent.likert.5') },
])

function commit(value: number): void {
  emit('update:modelValue', value)
  const delay = reducedMotion.value ? 0 : props.confirmationMs
  if (delay <= 0) {
    emit('auto-advance', value)
  } else {
    setTimeout(() => emit('auto-advance', value), delay)
  }
}

function onSelect(value: number | string | null): void {
  // Vuetify hands us the radio value as-is; defensive Number() because
  // v-radio occasionally stringifies depending on prop binding.
  if (value === null || value === undefined) return
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num) || num < 1 || num > 5) return
  commit(num)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key < '1' || event.key > '5') return
  // Ignore modifier combos so Cmd-1 / Ctrl-1 (browser tab nav) still works.
  if (event.metaKey || event.ctrlKey || event.altKey) return
  event.preventDefault()
  commit(Number(event.key))
}

defineExpose({ options, questionText })
</script>

<style scoped>
.kano-likert {
  display: block;
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 16px;
  margin: 0;
  transition: border-color 150ms ease;
}

.kano-likert.has-error {
  border-color: rgb(var(--v-theme-error, 211 47 47));
}

.question {
  /* AC #1: respondent body-large 18 px, weight 500. */
  font-size: 1.125rem;
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: 16px;
  padding: 0;
}

.kano-likert-group :deep(.v-radio) {
  /* AC #2: ≥ 56 px tall option card; ≥ 44 px touch target is implicit. */
  min-height: 56px;
}

.option-card {
  transition: background-color 150ms ease, transform 150ms ease;
}

.option-card:deep(.v-selection-control--dirty) {
  background-color: rgba(var(--v-theme-primary, 25 118 210), 0.08);
}

.error-message {
  margin-top: 12px;
  color: rgb(var(--v-theme-error, 211 47 47));
  font-size: 0.875rem;
}

@media (prefers-reduced-motion: reduce) {
  .kano-likert,
  .option-card {
    transition: none;
  }
}
</style>
