<template>
  <v-card class="pa-6">
    <div class="text-h2 mb-2">{{ copy('placeholder.projects.title') }}</div>
    <p class="text-body-1">{{ copy('placeholder.projects.body') }}</p>
  </v-card>
</template>

<script lang="ts" setup>
import { useCopy } from '@/composables/useCopy'

const copy = useCopy()
</script>
