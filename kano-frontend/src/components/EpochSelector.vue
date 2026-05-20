<template>
  <span
    v-if="currentEpoch <= 1"
    class="text-body-2 pm-version-static"
    data-testid="epoch-selector-static"
  >
    {{ copy('common.version') }} {{ currentEpoch }}
  </span>
  <v-menu
    v-else
    v-model="open"
    location="bottom end"
    transition="fade-transition"
  >
    <template #activator="{ props: activator }">
      <v-btn
        v-bind="activator"
        variant="outlined"
        :aria-label="copy('pm.versionSelector.trigger.aria')"
        aria-haspopup="listbox"
        :aria-expanded="open ? 'true' : 'false'"
        data-testid="epoch-selector-trigger"
        append-icon="mdi-menu-down"
      >
        {{ copy('common.version') }} {{ selectedEpoch }}
      </v-btn>
    </template>

    <v-list role="listbox" density="compact" data-testid="epoch-selector-list">
      <v-list-item
        v-for="entry in entries"
        :key="entry.epoch"
        role="option"
        :data-epoch="entry.epoch"
        :data-testid="`epoch-selector-item-${entry.epoch}`"
        :aria-current="entry.epoch === currentEpoch ? 'true' : undefined"
        @click="onPick(entry.epoch)"
        @keydown.enter.prevent="onPick(entry.epoch)"
      >
        <v-list-item-title>
          {{ copy('common.version') }} {{ entry.epoch }}
          <span v-if="entry.epoch === currentEpoch" class="text-on-surface-variant ms-2">
            ({{ copy('pm.versionSelector.item.current') }})
          </span>
        </v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useCopy } from '@/composables/useCopy'

const props = defineProps<{
  /** The project's *current* epoch (i.e. its highest version). */
  currentEpoch: number
  /** The epoch the user is currently viewing (defaults to `currentEpoch`). */
  selectedEpoch?: number
  projectId: string
}>()

const copy = useCopy()
const router = useRouter()
const open = ref(false)

const selectedEpoch = computed(() => props.selectedEpoch ?? props.currentEpoch)

const entries = computed(() => {
  // Newest version first; e.g. currentEpoch=3 → [3, 2, 1].
  const out: { epoch: number }[] = []
  for (let n = props.currentEpoch; n >= 1; n -= 1) out.push({ epoch: n })
  return out
})

function onPick(epoch: number) {
  open.value = false
  const query =
    epoch === props.currentEpoch ? {} : { epoch: String(epoch) }
  void router.push({ path: `/app/projects/${props.projectId}`, query })
}
</script>
