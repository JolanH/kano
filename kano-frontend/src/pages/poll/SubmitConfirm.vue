<template>
  <section class="submit-confirm" data-testid="submit-confirm">
    <v-card>
      <v-card-title>{{ copy('respondent.submitConfirm.title') }}</v-card-title>
      <v-card-text>{{ copy('respondent.submitConfirm.body') }}</v-card-text>
      <v-alert
        v-if="missingRedirectNotice"
        type="info"
        :text="copy('respondent.submitConfirm.missingRedirect')"
        class="mb-4"
        data-testid="submit-confirm-missing-redirect"
      />
      <v-alert
        v-if="error"
        type="error"
        :text="error"
        class="mb-4"
        data-testid="submit-confirm-error"
      />
      <v-card-actions>
        <v-btn
          variant="text"
          data-testid="submit-confirm-back"
          :disabled="submitting"
          :text="copy('respondent.submitConfirm.backCta')"
          @click="goBack"
        />
        <v-spacer />
        <v-btn
          ref="submitBtn"
          size="large"
          color="primary"
          data-testid="submit-confirm-submit"
          :loading="submitting"
          :disabled="submitting"
          :text="copy('respondent.submitConfirm.submitCta')"
          @click="onSubmit"
        />
      </v-card-actions>
    </v-card>
  </section>
</template>

<script lang="ts" setup>
/**
 * Submit-confirm page — Story 4.7 replacement for the Story 4.6
 * placeholder.
 *
 * Owns the final mile of the respondent flow:
 *
 *   draft → POST /polls/:uuid/submit → router.replace('poll-thanks')
 *
 * Error envelope handling mirrors Story 4.2's contract:
 *   - 410 → mark pollPublicStore.fetchState='expired', clear draft,
 *           bounce to landing (which re-renders in expired mode)
 *   - 422 (partial-submission) → priority missing → unexpected →
 *           duplicates; route back to the offending question with
 *           ?showError=1 so KanoLikert renders its error variant in-place
 *   - 400/404/500/network → inline alert + retry; preserve draft and
 *           user agency
 *
 * The page also defends against an incomplete draft on mount and on
 * Submit click: if the user navigated here via a typed URL while the
 * draft is partial, they bounce straight to the missing question.
 */
import { nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  isProblemType,
  KanoApiError,
  PROBLEM_TYPE,
  type PollPublic,
} from '@/api/types'
import { useApi } from '@/composables/useApi'
import { useCopy } from '@/composables/useCopy'
import { usePollPublicStore } from '@/stores/pollPublic'
import {
  useResponseDraftStore,
  type DraftAnswerPair,
  type LikertQuestion,
} from '@/stores/responseDraft'

interface SubmissionAnswer {
  feature_key: string
  fq_answer: number
  dq_answer: number
}

const copy = useCopy()
const route = useRoute()
const router = useRouter()
const api = useApi()
const pollStore = usePollPublicStore()
const draftStore = useResponseDraftStore()

const submitting = ref(false)
const error = ref<string | null>(null)
const missingRedirectNotice = ref(false)

// Story 4-8 AC #7: initial focus on Submit so the keyboard user lands
// on the primary action without an extra Tab.
const submitBtn = ref<{ $el?: HTMLElement; focus?: () => void } | null>(null)

function uuidParam(): string {
  const raw = route.params.uuid
  return Array.isArray(raw) ? raw[0] : raw
}

function buildBody(poll: PollPublic): { answers: SubmissionAnswer[] } {
  const answers: SubmissionAnswer[] = []
  for (const feature of poll.features) {
    const pair: DraftAnswerPair = draftStore.answers[feature.feature_key] ?? {
      fq_answer: null,
      dq_answer: null,
    }
    // The completeness guard runs first; nulls here would be a programming
    // error, not a user mistake.
    if (pair.fq_answer === null || pair.dq_answer === null) {
      throw new Error(
        `buildBody: missing answer for feature_key=${feature.feature_key} (guard should have caught this)`,
      )
    }
    answers.push({
      feature_key: feature.feature_key,
      fq_answer: pair.fq_answer,
      dq_answer: pair.dq_answer,
    })
  }
  return { answers }
}

function indexOf(featureKey: string, _question: LikertQuestion): number | null {
  // Per-feature progression: each route screen shows BOTH Likerts for
  // one feature, so the missing-answer redirect targets the feature
  // index directly. The `question` parameter is preserved for API
  // compatibility with `firstMissing()`'s return shape, but no longer
  // affects the route index — Question.vue's per-Likert null-detection
  // surfaces the correct error border once the page renders.
  const poll = pollStore.poll
  if (!poll) return null
  const featureIndex = poll.features.findIndex(
    (f) => f.feature_key === featureKey,
  )
  if (featureIndex < 0) return null
  return featureIndex
}

