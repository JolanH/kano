<script setup lang="ts">
/**
 * Analysis page (`/app/projects/:id/polls/:pollId/analysis`) — Story 5.5.
 *
 * This page is a composition over Epic 5's earlier primitives:
 * - Analysis payload : Stories 5.1 / 5.2 (`/api/v1/polls/:id/analysis`).
 * - <CatBadge>       : Story 5.3.
 * - <KanoStackedBar> + <KanoStackedBarTable> : Story 5.4.
 * - <EpochSelector>  : Story 2.12.
 *
 * The page owns the orchestration (fetch + branching), the header, and
 * routing into the empty / error / table sub-surfaces — not the rendering
 * of any single primitive. See `AnalysisTable.vue` Dev Notes for the per-
 * row layout decisions.
 *
 * Project name resolution follows the Dev-Notes (b) path: read
 * `projectsStore.current` if it matches our `projectId`; otherwise fire a
 * parallel `loadProject` so direct URL entries still get a name in the
 * header. Failures on the project fetch fall back silently — the header
 * just renders without the name; the analysis itself is the load-bearing
 * surface.
 *
 * The <EpochSelector> mounted in the top-bar reuses Story 2.12's component
 * verbatim. Per its built-in behavior it pushes to `/app/projects/:id`
 * with `?epoch=N` — i.e. selecting a past epoch routes the user back to
 * project-detail at that version, where they can drill into the version's
 * polls. The AC #12 cross-poll navigation pattern is post-MVP; the
 * current behavior is the safe v1 path noted in the story's open question.
 */

import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import AnalysisEmptyState from '@/components/AnalysisEmptyState.vue'
import AnalysisErrorSurface from '@/components/AnalysisErrorSurface.vue'
import AnalysisTable from '@/components/AnalysisTable.vue'
import EpochSelector from '@/components/EpochSelector.vue'
import PerCategoryPanels from '@/components/PerCategoryPanels.vue'
import { type PollAnalysis } from '@/api/types'
import { useAnalysisPdf } from '@/composables/useAnalysisPdf'
import { useApi } from '@/composables/useApi'
import { useCopy } from '@/composables/useCopy'
import { useProjectsStore } from '@/stores/projects'

const route = useRoute()
const copy = useCopy()
const api = useApi()
const projectsStore = useProjectsStore()
const { exporting, exportToPdf } = useAnalysisPdf()

const projectId = computed(() => String(route.params.id ?? ''))
const pollId = computed(() => String(route.params.pollId ?? ''))

const analysis = ref<PollAnalysis | null>(null)
const loading = ref(true)
// `loadError` is widened from `KanoApiError | null` to `Error | null` so
// native `fetch` throws (offline / DNS / CORS) — which `useApi` does not
// wrap into a `KanoApiError` — surface the retryable error alert instead
// of leaving the page in a blank state. `AnalysisErrorSurface` branches on
// `instanceof NotFoundError` and falls through everything else to the
// retry alert, so widening here is sufficient.
const loadError = ref<Error | null>(null)

const isEmpty = computed(
  () => analysis.value !== null && analysis.value.total_submissions === 0,
)

const projectName = computed(() => {
  // Prefer the in-memory store (populated when the user navigated here
  // from PM home / project-detail). Fall back to whatever loadProject
  // resolved; if neither is available render the header without a name
  // rather than spinning forever.
  const cur = projectsStore.current
  if (cur && cur.id === projectId.value) return cur.name
  return ''
})

const projectVersion = computed(() => {
  // Release label (DB `version` string) — distinct from the Epoch counter.
  // Same store/id guard as projectName: render only when we actually hold
  // this project, otherwise '' so the "Version:" display stays hidden.
  const cur = projectsStore.current
  if (cur && cur.id === projectId.value) return cur.version
  return ''
})

const totalLabel = computed(() => {
  if (!analysis.value) return ''
  const n = analysis.value.total_submissions
  const key = n === 1 ? 'analysis.confidenceBeat.singular' : 'analysis.confidenceBeat.plural'
  return copy(key, { total: n })
})

