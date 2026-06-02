<template>
  <div class="question-route" data-testid="question-route">
    <div
      v-if="store.fetchState === 'loading' || store.fetchState === 'idle'"
      class="d-flex justify-center pa-6"
    >
      <v-progress-circular
        indeterminate
        color="primary"
        :aria-label="copy('respondent.common.loading')"
      />
    </div>
    <ExpiredPoll v-else-if="store.fetchState === 'expired'" />
    <PollNotFound v-else-if="store.fetchState === 'not-found'" />
    <PollLoadError v-else-if="store.fetchState === 'error'" @retry="reload" />
    <section
      v-else-if="store.isLoaded && currentFeature"
      class="question-screen"
      tabindex="-1"
      data-testid="question-screen"
      @keydown="onKeydown"
    >
      <p class="progress-label" data-testid="progress-label">
        {{
          copy('respondent.flow.progressLabel', {
            current: indexNum + 1,
            total: featureCount,
          })
        }}
      </p>
      <v-progress-linear
        :model-value="progressFraction * 100"
        :aria-valuenow="indexNum + 1"
        :aria-valuemin="1"
        :aria-valuemax="featureCount"
        :aria-label="copy('respondent.flow.progressBarAriaLabel')"
        color="primary"
        height="6"
      />
      <h1 class="feature-name" data-testid="feature-name">
        {{ currentFeature.name }}
      </h1>
      <p
        v-if="currentFeature.description"
        class="feature-description"
        data-testid="feature-description"
      >
        {{ currentFeature.description }}
      </p>

      <hr/>

      <div class="likert-pair" data-testid="likert-pair">
        <KanoLikert
          question="functional"
          :feature="currentFeature"
          :model-value="functionalAnswer"
          :show-error="showFunctionalError"
          data-testid="kano-likert-functional"
          @update:model-value="onSelect('functional', $event)"
        />
        <KanoLikert
          question="dysfunctional"
          :feature="currentFeature"
          :model-value="dysfunctionalAnswer"
          :show-error="showDysfunctionalError"
          data-testid="kano-likert-dysfunctional"
          @update:model-value="onSelect('dysfunctional', $event)"
        />
      </div>
      <div class="feature-actions">
        <v-btn
          size="large"
          color="primary"
          class="feature-next-cta"
          data-testid="feature-next"
          :disabled="!bothAnswered"
          :text="isLastFeature ? copy('respondent.cta.submit') : copy('respondent.cta.next')"
          @click="onNext"
        />
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup>
/**
 * Per-feature respondent flow.
 *
 * `/poll/:uuid/q/:index` is a feature-index from `0..N-1`. Each screen
 * renders the feature's two Likert pickers — functional + dysfunctional
 * — side-by-side; auto-advance to the next feature fires only when
 * BOTH answers are set in the draft. Last feature's auto-advance routes
 * to `poll-submit-confirm`.
 *
 * State sources:
 * - `pollPublicStore` (Story 4.4) — the poll snapshot.
 * - `useResponseDraftStore` (this story) — in-memory answer draft.
 *
 * Error surfaces (`ExpiredPoll`, `PollNotFound`, `PollLoadError`) are
 * reused verbatim from Stories 3.8 / 4.4.
 */
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'

import KanoLikert from '@/components/KanoLikert.vue'
import { useCopy } from '@/composables/useCopy'
import ExpiredPoll from '@/pages/poll/ExpiredPoll.vue'
import PollLoadError from '@/pages/poll/PollLoadError.vue'
import PollNotFound from '@/pages/poll/PollNotFound.vue'
import { usePollPublicStore } from '@/stores/pollPublic'
import {
  useResponseDraftStore,
  type LikertQuestion,
} from '@/stores/responseDraft'

const copy = useCopy()
const route = useRoute()
const router = useRouter()
const store = usePollPublicStore()
const draft = useResponseDraftStore()

function resolvedParam(name: 'uuid' | 'index'): string {
  const raw = route.params[name]
  return Array.isArray(raw) ? raw[0] : raw
}

const uuid = computed(() => resolvedParam('uuid'))
const indexNum = computed(() => Number(resolvedParam('index')))

const features = computed(() => store.poll?.features ?? [])
const featureCount = computed(() => features.value.length)
const currentFeature = computed(() => {
  if (!store.isLoaded) return null
  return features.value[indexNum.value] ?? null
})
const progressFraction = computed(() => {
  if (featureCount.value === 0) return 0
  return (indexNum.value + 1) / featureCount.value
})

const functionalAnswer = computed(() => {
  if (!currentFeature.value) return null
  return draft.getAnswer(currentFeature.value.feature_key, 'functional')
})
const dysfunctionalAnswer = computed(() => {
  if (!currentFeature.value) return null
  return draft.getAnswer(currentFeature.value.feature_key, 'dysfunctional')
})

