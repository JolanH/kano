<template>
  <section v-if="isMissing" data-testid="project-not-found">
    <v-card class="pa-6 text-center">
      <v-icon icon="mdi-folder-remove" size="48" color="primary" class="mb-4" aria-hidden="true" />
      <div class="text-h2 mb-2">{{ copy('pm.projectDetail.notFound.title') }}</div>
      <p class="text-body-1 mb-4">{{ copy('pm.projectDetail.notFound.body') }}</p>
      <v-btn color="primary" to="/app/projects">
        {{ copy('pm.projectDetail.notFound.cta') }}
      </v-btn>
    </v-card>
  </section>

  <section
    v-else-if="store.current"
    :aria-label="store.current.name"
    data-testid="project-detail"
  >
    <header class="mb-6">
      <div class="d-flex align-center ga-3 mb-2">
        <span
          v-if="!isEditing('name')"
          ref="nameDisplay"
          class="text-h2 pm-inline-edit"
          tabindex="0"
          :aria-label="copy('pm.projectDetail.name.aria')"
          data-testid="project-name-display"
          @click="beginEdit('name')"
          @keydown.enter="beginEdit('name')"
        >
          {{ store.current.name }}
        </span>
        <v-text-field
          v-else
          ref="nameInput"
          v-model="draft.name"
          density="compact"
          variant="outlined"
          hide-details
          :error-messages="errors.name"
          :aria-label="copy('pm.projectDetail.name.aria')"
          data-testid="project-name-input"
          class="pm-inline-input"
          @keydown.enter="commitEdit('name')"
          @keydown.esc="cancelEdit()"
          @blur="commitEdit('name')"
        />
        <v-chip color="secondary" data-testid="project-epoch-badge">
          {{ copy('common.version') }} {{ store.current.current_epoch }}
        </v-chip>
        <v-spacer />
        <EpochSelector
          :current-epoch="store.current.current_epoch"
          :selected-epoch="viewingEpoch"
          :project-id="store.current.id"
        />
      </div>

      <v-alert
        v-if="isViewingPast"
        type="info"
        variant="tonal"
        class="mt-3"
        role="status"
        data-testid="viewing-past-banner"
      >
        {{
          copy('pm.viewingPast.banner', {
            n: viewingEpoch,
            current: store.current.current_epoch,
          })
        }}
        <template #append>
          <v-btn
            variant="text"
            density="comfortable"
            :to="{ path: `/app/projects/${store.current.id}`, query: {} }"
            :text="copy('pm.viewingPast.returnCta')"
            data-testid="viewing-past-return"
          />
        </template>
      </v-alert>

      <div class="d-flex align-center ga-2 text-on-surface-variant">
        <span
          v-if="!isEditing('version')"
          class="text-body-1 pm-inline-edit"
          tabindex="0"
          :aria-label="copy('pm.projectDetail.version.aria')"
          data-testid="project-version-display"
          @click="beginEdit('version')"
          @keydown.enter="beginEdit('version')"
        >
          {{ store.current.version }}
        </span>
        <v-text-field
          v-else
          ref="versionInput"
          v-model="draft.version"
          density="compact"
          variant="outlined"
          hide-details
          :error-messages="errors.version"
          :aria-label="copy('pm.projectDetail.version.aria')"
          data-testid="project-version-input"
          class="pm-inline-input"
          @keydown.enter="commitEdit('version')"
          @keydown.esc="cancelEdit()"
          @blur="commitEdit('version')"
        />
      </div>
    </header>

    <v-card class="pa-4" data-testid="project-features-panel">
      <h2 class="text-h6 mb-3">{{ copy('pm.projectDetail.features.title') }}</h2>
      <template v-if="!isViewingPast">
        <EpochBumpBanner
          v-if="bannerVisible"
          :key="bannerKey"
          :current-epoch="store.current.current_epoch"
          @dismiss="bannerVisible = false"
        />
        <FeatureListEditor
          :features="store.current.active_features"
          :project-id="store.current.id"
          @epoch-bump-required="onEpochBumpRequired"
          @feature-created="onInPlaceMutation"
          @feature-updated="onInPlaceMutation"
          @feature-deleted="onInPlaceMutation"
        />
      </template>
      <ul
        v-else-if="store.pastEpochFeatures && store.pastEpochFeatures.length"
        class="pm-feature-list"
        data-testid="past-epoch-features"
      >
        <li v-for="f in store.pastEpochFeatures" :key="f.id">
          <span :class="{ 'text-decoration-line-through': f.is_active === false }">
            {{ f.name }}
          </span>
        </li>
      </ul>
      <p
        v-else
        class="text-body-2 text-on-surface-variant"
        data-testid="past-epoch-empty"
      >
        {{ copy('pm.projectDetail.features.empty') }}
      </p>
    </v-card>

    <EpochBumpDialog
      v-if="dialogContext"
      v-model="dialogOpen"
      :current-epoch="dialogContext.currentEpoch"
      :would-be-epoch="dialogContext.wouldBeEpoch"
      :on-confirm="dialogContext.mutation"
      @confirmed="onDialogConfirmed"
      @cancelled="onDialogCancelled"
    />

    <v-snackbar
      v-model="snackbarOpen"
      :timeout="4000"
      data-testid="epoch-bump-snackbar"
    >
      {{ snackbarMessage }}
    </v-snackbar>
  </section>

  <section v-else class="text-body-2 text-on-surface-variant" data-testid="project-loading">
    {{ copy('pm.projectDetail.loading') }}
  </section>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import EpochBumpBanner from '@/components/EpochBumpBanner.vue'
