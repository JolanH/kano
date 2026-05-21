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
      <p
        v-if="isHalfway"
        role="status"
        aria-atomic="true"
        class="halfway"
        data-testid="halfway-microcopy"
      >
        {{ copy('respondent.flow.halfway') }}
      </p>
      <p class="progress-label" data-testid="progress-label">
        {{
          copy('respondent.flow.progressLabel', {
            current: indexNum + 1,
            total: totalQuestions,
          })
        }}
      </p>
      <v-progress-linear
        :model-value="progressFraction * 100"
        :aria-valuenow="indexNum + 1"
        :aria-valuemin="1"
        :aria-valuemax="totalQuestions"
        :aria-label="copy('respondent.flow.progressBarAriaLabel')"
        color="primary"
        height="6"
      />
      <p
        v-if="currentFeature.description"
        class="feature-description"
        data-testid="feature-description"
      >
        {{ currentFeature.description }}
      </p>
      <KanoLikert
        :question="question"
        :feature="currentFeature"
        :model-value="currentAnswer"
        :show-error="showError"
        @update:model-value="onSelect"
        @auto-advance="onAutoAdvance"
      />
    </section>
  </div>
</template>

<script lang="ts" setup>
/**
 * One-question-per-screen respondent flow with honest progress.
 *
 * Reads route params `:uuid` and `:index` (digit-restricted by the
 * router regex). `index` is 0-based across `2 * N` questions; even
 * indices are functional, odd are dysfunctional, and the feature at
 * each pair is `features[floor(index / 2)]`.
 *
 * State sources:
 * - `pollPublicStore` (Story 4.4) — the poll snapshot itself. Loaded
 *   once on first mount; subsequent navigations are no-ops.
 * - `useResponseDraftStore` (this story) — in-memory answer draft.
 *   Survives back-nav within the same poll; purged on tab close per
 *   FR25.
 *
 * Error surfaces (`ExpiredPoll`, `PollNotFound`, `PollLoadError`) are
 * reused verbatim from Stories 3.8 / 4.4 — do NOT re-author here.
 */
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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
const totalQuestions = computed(() => features.value.length * 2)
const currentFeature = computed(() => {
  if (!store.isLoaded) return null
  const pos = Math.floor(indexNum.value / 2)
  return features.value[pos] ?? null
})
const question = computed<LikertQuestion>(() =>
  indexNum.value % 2 === 0 ? 'functional' : 'dysfunctional',
)
const isHalfway = computed(() => indexNum.value === features.value.length)
const progressFraction = computed(() => {
  if (totalQuestions.value === 0) return 0
  return (indexNum.value + 1) / totalQuestions.value
})

const currentAnswer = computed(() => {
  if (!currentFeature.value) return null
  return draft.getAnswer(currentFeature.value.feature_key, question.value)
})

// Story 4.7's submit guard routes back here with `?showError=1` when a
// missing answer is detected (client- or server-side). KanoLikert
// renders its error variant; the first selection clears the query.
const showError = computed(() => route.query.showError === '1')

function clearShowErrorQuery(): void {
  if (route.query.showError === undefined) return
  const { showError: _drop, ...rest } = route.query
  void router.replace({
    name: route.name as string,
    params: route.params,
    query: rest,
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
  const total = totalQuestions.value
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

function onSelect(value: number): void {
  if (!currentFeature.value) return
  draft.setAnswer(currentFeature.value.feature_key, question.value, value)
  // Drop the ?showError=1 sentinel on first selection — KanoLikert
  // visibly clears as the reactive prop flips.
  clearShowErrorQuery()
}

function onAutoAdvance(_value: number): void {
  const nextIndex = indexNum.value + 1
  if (nextIndex >= totalQuestions.value) {
    router.push({ name: 'poll-submit-confirm', params: { uuid: uuid.value } })
    return
  }
  router.push({
    name: 'poll-question',
    params: { uuid: uuid.value, index: nextIndex },
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

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' && event.key !== 'Backspace') return
  // Don't hijack Backspace if the user is editing a text field somewhere.
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
  event.preventDefault()
  goBack()
}

onMounted(async () => {
  // On a hard refresh, Pinia state is purged → fetchState='idle' → we
  // refetch. Terminal states ('expired' / 'not-found' / 'error') are
  // sticky and reach this route only via in-app deep-link; don't
  // re-blow-the-state by re-firing the request.
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
  onAutoAdvance,
  isHalfway,
  totalQuestions,
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

.halfway {
  font-size: 1rem;
  font-weight: 500;
  color: rgb(var(--v-theme-primary, 25 118 210));
  margin: 0;
  transition: opacity 300ms ease;
}

.progress-label {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface, 33 33 33), 0.7);
  margin: 0;
}

.feature-description {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface, 33 33 33), 0.7);
  margin: 0;
}

@media (prefers-reduced-motion: reduce) {
  .halfway {
    transition: none;
  }
}
</style>
