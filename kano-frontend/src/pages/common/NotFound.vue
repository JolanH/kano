<template>
  <v-card class="pa-6 text-center">
    <v-icon icon="mdi-compass-off" size="48" color="primary" class="mb-4" aria-hidden="true" />
    <div class="text-h2 mb-2">{{ copy('common.notFound.title') }}</div>
    <p class="text-body-1 mb-4">{{ copy('common.notFound.body') }}</p>
    <v-btn color="primary" to="/app/projects">{{ copy('common.notFound.cta') }}</v-btn>
  </v-card>
</template>

<script lang="ts" setup>
import { useCopy } from '@/composables/useCopy'

const copy = useCopy()
</script>
