<template>
  <v-card
    class="poll-share-panel pa-4"
    role="region"
    :aria-labelledby="titleId"
    data-testid="poll-share-panel"
  >
    <h2 :id="titleId" class="text-h6 mb-3">
      {{ copy('pm.polls.share.title') }}
    </h2>
    <div class="d-flex align-center ga-2 mb-3">
      <v-text-field
        ref="urlField"
        :model-value="shareUrl"
        readonly
        density="comfortable"
        hide-details
        class="poll-share-panel__url flex-grow-1"
        :label="copy('pm.polls.share.urlLabel')"
        :aria-label="copy('pm.polls.share.urlLabel')"
        style="font-family: monospace"
        data-testid="poll-share-url"
      />
      <v-btn
        color="primary"
        :prepend-icon="copyState === 'copied' ? 'mdi-check' : 'mdi-content-copy'"
        :text="copyState === 'copied' ? copy('pm.polls.share.copied') : copy('pm.polls.share.copy')"
        :aria-label="copy('pm.polls.share.copyButton.ariaLabel')"
        data-testid="poll-share-copy"
        @click="copyUrl"
      />
    </div>
    <div class="d-flex align-start ga-3 mb-2">
      <img
        v-if="qrDataUrl"
        :src="qrDataUrl"
        width="120"
        height="120"
        aria-hidden="true"
        alt=""
        class="poll-share-panel__qr"
        data-testid="poll-share-qr"
      />
      <div
        v-else
        class="poll-share-panel__qr poll-share-panel__qr--loading"
        aria-hidden="true"
        :style="{ width: '120px', height: '120px' }"
        data-testid="poll-share-qr-loading"
      />
      <p class="text-caption text-medium-emphasis ma-0">
        {{ copy('pm.polls.share.helperText') }}
      </p>
    </div>
    <v-snackbar
      :model-value="showCopiedSnackbar"
      :timeout="1200"
      location="bottom"
      role="status"
      aria-live="polite"
      data-testid="poll-share-snackbar"
      @update:model-value="showCopiedSnackbar = $event"
    >
      {{ copy('pm.polls.share.copiedAnnouncement') }}
    </v-snackbar>
    <v-snackbar
      :model-value="showFailedSnackbar"
      :timeout="3000"
      location="bottom"
      color="error"
      role="status"
      aria-live="polite"
      data-testid="poll-share-snackbar-failed"
      @update:model-value="showFailedSnackbar = $event"
    >
      {{ copy('pm.polls.share.copyFailed') }}
    </v-snackbar>
  </v-card>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, useId } from 'vue'

import { useCopy } from '@/composables/useCopy'
import { buildPollUrl } from '@/lib/pollUrl'
import type { PollSummary } from '@/api/types'

const props = defineProps<{
  poll: PollSummary
}>()

const copy = useCopy()
const titleId = `poll-share-title-${useId()}`

const shareUrl = computed(() => buildPollUrl(props.poll.id))

const qrDataUrl = ref<string | null>(null)

type CopyState = 'idle' | 'copied'
const copyState = ref<CopyState>('idle')
const showCopiedSnackbar = ref(false)
const showFailedSnackbar = ref(false)
let copyResetTimer: ReturnType<typeof setTimeout> | null = null
const urlField = ref<{ $el?: HTMLElement } | null>(null)

function flashCopied() {
  copyState.value = 'copied'
  showCopiedSnackbar.value = true
  if (copyResetTimer) clearTimeout(copyResetTimer)
  copyResetTimer = setTimeout(() => {
    copyState.value = 'idle'
    showCopiedSnackbar.value = false
  }, 1200)
}

function flashFailed() {
  showFailedSnackbar.value = true
  // Best-effort: leave the URL selected so the user can Ctrl/⌘+C.
  const input = urlField.value?.$el?.querySelector<HTMLInputElement>('input')
  input?.select()
  setTimeout(() => {
    showFailedSnackbar.value = false
  }, 3000)
}

function trySynchronousFallback(): boolean {
  // `document.execCommand('copy')` requires a *transient* user activation.
  // Running it synchronously inside the click handler preserves that
  // activation — running it from the `.catch()` of `clipboard.writeText`
  // does not (the microtask boundary consumes the activation in Firefox
  // and Safari). So try the legacy path first when the Clipboard API
  // looks unavailable, and as the sync rescue when the async path rejects
  // we re-enter this same function on the next user click (no silent
  // microtask fallback).
  const input = urlField.value?.$el?.querySelector<HTMLInputElement>('input')
  if (!input) return false
  input.focus()
  input.select()
  try {
    return document.execCommand('copy') === true
  } catch {
    return false
  }
}

function copyUrl() {
  const url = shareUrl.value
  const clipboardWrite = typeof navigator !== 'undefined'
    ? navigator.clipboard?.writeText?.bind(navigator.clipboard)
    : undefined

  if (!clipboardWrite) {
    // No async API → sync fallback inside this user-activation tick.
    if (trySynchronousFallback()) flashCopied()
    else flashFailed()
    return
  }

  // Modern path. We do NOT chain a `.catch(execCommand)` here because
  // the activation is gone by then on Firefox/Safari; on rejection we
  // surface the manual-copy snackbar with the URL pre-selected.
  clipboardWrite(url).then(
    () => flashCopied(),
    () => flashFailed(),
  )
}

onMounted(async () => {
  // Dynamic import keeps `qrcode` out of the PM main bundle — only loaded
  // when this component first mounts. See Story 3.5 Dev Notes.
  const { toDataURL } = await import('qrcode')
  qrDataUrl.value = await toDataURL(shareUrl.value, { width: 120, margin: 1 })
})
</script>

<style scoped>
.poll-share-panel__url :deep(input) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.poll-share-panel__qr {
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #fff;
}
.poll-share-panel__qr--loading {
  background: rgba(0, 0, 0, 0.04);
}
</style>
