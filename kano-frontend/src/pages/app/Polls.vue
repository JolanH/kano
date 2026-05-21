<template>
  <section :aria-label="copy('pm.polls.title')" data-testid="polls-page">
    <header class="d-flex align-center mb-4">
      <h1 class="text-h2">{{ copy('pm.polls.title') }}</h1>
    </header>

    <v-card
      v-if="showEmptyState"
      class="pa-8 text-center"
      data-testid="polls-empty-state"
    >
      <v-icon icon="mdi-poll" size="48" color="primary" class="mb-4" aria-hidden="true" />
      <div class="text-h6 mb-2">{{ copy('pm.polls.empty.title') }}</div>
      <p class="text-body-1 mb-4">{{ emptyStateBody }}</p>
      <v-btn
        color="primary"
        size="large"
        :to="{ name: 'projects' }"
        :text="emptyStateCta"
        data-testid="polls-empty-cta"
      />
    </v-card>

    <v-data-table
      v-else
      :headers="headers"
      :items="rows"
      :loading="pollsStore.isLoading"
      :items-per-page="-1"
      :sort-by="[{ key: 'created_at', order: 'desc' }]"
      density="compact"
      hover
      class="pm-polls-table"
      data-testid="polls-table"
      :loading-text="copy('pm.polls.loading')"
      :no-data-text="copy('pm.polls.empty.title')"
      :row-props="rowClassProps"
      @click:row="onRowClick"
    >
      <template #item.project_name="{ item }">
        <router-link
          :to="{ name: 'project-detail', params: { id: item.project_id } }"
          class="text-primary"
          data-testid="polls-row-project-link"
          @click.stop
        >
          {{ projectLabel(item) }}
        </router-link>
      </template>
      <template #item.epoch="{ item }">
        <v-chip size="small" variant="flat">
          {{ copy('common.version') }} {{ item.epoch }}
        </v-chip>
      </template>
      <template #item.expires_in="{ item }">
        <span v-if="item.is_expired" class="text-error" data-testid="polls-row-expired">
          {{ copy('pm.polls.expired') }}
        </span>
        <span v-else>{{ formatCountdown(item) }}</span>
      </template>
      <template #item.created_at="{ value }">
        {{ formatDate(value as string) }}
      </template>
    </v-data-table>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import type { PollSummaryWithProject } from '@/api/types'
import { useCopy } from '@/composables/useCopy'
import { usePollsStore } from '@/stores/polls'
import { useProjectsStore } from '@/stores/projects'

const copy = useCopy()
const router = useRouter()
const pollsStore = usePollsStore()
const projectsStore = useProjectsStore()

const headers = computed(() => [
  { title: copy('pm.polls.columns.project'), key: 'project_name', sortable: true },
  { title: copy('pm.polls.columns.version'), key: 'epoch', sortable: false },
  {
    title: copy('pm.polls.columns.responses'),
    key: 'response_count',
    sortable: true,
    align: 'end' as const,
  },
  { title: copy('pm.polls.columns.expiresIn'), key: 'expires_in', sortable: false },
  { title: copy('pm.polls.columns.created'), key: 'created_at', sortable: true },
])

const rows = computed(() => pollsStore.items)

// Empty state only renders after the first `loadAllPolls` resolves — otherwise
// the "No polls yet" card briefly flashes on every visit before the network
// fires (items=[] and isLoading=false are both true for one frame). Once
// `hasLoaded` is true, the empty-state visibility tracks the real data.
const showEmptyState = computed(
  () =>
    pollsStore.hasLoaded &&
    !pollsStore.isLoading &&
    pollsStore.items.length === 0,
)

const hasProjects = computed(() => projectsStore.items.length > 0)

// Discriminate "no projects, no polls" (true blank-slate) from "projects
// exist, no polls yet" — the CTA points the PM at the right next action
// instead of "Create your first project" when they already have ten.
const emptyStateBody = computed(() =>
  hasProjects.value
    ? copy('pm.polls.empty.hasProjectsBody')
    : copy('pm.polls.empty.noProjectsBody'),
)
const emptyStateCta = computed(() =>
  hasProjects.value
    ? copy('pm.polls.empty.hasProjectsCta')
    : copy('pm.polls.empty.noProjectsCta'),
)

onMounted(() => {
  void pollsStore.loadAllPolls()
  // Fire-and-forget — we only need a project count to discriminate the
  // empty-state copy. If the request fails, the empty state still renders
  // with the safe "no projects yet" wording.
  if (!projectsStore.items.length) void projectsStore.loadProjects().catch(() => {})
})

function rowClassProps({ item }: { item: PollSummaryWithProject }) {
  return item.is_expired ? { class: 'text-medium-emphasis polls-row--expired' } : {}
}

function onRowClick(
  event: PointerEvent | MouseEvent | undefined,
  payload: { item: PollSummaryWithProject },
) {
  // Vuetify's `@click:row` fires from the <tr> handler; `@click.stop` on
  // an inner router-link is unreliable across versions because Vuetify
  // sometimes wires the row click via mousedown. Bail out when the click
  // landed inside an interactive descendant so the link's own navigation
  // wins, no double-fire.
  const target = (event?.target as HTMLElement | null) ?? null
  if (target?.closest('a, button')) return

  const item = payload.item
  if (item.is_expired) {
    void router.push({
      name: 'poll-analysis',
      params: { id: item.project_id, pollId: item.id },
    })
    return
  }
  // Seed the share view's `currentPoll` from the cached row so PollShare
  // doesn't redirect back to the project detail on store-miss.
  pollsStore.selectPollById(item.id)
  void router.push({
    name: 'poll-share',
    params: { id: item.project_id, pollId: item.id },
  })
}

function projectLabel(item: PollSummaryWithProject): string {
  return item.project_name || copy('pm.polls.projectMissing')
}

function formatCountdown(item: PollSummaryWithProject): string {
  // Server is the source of truth for expiry. `is_expired` is already
  // checked at the cell level — but guard against clock-skew so a row
  // whose `expires_at` reads "in the past" by browser time but
  // `is_expired === false` per server doesn't render "expiring now"
  // misleadingly.
  if (item.is_expired) return copy('pm.polls.expired')
  const remaining = new Date(item.expires_at).getTime() - Date.now()
  if (remaining <= 0) {
    // Server says not expired, client says it is → present the server's
    // view (a small positive countdown) rather than a contradiction.
    return copy('pm.polls.countdown.expiringNow')
  }
  const minutes = Math.floor(remaining / 60_000)
  if (minutes < 1) return copy('pm.polls.countdown.expiringNow')
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1) {
    return copy(days === 1 ? 'pm.polls.countdown.day' : 'pm.polls.countdown.days', { n: days })
  }
  if (hours >= 1) {
    return copy(hours === 1 ? 'pm.polls.countdown.hour' : 'pm.polls.countdown.hours', { n: hours })
  }
  return copy('pm.polls.countdown.minutes', { n: minutes })
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function formatDate(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return dateFormatter.format(parsed)
}
</script>

<style scoped>
.pm-polls-table :deep(tbody tr) {
  cursor: pointer;
}
.pm-polls-table :deep(tr.polls-row--expired) {
  opacity: 0.7;
}
</style>