const bothAnswered = computed(
  () => functionalAnswer.value !== null && dysfunctionalAnswer.value !== null,
)
const isLastFeature = computed(
  () => featureCount.value > 0 && indexNum.value === featureCount.value - 1,
)

// Per-Likert error display: the `?showError=1` sentinel (set by
// SubmitConfirm's missing-answer guard) flags the page; each Likert
// renders its error variant only while its own draft entry is null.
// So once the user answers one of the two, that Likert's border clears
// while the other (still null) keeps its error border — no manual query
// clearing needed.
const showErrorFlag = computed(() => route.query.showError === '1')
const showFunctionalError = computed(
  () => showErrorFlag.value && functionalAnswer.value === null,
)
const showDysfunctionalError = computed(
  () => showErrorFlag.value && dysfunctionalAnswer.value === null,
)

function clearShowErrorQuery(): void {
  if (route.query.showError === undefined) return
  const next: LocationQuery = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (key === 'showError') continue
    next[key] = value
  }
  void router.replace({
    name: route.name as string,
    params: route.params,
    query: next,
  })
}

async function reload(): Promise<void> {
  await store.loadPoll(uuid.value)
  if (store.isLoaded && store.poll) {
    draft.initForPoll(
      uuid.value,
      store.poll.features.map((f) => f.feature_key),
    )
  }
}

function redirectIfOutOfRange(): boolean {
  if (!store.isLoaded) return false
  const total = featureCount.value
  if (
    !Number.isFinite(indexNum.value) ||
    indexNum.value < 0 ||
    indexNum.value >= total
  ) {
    const target = draft.isComplete ? 'poll-submit-confirm' : 'poll-landing'
    router.replace({ name: target, params: { uuid: uuid.value } })
    return true
  }
  return false
}

function onSelect(question: LikertQuestion, value: number): void {
  if (!currentFeature.value) return
  draft.setAnswer(currentFeature.value.feature_key, question, value)
  // Once the user has touched a Likert, the legacy ?showError=1 query
  // is stale: per-Likert null-detection now drives the visible error
  // border, and leaving the sentinel in the URL would re-trigger on a
  // subsequent back-nav. Drop it the first chance we get.
  clearShowErrorQuery()
}

function onNext(): void {
  // Explicit per-feature advance — replaces the auto-advance gate.
  // Button is disabled until `bothAnswered`, so callers can't reach
  // this with a partial draft, but we guard anyway for keyboard / a11y
  // tooling that might dispatch the click bypassing `:disabled`.
  if (!bothAnswered.value) return
  if (isLastFeature.value) {
    router.push({ name: 'poll-submit-confirm', params: { uuid: uuid.value } })
    return
  }
  router.push({
    name: 'poll-question',
    params: { uuid: uuid.value, index: indexNum.value + 1 },
  })
}

function goBack(): void {
  if (indexNum.value <= 0) {
    router.push({ name: 'poll-landing', params: { uuid: uuid.value } })
    return
  }
  router.push({
    name: 'poll-question',
    params: { uuid: uuid.value, index: indexNum.value - 1 },
  })
}

const EDITABLE_INPUT_TYPES = new Set([
  'text',
  'email',
  'number',
  'password',
  'search',
  'tel',
  'url',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
])

function isEditableTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  if (target instanceof HTMLInputElement) {
    return EDITABLE_INPUT_TYPES.has(target.type)
  }
  return false
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' && event.key !== 'Backspace') return
  if (isEditableTarget(event.target)) return
  event.preventDefault()
  goBack()
}

onMounted(async () => {
  if (store.fetchState === 'idle' || store.fetchState === 'loading') {
    await reload()
  } else if (store.isLoaded && store.poll) {
    draft.initForPoll(
      uuid.value,
      store.poll.features.map((f) => f.feature_key),
    )
  }
  redirectIfOutOfRange()
})

watch(indexNum, () => {
  redirectIfOutOfRange()
})

defineExpose({
  store,
  draft,
  reload,
  goBack,
  onNext,
  bothAnswered,
  isLastFeature,
  featureCount,
})
</script>

<style scoped>
.question-route {
  min-height: 70vh;
}

.question-screen {
  display: flex;
  flex-direction: column;
  gap: 16px;
  outline: none;
}

.progress-label {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface, 33 33 33), 0.7);
  margin: 0;
}

.feature-name {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
  margin: 8px 0 0 0;
  color: rgb(var(--v-theme-on-surface, 33 33 33));
}

.feature-description {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface, 33 33 33), 0.7);
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.likert-pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  align-items: start;
}

.feature-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.feature-next-cta {
  min-height: 48px;
  min-width: 160px;
}
</style>
