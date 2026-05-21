<template>
  <div class="poll-landing" data-testid="poll-landing">
    <div v-if="store.fetchState === 'loading'" class="d-flex justify-center pa-6">
      <v-progress-circular
        indeterminate
        color="primary"
        :aria-label="copy('respondent.landing.loading')"
      />
    </div>
    <LiveLanding
      v-else-if="store.isLoaded"
      :poll="store.poll!"
      @begin="onBegin"
    />
    <ExpiredPoll v-else-if="store.fetchState === 'expired'" />
    <PollNotFound v-else-if="store.fetchState === 'not-found'" />
    <PollLoadError v-else @retry="reload" />
  </div>
</template>

<script lang="ts" setup>
/**
 * Respondent landing — Story 4.4 replacement for the Story 3.8 stub.
 *
 * The page is a pure dispatcher: it owns the `loadPoll` call and routes
 * the `fetchState` to one of five surfaces. All HTTP / error-mapping
 * lives in `usePollPublicStore` (see store docstring for why this stops
 * being a "useApi-direct" surface as of Story 4.4).
 *
 * **No `data-stub="true"` attribute anywhere** — its presence in the
 * Story 3.8 stub was the structural marker for "delete this file
 * wholesale when Story 4.4 ships." A grep guard in the e2e spec asserts
 * its absence as a regression check.
 *
 * Bundle isolation (Story 3.8 AC #1): this file and its store import
 * NOTHING from `src/pages/app/**` or PM-only components. The
 * `check-respondent-bundle.mjs` postbuild hook keeps that invariant
 * green.
 */
import { onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useCopy } from '@/composables/useCopy'
import ExpiredPoll from '@/pages/poll/ExpiredPoll.vue'
import LiveLanding from '@/pages/poll/LiveLanding.vue'
import PollLoadError from '@/pages/poll/PollLoadError.vue'
import PollNotFound from '@/pages/poll/PollNotFound.vue'
import { usePollPublicStore } from '@/stores/pollPublic'

const copy = useCopy()
const route = useRoute()
const router = useRouter()
const store = usePollPublicStore()

function resolvedUuid(): string {
  const raw = route.params.uuid
  return Array.isArray(raw) ? raw[0] : raw
}

async function reload(): Promise<void> {
  await store.loadPoll(resolvedUuid())
}

function onBegin(): void {
  router.push({
    name: 'poll-question',
    params: { uuid: resolvedUuid(), index: 0 },
  })
}

onMounted(reload)
onBeforeUnmount(() => {
  // Clear state on leave so a re-mount (e.g. user pastes a different poll
  // URL) starts from `idle` rather than flashing the previous poll for
  // one frame while the new fetch is in flight.
  store.reset()
})

defineExpose({ store, reload, onBegin })
</script>

<style scoped>
.poll-landing {
  min-height: 70vh;
}
</style>
