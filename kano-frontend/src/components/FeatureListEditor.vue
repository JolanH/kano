<template>
  <div
    role="grid"
    class="pm-feature-grid"
    :aria-label="copy('pm.features.editor.grid.aria')"
    data-testid="feature-list-editor"
  >
    <div
      v-for="(feature, rowIndex) in features"
      :key="feature.feature_key"
      role="row"
      :data-feature-key="feature.feature_key"
      class="pm-feature-row"
    >
      <div role="gridcell" class="pm-feature-cell pm-feature-cell--name">
        <input
          :ref="(el) => bindNameInput(rowIndex, el)"
          :value="rowDraft(feature.feature_key).name"
          type="text"
          class="pm-cell-input"
          :aria-label="copy('pm.features.editor.col.name')"
          :placeholder="copy('pm.features.editor.col.name')"
          @input="onCellInput($event, feature.feature_key, 'name')"
          @keydown.enter.prevent="commitRow(feature)"
          @keydown.esc.prevent="cancelRow(feature.feature_key)"
          @keydown.backspace="onBackspace($event, feature, rowIndex)"
          @blur="commitRow(feature)"
        />
      </div>
      <div role="gridcell" class="pm-feature-cell pm-feature-cell--description">
        <textarea
          :ref="(el) => bindDescInput(rowIndex, el)"
          :value="rowDraft(feature.feature_key).description"
          rows="1"
          maxlength="2048"
          class="pm-cell-input pm-cell-textarea"
          :aria-label="copy('pm.features.editor.col.description')"
          :placeholder="copy('pm.features.editor.col.description')"
          @input="onCellInput($event, feature.feature_key, 'description')"
          @keydown.esc.prevent="cancelRow(feature.feature_key)"
          @blur="commitRow(feature)"
        />
      </div>
      <div role="gridcell" class="pm-feature-cell pm-feature-cell--actions">
        <button
          type="button"
          class="pm-row-delete"
          :aria-label="copy('pm.features.editor.delete.aria')"
          data-testid="feature-delete"
          @click="onDelete(feature)"
        >
          <span class="mdi mdi-delete-outline pm-row-icon" aria-hidden="true" />
        </button>
      </div>
  </div>

    <div role="row" class="pm-feature-row pm-feature-row--new" data-testid="feature-new-row">
      <div role="gridcell" class="pm-feature-cell pm-feature-cell--name">
        <input
          ref="newNameInput"
          v-model="draftNew.name"
          type="text"
          class="pm-cell-input"
          :aria-label="copy('pm.features.editor.newRow.placeholder.name')"
          :placeholder="copy('pm.features.editor.newRow.placeholder.name')"
          data-testid="feature-new-name"
          @keydown.enter.prevent="commitNew"
          @keydown.esc.prevent="cancelNew"
          @paste="onNewRowPaste"
        />
      </div>
      <div role="gridcell" class="pm-feature-cell pm-feature-cell--description">
        <textarea
          ref="newDescInput"
          v-model="draftNew.description"
          rows="1"
          maxlength="2048"
          class="pm-cell-input pm-cell-textarea"
          :aria-label="copy('pm.features.editor.newRow.placeholder.description')"
          :placeholder="copy('pm.features.editor.newRow.placeholder.description')"
          data-testid="feature-new-description"
          @keydown.esc.prevent="cancelNew"
          @blur="commitNew"
        />
      </div>
      <div role="gridcell" class="pm-feature-cell pm-feature-cell--actions">
        <button
          type="button"
          class="pm-row-submit"
          :aria-label="copy('pm.features.editor.submit.aria')"
          data-testid="feature-new-submit"
          :disabled="!draftNew.name.trim()"
          @click="commitNew"
        >
          <span class="mdi mdi-check pm-row-icon" aria-hidden="true" />
        </button>
      </div>
    </div>

    <p
      v-if="errorMessage"
      role="alert"
      class="text-body-2 text-error mt-2"
      data-testid="feature-editor-error"
    >
      {{ errorMessage }}
    </p>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'

