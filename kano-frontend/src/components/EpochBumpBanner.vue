<template>
  <v-alert
    type="info"
    variant="tonal"
    closable
    role="status"
    aria-live="polite"
    :close-label="copy('pm.versionBump.banner.close')"
    data-testid="epoch-bump-banner"
    @click:close="dismiss"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    {{ copy('pm.versionBump.banner.inPlace', { n: currentEpoch }) }}
  </v-alert>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { useCopy } from '@/composables/useCopy'

const props = defineProps<{ currentEpoch: number }>()
const emit = defineEmits<{ (e: 'dismiss'): void }>()
const copy = useCopy()

const AUTO_DISMISS_MS = 4000
const timerId = ref<number | null>(null)
const isHovered = ref(false)
const isFocused = ref(false)
// Remaining time when paused. Lets resume use a tighter timeout instead of
// restarting the full 4s — so a user who reads ~3s then mouses away gets
// the last second before dismissal, not another 4s.
const remainingMs = ref(AUTO_DISMISS_MS)
const lastStartedAt = ref<number>(0)

function startTimer(ms: number) {
  clearTimer()
  if (ms <= 0) {
    emit('dismiss')
    return
  }
  remainingMs.value = ms
  lastStartedAt.value = Date.now()
  timerId.value = window.setTimeout(() => {
    timerId.value = null
    emit('dismiss')
  }, ms)
}

function clearTimer() {
  if (timerId.value !== null) {
    window.clearTimeout(timerId.value)
    timerId.value = null
  }
}

function pauseTimer() {
  // WCAG 2.2.1 — pause the auto-dismiss when the user reads (hover) or
  // tabs into (focus) the banner. Compute remaining time so resume picks
  // up where we left off rather than restarting the full window.
  if (timerId.value === null) return
  const elapsed = Date.now() - lastStartedAt.value
  remainingMs.value = Math.max(0, remainingMs.value - elapsed)
  clearTimer()
}

function resumeTimer() {
  if (timerId.value !== null) return // already running
  if (isHovered.value || isFocused.value) return // still paused
  startTimer(remainingMs.value)
}

function onMouseEnter() {
  isHovered.value = true
  pauseTimer()
}

function onMouseLeave() {
  isHovered.value = false
  resumeTimer()
}

function onFocusIn() {
  isFocused.value = true
  pauseTimer()
}

function onFocusOut() {
  isFocused.value = false
  resumeTimer()
}

onMounted(() => {
  startTimer(AUTO_DISMISS_MS)
})

onBeforeUnmount(() => {
  clearTimer()
})

function dismiss() {
  clearTimer()
  emit('dismiss')
}

// Silence "props is unused" warning under strict TS — `props.currentEpoch`
// is used in the template only.
void props
</script>