const projectCurrentEpoch = computed(() => {
  const cur = projectsStore.current
  if (cur && cur.id === projectId.value) return cur.current_epoch
  // Fall back to the analysis's epoch — guarantees the selector mounts
  // with a defensible value even when projectsStore is empty.
  return analysis.value?.epoch ?? 1
})

// Captured surface for "Export PDF": the whole `.analysis-page` section, so
// the snapshot includes the header, the full feature table, the per-category
// panels, and the standing Kano reference panels — but not the PmLayout
// sidebar / app-bar, which live outside this element.
const pageEl = ref<HTMLElement | null>(null)
const exportError = ref(false)

const pdfFilename = computed(() => {
  const epoch = analysis.value?.epoch ?? projectCurrentEpoch.value
  // `normalize('NFKD')` + diacritic strip keeps accented names readable in the
  // slug ("Évaluation" → "evaluation") instead of dropping the letters; the
  // 80-char cap guards against filesystem name-length limits on very long
  // project names. CJK/Cyrillic still collapse to '' and fall back to epoch.
  const slug = projectName.value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return slug
    ? `kano-analysis-${slug}-epoch-${epoch}.pdf`
    : `kano-analysis-epoch-${epoch}.pdf`
})

async function handleExportPdf(): Promise<void> {
  if (!pageEl.value) return
  exportError.value = false
  try {
    await exportToPdf(pageEl.value, pdfFilename.value)
  } catch {
    // html2canvas/jsPDF throw or a failed dynamic import lands here; the
    // composable has already reset `exporting`, so we just flag the snackbar.
    exportError.value = true
  }
}

// In-flight guard, lifted out of the loading ref so a double-click on Retry
// (or a re-mount that fires onMounted while the initial load is still
// pending) doesn't race two parallel fetches into the same refs. Not
// reactive — only the function uses it.
let inFlight = false

async function loadAnalysis(): Promise<void> {
  if (inFlight) return
  inFlight = true
  loading.value = true
  loadError.value = null
  analysis.value = null
  try {
    const { data } = await api.get<PollAnalysis>(`/polls/${pollId.value}/analysis`)
    analysis.value = data
  } catch (err) {
    // Catch every throw — typed `KanoApiError`s AND native `fetch`
    // failures (offline / DNS / CORS land here as `TypeError`). The error
    // surface branches on `instanceof NotFoundError` and renders the
    // retryable alert for everything else, so an `Error` parent type is
    // sufficient.
    loadError.value = err instanceof Error ? err : new Error(String(err))
  } finally {
    loading.value = false
    inFlight = false
  }
}

function refreshProjectIfMissing(): void {
  // Direct-URL-entry path: the user landed on /analysis from a bookmark
  // or share link, so `projectsStore.current` is null. Fire a parallel
  // fetch (no `await`) so the project header populates while the
  // analysis payload is still in flight. A failure here is non-fatal —
  // the header just drops the name.
  const cur = projectsStore.current
  if (cur && cur.id === projectId.value) return
  void projectsStore.loadProject(projectId.value).catch(() => {})
}

onMounted(() => {
  refreshProjectIfMissing()
  void loadAnalysis()
})
</script>

