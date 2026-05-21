<template>
  <section v-if="pollsStore.currentPoll" data-testid="poll-share-page">
    <header class="mb-4 d-flex align-center ga-3">
      <v-btn
        variant="text"
        prepend-icon="mdi-arrow-left"
        :to="{ name: 'project-detail', params: { id: projectId } }"
        :text="copy('pm.projects.detail.generatePoll.backToProject')"
        data-testid="poll-share-back"
      />
    </header>
    <PollSharePanel :poll="pollsStore.currentPoll" />
  </section>
</template>

<script lang="ts" setup>
/**
 * Share view mounted after a successful "Generate poll URL" click.
 *
 * Deep-link refresh is intentionally NOT supported in v1: this view reads
 * `pollsStore.currentPoll`, which is set by `createPoll()` immediately
 * before the route push. A page refresh / direct link drops the store
 * state — in that case we redirect back to the project detail so the PM
 * can click Generate again. A PM-facing per-poll GET endpoint would
 * close that gap; not in Epic 3 scope (Story 3-6 Dev Notes).
 */
import { onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import PollSharePanel from '@/components/PollSharePanel.vue'
import { useCopy } from '@/composables/useCopy'
import { usePollsStore } from '@/stores/polls'

const copy = useCopy()
const route = useRoute()
const router = useRouter()
const pollsStore = usePollsStore()

const rawId = route.params.id
const projectId = Array.isArray(rawId) ? rawId[0] : rawId

onMounted(() => {
  if (!pollsStore.currentPoll) {
    // Store miss → redirect back to the project detail. The PM re-issues
    // the action from there.
    void router.replace({ name: 'project-detail', params: { id: projectId } })
  }
})

onBeforeUnmount(() => {
  // Drop the handoff so a back/forward navigation can't render a stale
  // share view from a previous create.
  pollsStore.clearCurrentPoll()
})
</script>
