<template>
  <v-card class="pa-6" data-testid="analysis-placeholder">
    <v-card-text class="text-body-1">
      {{ copy('pm.polls.analysisPlaceholder') }}
    </v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
import { useCopy } from '@/composables/useCopy'

const copy = useCopy()
</script>