import { ConflictError, KanoApiError, PROBLEM_TYPE, isProblemType } from '@/api/types'
import type { Feature } from '@/api/types'
import { useCopy } from '@/composables/useCopy'
import { useProjectsStore } from '@/stores/projects'

export interface EpochBumpEventPayload {
  /** Replay the same mutation with `?acknowledged=true`. Resolves with the new epoch. */
  mutation: () => Promise<void>
  currentEpoch: number
  wouldBeEpoch: number
}

const props = defineProps<{
  features: Feature[]
  projectId: string
}>()

const emit = defineEmits<{
  (e: 'epoch-bump-required', payload: EpochBumpEventPayload): void
  (e: 'feature-created', feature: Feature): void
  (e: 'feature-updated', feature: Feature): void
  (e: 'feature-deleted', featureKey: string): void
}>()

const copy = useCopy()
const store = useProjectsStore()

interface RowDraft {
  name: string
  description: string
  dirty: boolean
}

const drafts = reactive<Record<string, RowDraft>>({})
const draftNew = reactive<{ name: string; description: string }>({ name: '', description: '' })
const errorMessage = ref<string | null>(null)
const nameInputRefs = ref<Array<HTMLInputElement | null>>([])
const descInputRefs = ref<Array<HTMLTextAreaElement | null>>([])
const newNameInput = ref<HTMLInputElement | null>(null)
const newDescInput = ref<HTMLTextAreaElement | null>(null)
const inFlight = new Set<string>()
// Feature keys that have an outstanding epoch-bump dialog. Blur/Enter
// commits are no-ops while a key is in this set so a focus-steal from the
// dialog doesn't re-fire the mutation that triggered the 409.
const awaitingBump = reactive(new Set<string>())
// Same lock for the new-row create path: when paste-multi-line or a single
// Enter triggers the dialog, additional blurs must not re-create features
// while the user is in the dialog.
const newRowAwaitingBump = ref(false)
// In-flight lock for the new-row create. Mirrors `inFlight` for existing
// rows: the new-row description now commits on blur AND the name commits on
// Enter, so two triggers can fire before the first POST resolves (draftNew
// is only cleared after the await). Without this guard that races into a
// duplicate feature.
const newRowInFlight = ref(false)

const featureKeys = computed(() => props.features.map((f) => f.feature_key))

watch(
  featureKeys,
  () => {
    // Initialize / prune drafts so the map mirrors the props.features list.
    for (const key of featureKeys.value) {
      if (!drafts[key]) {
        const source = props.features.find((f) => f.feature_key === key)
        if (!source) continue
        drafts[key] = {
          name: source.name,
          description: source.description ?? '',
          dirty: false,
        }
      }
    }
    for (const key of Object.keys(drafts)) {
      if (!featureKeys.value.includes(key)) delete drafts[key]
    }
  },
  { immediate: true },
)

function bindNameInput(index: number, el: unknown) {
  nameInputRefs.value[index] = (el as HTMLInputElement | null) ?? null
}

function bindDescInput(index: number, el: unknown) {
  descInputRefs.value[index] = (el as HTMLTextAreaElement | null) ?? null
}

function rowDraft(featureKey: string): RowDraft {
  // Lazy ensure — watcher already creates these for each row, but a row
  // created mid-render (newly inserted feature) needs a fallback.
  if (!drafts[featureKey]) {
    const source = props.features.find((f) => f.feature_key === featureKey)
    drafts[featureKey] = {
      name: source?.name ?? '',
      description: source?.description ?? '',
      dirty: false,
    }
  }
  return drafts[featureKey]
}

function onCellInput(event: Event, featureKey: string, field: 'name' | 'description') {
  const value = (event.target as HTMLInputElement).value
  const draft = rowDraft(featureKey)
  draft[field] = value
  draft.dirty = true
}

