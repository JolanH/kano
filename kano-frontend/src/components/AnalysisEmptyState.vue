<script setup lang="ts">
/**
 * <AnalysisEmptyState> — the FR37 "0 responses" full-table replacement.
 *
 * Per Story 5.5 Dev Notes Recommendation (A): the data model does not
 * carry an `expected_respondents` count on polls, so the empty-state copy
 * drops the `{expected}` interpolation entirely. If a future story adds
 * the field, swap in the parameterized copy key. The single-string
 * `analysis.emptyState` key reflects that decision today.
 */

import { useCopy } from '@/composables/useCopy'

const copy = useCopy()
</script>

<template>
  <div class="analysis-empty" data-testid="analysis-empty-state">
    <v-card class="empty-card" variant="outlined">
      <div class="empty-text">{{ copy('analysis.emptyState') }}</div>
    </v-card>
  </div>
</template>

<style scoped>
.analysis-empty {
  max-width: 1440px;
  margin: 48px auto;
}

.empty-card {
  padding: 48px 32px;
  text-align: center;
}

.empty-text {
  font-size: 16px;
  color: rgb(var(--v-theme-on-surface-variant));
  font-weight: 400;
  line-height: 1.5;
}
</style>