import EpochBumpDialog from '@/components/EpochBumpDialog.vue'
import EpochSelector from '@/components/EpochSelector.vue'
import FeatureListEditor, {
  type EpochBumpEventPayload,
} from '@/components/FeatureListEditor.vue'
import { KanoApiError, NotFoundError } from '@/api/types'
import { useCopy } from '@/composables/useCopy'
import { useProjectsStore } from '@/stores/projects'

type Field = 'name' | 'version'

const copy = useCopy()
const route = useRoute()
const store = useProjectsStore()

const editingField = ref<Field | null>(null)
const draft = reactive<{ name: string; version: string }>({ name: '', version: '' })
const errors = reactive<{ name?: string; version?: string }>({})
const nameInput = ref<HTMLElement | null>(null)
const versionInput = ref<HTMLElement | null>(null)
const nameDisplay = ref<HTMLElement | null>(null)

const isMissing = computed(() => store.lastLoadError instanceof NotFoundError)

function projectId(): string {
  const id = route.params.id
  return Array.isArray(id) ? id[0] : id
}

const viewingEpoch = computed<number>(() => {
  const raw = route.query.epoch
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw)
  return store.current?.current_epoch ?? 0
})

const isViewingPast = computed(
  () =>
    store.current !== null &&
    typeof route.query.epoch === 'string' &&
    Number(route.query.epoch) !== store.current.current_epoch,
)

onMounted(async () => {
  await store.loadProject(projectId())
  await maybeLoadPastEpoch()
  // Move keyboard focus to the page heading so SR users land somewhere
  // meaningful after the route transition from `/app/projects`. Without
  // this, focus stays on the (now-unmounted) table row and falls to body.
  void nextTick(() => {
    const el = nameDisplay.value as unknown as { focus?: () => void } | null
    el?.focus?.()
  })
})

watch(() => route.params.id, async (id) => {
  if (!id) return
  await store.loadProject(typeof id === 'string' ? id : id[0])
  await maybeLoadPastEpoch()
})

watch(() => route.query.epoch, async () => {
  await maybeLoadPastEpoch()
})

async function maybeLoadPastEpoch() {
  if (!store.current) return
  if (!isViewingPast.value) {
    store.clearPastEpoch()
    return
  }
  await store.loadProjectEpochFeatures(store.current.id, viewingEpoch.value)
}

function isEditing(field: Field): boolean {
  return editingField.value === field
}

function beginEdit(field: Field) {
  if (!store.current) return
  draft.name = store.current.name
  draft.version = store.current.version
  errors.name = undefined
  errors.version = undefined
  editingField.value = field
  void nextTick(() => {
    const target = field === 'name' ? nameInput.value : versionInput.value
    const el = target as unknown as { focus?: () => void } | null
    el?.focus?.()
  })
}

function cancelEdit() {
  editingField.value = null
  errors.name = undefined
  errors.version = undefined
}

const dialogOpen = ref(false)
const dialogContext = ref<EpochBumpEventPayload | null>(null)
const snackbarOpen = ref(false)
const snackbarMessage = ref('')
const bannerVisible = ref(false)
const bannerKey = ref(0)
// We store a *selector* rather than the HTMLElement itself: a successful
// epoch-bump completes with `store.refreshCurrent()` which re-renders the
// FeatureListEditor, and the original input node may have been re-keyed
// out of the DOM by the time we restore focus. Walking up the DOM for the
// stable `[data-feature-key]` ancestor gives us a path back to the same
// cell after re-render.
const epochBumpReturnFocusSelector = ref<string | null>(null)