async function commitRow(feature: Feature): Promise<void> {
  const draft = drafts[feature.feature_key]
  // Guards (in order):
  //   - no draft yet              → nothing to commit
  //   - row not dirty             → user didn't change anything
  //   - already in flight         → another commit is mid-request
  //   - awaiting epoch-bump ack   → a 409 has already opened the dialog;
  //                                 blurs from focus-steal must NOT re-fire
  //                                 the same mutation. The dialog's confirm/
  //                                 cancel path is the only legitimate way
  //                                 to retry.
  if (
    !draft ||
    !draft.dirty ||
    inFlight.has(feature.feature_key) ||
    awaitingBump.has(feature.feature_key)
  ) {
    return
  }

  const name = draft.name.trim()
  const description = draft.description.trim()
  if (!name) {
    // Empty name on commit reverts to the prior value.
    draft.name = feature.name
    draft.dirty = false
    return
  }

  const input = {
    name,
    description: description ? description : null,
  }
  inFlight.add(feature.feature_key)
  try {
    const updated = await store.updateFeature(props.projectId, feature.feature_key, input)
    draft.name = updated.name
    draft.description = updated.description ?? ''
    draft.dirty = false
    emit('feature-updated', updated)
  } catch (err) {
    handleMutationError(
      err,
      () =>
        store.updateFeature(props.projectId, feature.feature_key, input, { acknowledged: true }),
      'update',
      feature.feature_key,
    )
  } finally {
    inFlight.delete(feature.feature_key)
  }
}

function cancelRow(featureKey: string) {
  const feature = props.features.find((f) => f.feature_key === featureKey)
  if (!feature) return
  drafts[featureKey] = {
    name: feature.name,
    description: feature.description ?? '',
    dirty: false,
  }
}

function onBackspace(event: KeyboardEvent, feature: Feature, rowIndex: number) {
  const draft = drafts[feature.feature_key]
  // Only trigger delete when the row is genuinely empty after this keystroke;
  // otherwise let Backspace edit the field normally.
  if (!draft) return
  const isCurrentCellEmpty = (event.target as HTMLInputElement).value === ''
  const otherFieldEmpty =
    (event.target as HTMLInputElement).getAttribute('aria-label') ===
    copy('pm.features.editor.col.name')
      ? !draft.description.trim()
      : !draft.name.trim()
  if (isCurrentCellEmpty && otherFieldEmpty) {
    event.preventDefault()
    void deleteFeature(feature).then(() => focusPreviousRow(rowIndex))
  }
}

async function deleteFeature(feature: Feature): Promise<void> {
  if (inFlight.has(feature.feature_key) || awaitingBump.has(feature.feature_key)) return
  inFlight.add(feature.feature_key)
  try {
    await store.deleteFeature(props.projectId, feature.feature_key)
    emit('feature-deleted', feature.feature_key)
  } catch (err) {
    handleMutationError(
      err,
      () => store.deleteFeature(props.projectId, feature.feature_key, { acknowledged: true }),
      'delete',
      feature.feature_key,
    )
  } finally {
    inFlight.delete(feature.feature_key)
  }
}

function onDelete(feature: Feature) {
  void deleteFeature(feature)
}

function focusPreviousRow(currentIndex: number) {
  void nextTick(() => {
    const prev = nameInputRefs.value[currentIndex - 1]
    prev?.focus?.()
  })
}

async function commitNew(): Promise<void> {
  const name = draftNew.name.trim()
  if (!name) return
  if (newRowAwaitingBump.value || newRowInFlight.value) return
  const description = draftNew.description.trim() || null
  newRowInFlight.value = true
  try {
    const created = await store.createFeature(props.projectId, { name, description })
    emit('feature-created', created)
    draftNew.name = ''
    draftNew.description = ''
    void nextTick(() => newNameInput.value?.focus?.())
  } catch (err) {
    handleMutationError(
      err,
      () =>
        store
          .createFeature(props.projectId, { name, description }, { acknowledged: true })
          .then(() => undefined),
      'create',
      null,
    )
  } finally {
    newRowInFlight.value = false
  }
}

function cancelNew() {
  draftNew.name = ''
  draftNew.description = ''
  newNameInput.value?.blur?.()
}

function onNewRowPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text/plain') ?? ''
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length <= 1) return // let the default single-line paste happen
  event.preventDefault()
  void (async () => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      try {
        const feature = await store.createFeature(props.projectId, {
          name: line,
          description: null,
        })
        emit('feature-created', feature)
      } catch (err) {
        // 409 on the i-th line: the parent's epoch-bump dialog (Story 2-11)
        // replays this line with ack. The REMAINING lines (i+1..N-1) are
        // queued — after the replay succeeds, we resume the paste loop on
        // the parent's behalf so a 50-line paste doesn't silently drop 49
        // entries because the first one tripped the bump gate.
        const remaining = lines.slice(i + 1)
        const lineForReplay = line
        handleMutationError(
          err,
          async () => {
            await store.createFeature(
              props.projectId,
              { name: lineForReplay, description: null },
              { acknowledged: true },
            )
            // After the bump, the project's current_epoch is N+1. Continue
            // pasting the rest at the new epoch — these are now Branch A
            // (the just-confirmed bump moved us past the gate, no further
            // dialog needed unless yet another poll lands mid-paste, which
            // is fine — the same handler would fire again).
            for (const next of remaining) {
              try {
                const f = await store.createFeature(props.projectId, {
                  name: next,
                  description: null,
                })
                emit('feature-created', f)
              } catch {
                // Swallow remaining errors; the per-feature error message
                // is surfaced by `errorMessage` on the next failure. We do
                // NOT want a paste-of-50 to throw 49 dialogs at the user.
                break
              }
            }
          },
          'create',
          null,
        )
        return
      }
    }
    draftNew.name = ''
    draftNew.description = ''
  })()
}

function handleMutationError(
  err: unknown,
  retryAcknowledged: () => Promise<unknown>,
  kind: 'create' | 'update' | 'delete',
  // `null` for the new-row create path (no feature_key yet); a UUID string
  // for update/delete (where the row already exists). Used to gate
  // subsequent blur/Enter commits while the bump dialog is open.
  featureKey: string | null,
) {
  if (err instanceof ConflictError && isProblemType(err.problem, PROBLEM_TYPE.EPOCH_BUMP_REQUIRED)) {
    const problem = err.problem as unknown as {
      current_epoch?: number
      would_be_epoch?: number
    }
    if (featureKey) awaitingBump.add(featureKey)
    else newRowAwaitingBump.value = true
    emit('epoch-bump-required', {
      mutation: async () => {
        try {
          await retryAcknowledged()
        } finally {
          // Clear the gate once the replay resolves — success or otherwise.
          // The parent's dialog flow re-fetches state on success/cancel, so
          // drafts re-init from authoritative data after the unlock.
          if (featureKey) awaitingBump.delete(featureKey)
          else newRowAwaitingBump.value = false
        }
      },
      currentEpoch: problem.current_epoch ?? 0,
      wouldBeEpoch: problem.would_be_epoch ?? 0,
    })
    return
  }
  if (err instanceof KanoApiError) {
    errorMessage.value = copy(`pm.features.editor.error.${kind}`)
    return
  }
  throw err
}
</script>

<style scoped>
.pm-feature-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 4px;
  padding: 4px;
}

.pm-feature-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) auto;
  align-items: start;
  gap: 8px;
  padding: 2px 4px;
  border-radius: 4px;
}

.pm-feature-row:hover {
  background-color: rgba(0, 0, 0, 0.03);
}

.pm-feature-row--new {
  background-color: rgba(0, 0, 0, 0.015);
}

.pm-feature-cell {
  min-width: 0;
}

.pm-cell-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  font: inherit;
  color: inherit;
}

.pm-cell-input:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.pm-cell-textarea {
  resize: vertical;
  min-height: 36px;
  line-height: 1.4;
  overflow-y: auto;
}

.pm-row-delete,
.pm-row-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: rgb(var(--v-theme-on-surface-variant));
  line-height: 1;
}

.pm-row-submit {
  color: rgb(var(--v-theme-primary));
}

.pm-row-submit:disabled {
  color: rgb(var(--v-theme-on-surface-variant));
  opacity: 0.4;
  cursor: default;
}

.pm-row-icon {
  display: inline-block;
  width: 18px;
  height: 18px;
  font-size: 18px;
  line-height: 18px;
  text-align: center;
}

.pm-row-delete:focus-visible,
.pm-row-submit:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
  border-radius: 4px;
}
</style>
