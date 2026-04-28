<template>
  <v-card class="pa-6 text-center">
    <div class="text-h3 mb-3">{{ copy('placeholder.respondent.title') }}</div>
    <p class="text-body-1">{{ copy('placeholder.respondent.body') }}</p>
  </v-card>
</template>

<script lang="ts" setup>
import { useCopy } from '@/composables/useCopy'

const copy = useCopy()
</script>