<template>
  <section
    ref="pageEl"
    class="analysis-page"
    :aria-label="copy('analysis.page.aria')"
    data-testid="analysis-page"
  >
    <header class="analysis-header">
      <div class="analysis-header__primary">
        <h1
          v-if="projectName"
          class="text-h2 analysis-title"
          data-testid="analysis-project-name"
        >
          <RouterLink
            :to="{ name: 'project-detail', params: { id: projectId } }"
            class="analysis-title__link"
            data-testid="analysis-project-link"
          >{{ projectName }}<span
            v-if="projectVersion"
            class="analysis-title__version"
            :aria-label="`${copy('pm.projectDetail.version.label')} ${projectVersion}`"
            data-testid="analysis-project-version"
          >{{ projectVersion }}</span>
          </RouterLink>
        </h1>
        <v-chip
          v-if="analysis"
          color="secondary"
          size="small"
          data-testid="analysis-version-chip"
        >
          {{ copy('common.version') }} {{ analysis.epoch }}
        </v-chip>
      </div>
      <div class="analysis-header__meta">
        <span
          v-if="analysis && !isEmpty"
          class="confidence-beat"
          data-testid="analysis-confidence-beat"
        >
          <span>{{ totalLabel }}</span>
          <!--
            Story 5-7 AC #4 — the tie-meaning help (i) icon sits immediately
            to the right of the confidence-beat text. Hover / focus / click
            opens a `v-tooltip` that explains what a dominant-category tie
            means (FR35 + FR39). The icon carries its own aria-label so SRs
            announce the activator's role before the tooltip's described-by
            content reads; `max-width="300"` lets the longer explanation
            wrap without competing with the page's main reading column.
          -->
          <v-tooltip
            :text="copy('analysis.help.tieMeaning')"
            location="top"
            :open-delay="300"
            max-width="300"
          >
            <template #activator="{ props: tipProps }">
              <v-icon
                v-bind="tipProps"
                icon="mdi-information-outline"
                size="16"
                class="help-icon"
                tabindex="0"
                role="button"
                :aria-label="copy('analysis.help.tieIconAriaLabel')"
                data-testid="analysis-tie-help-icon"
              />
            </template>
          </v-tooltip>
        </span>
        <EpochSelector
          v-if="projectId"
          :current-epoch="projectCurrentEpoch"
          :selected-epoch="analysis?.epoch ?? projectCurrentEpoch"
          :project-id="projectId"
        />
        <!--
          Export PDF — only meaningful once there's loaded analysis data to
          capture, so it's gated to the same condition that renders the
          table/panels below. `data-html2canvas-ignore` keeps the button out
          of its own snapshot. `exporting` drives the in-flight loading state.
        -->
        <v-btn
          v-if="analysis && !isEmpty && !loading && !loadError"
          variant="tonal"
          color="primary"
          size="small"
          prepend-icon="mdi-file-pdf-box"
          :loading="exporting"
          :aria-label="copy('analysis.export.ariaLabel')"
          data-html2canvas-ignore="true"
          data-testid="analysis-export-pdf"
          @click="handleExportPdf"
        >
          {{ exporting ? copy('analysis.export.generating') : copy('analysis.export.button') }}
        </v-btn>
      </div>
    </header>

    <v-skeleton-loader
      v-if="loading"
      type="table"
      class="analysis-skeleton"
      data-testid="analysis-skeleton"
    />
    <AnalysisErrorSurface
      v-else-if="loadError"
      :error="loadError"
      :project-id="projectId || null"
      @retry="loadAnalysis"
    />
    <AnalysisEmptyState v-else-if="isEmpty" />
    <template v-else-if="analysis">
      <AnalysisTable :analysis="analysis" />
      <PerCategoryPanels :analysis="analysis" />
    </template>

    <v-snackbar
      v-model="exportError"
      color="error"
      data-html2canvas-ignore="true"
      data-testid="analysis-export-error"
    >
      {{ copy('analysis.export.error') }}
    </v-snackbar>
  </section>
</template>

<style scoped>
.analysis-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.analysis-header {
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.analysis-header__primary {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.analysis-header__meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.analysis-title {
  margin: 0;
}

.analysis-title__link {
  color: inherit;
  text-decoration: none;
}

.analysis-title__link:hover,
.analysis-title__link:focus-visible {
  text-decoration: underline;
}

.analysis-title__version {
  /* Reads as part of the title ("TMMS 18.2.0"): inherits text-h2 from the
   * h1; only adds the inter-word space the adjacent markup omits. */
  margin-inline-start: 0.4ch;
}

.confidence-beat {
  /*
   * Secondary-text weight per UX-DR21 — the confidence beat communicates
   * response volume without competing with the project title. NOT a
   * banner, never a `<v-alert>`.
   *
   * Story 5-7 turned the surface into an inline-flex container so the
   * tie-meaning (i) icon sits flush against the response-count text on the
   * same baseline; the icon itself colors to `on-surface-variant` to match
   * the secondary-text register established by the beat.
   */
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 400;
  color: rgb(var(--v-theme-on-surface-variant));
}

.help-icon {
  cursor: help;
  color: rgb(var(--v-theme-on-surface-variant));
}

.help-icon:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
  border-radius: 50%;
}

.analysis-skeleton {
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
}
</style>
