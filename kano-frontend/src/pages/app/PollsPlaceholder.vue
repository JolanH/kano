<template>
  <v-card class="pa-6">
    <div class="text-h2 mb-2">{{ copy('placeholder.polls.title') }}</div>
    <p class="text-body-1">{{ copy('placeholder.polls.body') }}</p>
  </v-card>
</template>

<script lang="ts" setup>
import { useCopy } from '@/composables/useCopy'

const copy = useCopy()
</script>
