<template>
  <div class="poll-landing" data-stub="true" data-testid="poll-landing">
    <div v-if="state === 'loading'" class="d-flex justify-center pa-6">
      <v-progress-circular
        indeterminate
        color="primary"
        :aria-label="copy('respondent.landing.loading')"
      />
    </div>
    <LivePollStub v-else-if="state === 'live' && poll" :poll="poll" />
    <ExpiredPoll v-else-if="state === 'expired'" />
    <PollNotFound v-else-if="state === 'not-found'" />
    <PollLoadError v-else @retry="load" />
  </div>
</template>

<script lang="ts" setup>
/**
 * Respondent landing entry point (Story 3.8 stub).
 *
 * Story 4.4 will REPLACE this file wholesale with the real Begin-CTA-led
 * respondent landing. The `data-stub="true"` marker on the root element
 * is the structural breadcrumb for that future swap. `LivePollStub.vue`
 * goes with it; `ExpiredPoll.vue`, `PollNotFound.vue`, and
 * `PollLoadError.vue` get reused.
 *
 * **Intentional exception to the "components call stores, not useApi"
 * convention** (Story 2.9 Dev Notes): the respondent surface has no
 * shared state and pulling in a Pinia store would add weight to the
 * respondent chunk for zero benefit. See Story 3.8 Dev Notes.
 *
 * Bundle isolation matters here: NO imports from `src/pages/app/**`, no
 * PM-only Vuetify primitives (v-data-table, v-navigation-drawer, etc).
 * The post-build script enforces this; don't reach across the boundary.
 */
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { KanoApiError, type PollPublic } from '@/api/types'
import { useApi } from '@/composables/useApi'
import { useCopy } from '@/composables/useCopy'
import ExpiredPoll from '@/pages/poll/ExpiredPoll.vue'
import LivePollStub from '@/pages/poll/LivePollStub.vue'
import PollLoadError from '@/pages/poll/PollLoadError.vue'
import PollNotFound from '@/pages/poll/PollNotFound.vue'

type State = 'loading' | 'live' | 'expired' | 'not-found' | 'error'

const copy = useCopy()
const route = useRoute()
const api = useApi()

const state = ref<State>('loading')
const poll = ref<PollPublic | null>(null)

async function load() {
  state.value = 'loading'
  const rawUuid = route.params.uuid
  const uuid = Array.isArray(rawUuid) ? rawUuid[0] : rawUuid
  try {
    const { data } = await api.get<PollPublic>(`/polls/${uuid}`)
    poll.value = data
    state.value = 'live'
  } catch (err) {
    // 410 / 404 are user-facing closures. Everything else (5xx, network
    // failure, parse error) is a transient or operator-visible issue —
    // distinguishing them avoids the "deploy outage looks like a typo"
    // failure mode the adversarial review flagged.
    if (err instanceof KanoApiError && err.status === 410) {
      state.value = 'expired'
      return
    }
    if (err instanceof KanoApiError && err.status === 404) {
      state.value = 'not-found'
      return
    }
    state.value = 'error'
  }
}

onMounted(load)

// Expose for tests; Vue tree-shakes unused exports from prod builds.
defineExpose({ state, poll, load })
</script>

<style scoped>
.poll-landing {
  min-height: 70vh;
}
</style>