function redirectToFirstMissingFromDraft(): void {
  const poll = pollStore.poll
  if (!poll) {
    router.replace({ name: 'poll-landing', params: { uuid: uuidParam() } })
    return
  }
  const missing = draftStore.firstMissing(
    poll.features.map((f) => f.feature_key),
  )
  if (!missing) return
  const routeIndex = indexOf(missing.featureKey, missing.question)
  if (routeIndex === null) {
    router.replace({ name: 'poll-landing', params: { uuid: uuidParam() } })
    return
  }
  router.replace({
    name: 'poll-question',
    params: { uuid: uuidParam(), index: routeIndex },
    query: { showError: '1' },
  })
}

function redirectFromServerProblem(
  problem: { missing?: string[]; unexpected?: string[]; duplicates?: string[] },
): void {
  // Priority: missing → unexpected → duplicates per Story 4.7 Dev Notes.
  const target =
    (problem.missing && problem.missing[0]) ??
    (problem.unexpected && problem.unexpected[0]) ??
    (problem.duplicates && problem.duplicates[0]) ??
    null
  if (target === null) {
    // No structured info; treat as a generic completeness re-check.
    redirectToFirstMissingFromDraft()
    return
  }
  const routeIndex = indexOf(target, 'functional')
  if (routeIndex === null) {
    // Server flagged a feature_key we don't know about (snapshot drift
    // — extremely rare). Reset draft and bounce to landing.
    draftStore.reset()
    router.replace({ name: 'poll-landing', params: { uuid: uuidParam() } })
    return
  }
  router.replace({
    name: 'poll-question',
    params: { uuid: uuidParam(), index: routeIndex },
    query: { showError: '1' },
  })
}

function handleSubmitError(err: unknown): void {
  if (err instanceof KanoApiError) {
    if (err.status === 410) {
      pollStore.markExpired(err)
      draftStore.reset()
      router.replace({ name: 'poll-landing', params: { uuid: uuidParam() } })
      return
    }
    if (err.status === 422 && isProblemType(err.problem, PROBLEM_TYPE.PARTIAL_SUBMISSION)) {
      missingRedirectNotice.value = true
      const problem = err.problem as unknown as {
        missing?: string[]
        unexpected?: string[]
        duplicates?: string[]
      }
      // Brief inline acknowledgement before the route changes, so the
      // user understands the bounce wasn't random.
      setTimeout(() => {
        missingRedirectNotice.value = false
        redirectFromServerProblem(problem)
      }, 800)
      return
    }
  }
  // 400 / 404 / 500 / network → stay on page, surface the error.
  error.value = copy('respondent.submitConfirm.error.generic')
}

async function onSubmit(): Promise<void> {
  error.value = null
  if (!draftStore.isComplete) {
    redirectToFirstMissingFromDraft()
    return
  }
  const poll = pollStore.poll
  if (!poll) {
    router.replace({ name: 'poll-landing', params: { uuid: uuidParam() } })
    return
  }
  submitting.value = true
  try {
    await api.post(`/polls/${uuidParam()}/submit`, buildBody(poll))
    draftStore.reset()
    router.replace({ name: 'poll-thanks', params: { uuid: uuidParam() } })
  } catch (err) {
    handleSubmitError(err)
  } finally {
    submitting.value = false
  }
}

function goBack(): void {
  const poll = pollStore.poll
  if (!poll || poll.features.length === 0) {
    router.push({ name: 'poll-landing', params: { uuid: uuidParam() } })
    return
  }
  const lastIndex = poll.features.length - 1
  router.push({
    name: 'poll-question',
    params: { uuid: uuidParam(), index: lastIndex },
  })
}

onMounted(async () => {
  // Defensive: if a user types /submit-confirm directly without
  // answering everything, bounce to the first missing question.
  if (!draftStore.isComplete) {
    redirectToFirstMissingFromDraft()
    return
  }
  await nextTick()
  const target =
    typeof submitBtn.value?.focus === 'function'
      ? submitBtn.value
      : (submitBtn.value?.$el as HTMLElement | undefined)
  target?.focus?.()
})

defineExpose({ onSubmit, goBack, error, submitting })
</script>

<style scoped>
.submit-confirm {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 24px;
}
</style>
