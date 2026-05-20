<template>
  <v-dialog
    :model-value="modelValue"
    width="480"
    :persistent="isProcessing"
    data-testid="epoch-bump-dialog"
    @update:model-value="onDialogUpdate"
    @keydown.esc="onCancel"
  >
    <v-card>
      <v-card-title class="text-h6">
        {{ copy('pm.versionBump.dialog.title', { n: wouldBeEpoch }) }}
      </v-card-title>
      <v-card-text>
        <p class="mb-2">
          {{ copy('pm.versionBump.dialog.body.preserved', { current: currentEpoch }) }}
        </p>
        <p class="mb-0">
          {{ copy('pm.versionBump.dialog.body.newPolls', { next: wouldBeEpoch }) }}
        </p>
        <v-alert
          v-if="errorMessage"
          type="error"
          variant="tonal"
          class="mt-3"
          data-testid="epoch-bump-dialog-error"
        >
          {{ errorMessage }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          ref="cancelBtn"
          variant="text"
          :text="copy('pm.versionBump.dialog.cancel')"
          :disabled="isProcessing"
          data-testid="epoch-bump-cancel"
          @click="onCancel"
        />
        <v-btn
          color="primary"
          :text="copy('pm.versionBump.dialog.confirm', { n: wouldBeEpoch })"
          :loading="isProcessing"
          data-testid="epoch-bump-confirm"
          @click="onConfirmClick"
        />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, ref, watch } from 'vue'

import { useCopy } from '@/composables/useCopy'

const props = defineProps<{
  modelValue: boolean
  currentEpoch: number
  wouldBeEpoch: number
  onConfirm: () => Promise<void>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirmed'): void
  (e: 'cancelled'): void
}>()

const copy = useCopy()
const isProcessing = ref(false)
const errorMessage = ref<string | null>(null)
const cancelBtn = ref<{ $el?: HTMLElement } | null>(null)

// Vuetify 4's focus-trap initialises on the next animation frame which races
// our spec assertion. Pin focus to the Cancel CTA explicitly — Cancel-first
// is the safer default on a destructive epoch bump (an accidental Enter
// would otherwise confirm a new version). The host component re-mounts this
// dialog (via `v-if="dialogContext"`) on every open, so `onMounted` is the
// reliable hook — a `watch(modelValue)` would miss the initial true value.
function focusCancel() {
  const root = cancelBtn.value?.$el as HTMLElement | undefined
  const focusable =
    root?.matches?.('button') ? root : root?.querySelector?.('button')
  ;(focusable as HTMLElement | null | undefined)?.focus?.()
}

onMounted(() => {
  if (props.modelValue) void nextTick(focusCancel)
})
watch(
  () => props.modelValue,
  (open) => {
    if (open) void nextTick(focusCancel)
  },
)

async function onConfirmClick() {
  if (isProcessing.value) return
  errorMessage.value = null
  isProcessing.value = true
  try {
    await props.onConfirm()
    emit('confirmed')
    emit('update:modelValue', false)
  } catch {
    errorMessage.value = copy('pm.versionBump.dialog.error')
  } finally {
    isProcessing.value = false
  }
}

function onCancel() {
  if (isProcessing.value) return
  emit('cancelled')
  emit('update:modelValue', false)
}

function onDialogUpdate(value: boolean) {
  // Vuetify emits update:modelValue when the user clicks outside / presses
  // Esc. Mirror Cancel semantics: if it closes, treat as cancel (unless we
  // were the ones closing it after a confirm).
  if (!value && !isProcessing.value && props.modelValue) {
    emit('cancelled')
    emit('update:modelValue', false)
  }
}
</script>