function selectorForCell(active: Element | null): string | null {
  if (!(active instanceof HTMLElement) || active === document.body) return null
  if (active.dataset.testid === 'project-name-display') {
    return '[data-testid="project-name-display"]'
  }
  if (active.dataset.testid === 'project-version-display') {
    return '[data-testid="project-version-display"]'
  }
  // FeatureListEditor cells: identified by ancestor row's data-feature-key
  // plus the input's aria-label (Feature vs Description).
  const row = active.closest<HTMLElement>('[data-feature-key]')
  const label = active.getAttribute('aria-label')
  if (row && label) {
    const key = row.dataset.featureKey
    // CSS attribute selector is safe here — feature_key is a backend-issued
    // slug ([a-z0-9-]) per Story 2-6, and the aria-label is a static copy
    // string. No user-controlled chars reach the selector.
    return `[data-feature-key="${key}"] input[aria-label="${label}"]`
  }
  return null
}

function onEpochBumpRequired(payload: EpochBumpEventPayload) {
  // Always update the replay payload (later emits may carry a fresher
  // mutation closure), but DON'T overwrite the return-focus selector once
  // the dialog has already opened — a second emit can arrive when the
  // triggering input fires @blur as Vuetify's focus-trap moves focus into
  // the dialog, and at that point document.activeElement is the dialog's
  // Cancel button, not the original cell we want to restore to.
  dialogContext.value = payload
  if (!dialogOpen.value) {
    epochBumpReturnFocusSelector.value = selectorForCell(document.activeElement)
    dialogOpen.value = true
  }
}

function restoreEpochBumpFocus() {
  const selector = epochBumpReturnFocusSelector.value
  epochBumpReturnFocusSelector.value = null
  if (!selector) return
  // Vuetify's v-overlay focus-trap tears down on its own animation frame
  // after `modelValue` flips to false. A synchronous `.focus()` (or a Vue
  // `nextTick`) runs *before* that teardown and gets immediately stolen
  // back into the dialog. rAF×2 lets the trap finish releasing AND lets
  // `store.refreshCurrent`'s flush complete, then we re-query the DOM for
  // a fresh element matching the stable selector and focus it.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(selector)
      el?.focus?.()
    })
  })
}

async function onDialogConfirmed() {
  try {
    snackbarMessage.value = copy('pm.versionBump.nowEditing', {
      n: dialogContext.value?.wouldBeEpoch ?? 0,
    })
    snackbarOpen.value = true
    await store.refreshCurrent()
  } finally {
    dialogContext.value = null
    restoreEpochBumpFocus()
  }
}

function onDialogCancelled() {
  dialogContext.value = null
  // Revert any pending edit by re-fetching the project's authoritative state.
  void store.refreshCurrent()
  restoreEpochBumpFocus()
}

function onInPlaceMutation() {
  // Branch-A confirmation: surface the soft banner. `bannerKey` cycles the
  // component so the auto-dismiss timer restarts on every successful edit.
  bannerKey.value += 1
  bannerVisible.value = true
}

async function commitEdit(field: Field) {
  if (!store.current || editingField.value !== field) return
  const value = draft[field].trim()
  if (!value) {
    errors[field] = copy(`pm.projectDetail.${field}.aria` as 'pm.projectDetail.name.aria')
    return
  }
  if (value === store.current[field]) {
    editingField.value = null
    return
  }
  try {
    await store.updateProject(store.current.id, { [field]: value })
    editingField.value = null
  } catch (err) {
    if (err instanceof KanoApiError) {
      errors[field] = err.problem.detail ?? err.problem.title
    } else {
      throw err
    }
  }
}
</script>

<style scoped>
.pm-inline-edit {
  cursor: text;
  padding: 2px 4px;
  border-radius: 4px;
}

.pm-inline-edit:hover,
.pm-inline-edit:focus-visible {
  background-color: rgba(0, 0, 0, 0.04);
  outline: none;
}

.pm-inline-input {
  max-width: 360px;
}

.pm-feature-list {
  list-style: disc;
  padding-left: 20px;
  margin: 0;
}

.pm-feature-list li {
  margin: 4px 0;
}
</style>
