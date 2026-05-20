<template>
  <section :aria-label="copy('pm.projects.title')">
    <header class="d-flex align-center justify-space-between mb-4">
      <h1 class="text-h2">{{ copy('pm.projects.title') }}</h1>
      <v-btn
        v-if="!showNewForm"
        color="primary"
        :prepend-icon="'mdi-plus'"
        :text="copy('pm.projects.newProject.cta')"
        data-testid="new-project-button"
        @click="openNewForm"
      />
    </header>

    <v-card v-if="showNewForm" class="pa-4 mb-4" data-testid="new-project-form">
      <v-row dense>
        <v-col cols="12" md="6">
          <v-text-field
            ref="newNameInput"
            v-model="newProject.name"
            density="compact"
            variant="outlined"
            :label="copy('pm.projects.newProject.placeholder.name')"
            :error-messages="newProjectErrors.name"
            data-testid="new-project-name"
            @keydown.esc="cancelNewForm"
            @keydown.enter="commitNewForm"
          />
        </v-col>
        <v-col cols="12" md="4">
          <v-text-field
            v-model="newProject.version"
            density="compact"
            variant="outlined"
            :label="copy('pm.projects.newProject.placeholder.version')"
            :error-messages="newProjectErrors.version"
            data-testid="new-project-version"
            @keydown.esc="cancelNewForm"
            @keydown.enter="commitNewForm"
          />
        </v-col>
        <v-col cols="12" md="2" class="d-flex align-center ga-2">
          <v-btn
            color="primary"
            :text="copy('pm.projects.newProject.commit')"
            :loading="isCreating"
            data-testid="new-project-commit"
            @click="commitNewForm"
          />
          <v-btn
            variant="text"
            :text="copy('pm.projects.newProject.cancel')"
            data-testid="new-project-cancel"
            @click="cancelNewForm"
          />
        </v-col>
      </v-row>
    </v-card>

    <v-card
      v-if="store.items.length === 0 && !store.isLoading"
      class="pa-6 text-center"
      data-testid="projects-empty-state"
    >
      <v-icon icon="mdi-folder-plus" size="48" color="primary" class="mb-4" aria-hidden="true" />
      <div class="text-h6 mb-2">{{ copy('pm.projects.empty.title') }}</div>
      <p class="text-body-1 mb-4">{{ copy('pm.projects.empty.body') }}</p>
      <v-btn
        color="primary"
        :text="copy('pm.projects.empty.cta')"
        data-testid="projects-empty-cta"
        @click="openNewForm"
      />
    </v-card>

    <v-data-table
      v-else
      :headers="headers"
      :items="rows"
      :loading="store.isLoading"
      :items-per-page="-1"
      density="compact"
      hover
      class="pm-projects-table"
      data-testid="projects-table"
      :loading-text="copy('pm.projects.loading')"
      :no-data-text="copy('pm.projects.empty.title')"
      @click:row="onRowClick"
    >
      <template #item.created_at="{ value }">
        {{ formatDate(value as string) }}
      </template>
    </v-data-table>
  </section>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { KanoApiError } from '@/api/types'
import { useCopy } from '@/composables/useCopy'
import { useProjectsStore } from '@/stores/projects'

const copy = useCopy()
const store = useProjectsStore()
const router = useRouter()

const showNewForm = ref(false)
const isCreating = ref(false)
const newNameInput = ref<HTMLElement | null>(null)
const newProject = reactive({ name: '', version: '' })
const newProjectErrors = reactive<{ name?: string; version?: string }>({})

const headers = computed(() => [
  { title: copy('pm.projects.col.name'), key: 'name' },
  { title: copy('pm.projects.col.version'), key: 'version' },
  { title: copy('pm.projects.col.epoch'), key: 'current_epoch' },
  { title: copy('pm.projects.col.createdAt'), key: 'created_at' },
])

const rows = computed(() => store.items)

onMounted(() => {
  void store.loadProjects()
})

function openNewForm() {
  showNewForm.value = true
  newProject.name = ''
  newProject.version = ''
  newProjectErrors.name = undefined
  newProjectErrors.version = undefined
  void nextTick(() => {
    // Autofocus the first input so Paola starts typing immediately.
    const el = newNameInput.value as unknown as { focus?: () => void } | null
    el?.focus?.()
  })
}

function cancelNewForm() {
  showNewForm.value = false
  newProject.name = ''
  newProject.version = ''
}

async function commitNewForm() {
  newProjectErrors.name = undefined
  newProjectErrors.version = undefined
  if (!newProject.name.trim()) {
    newProjectErrors.name = copy('pm.projects.newProject.placeholder.name')
    return
  }
  if (!newProject.version.trim()) {
    newProjectErrors.version = copy('pm.projects.newProject.placeholder.version')
    return
  }
  isCreating.value = true
  try {
    const project = await store.createProject({
      name: newProject.name.trim(),
      version: newProject.version.trim(),
    })
    cancelNewForm()
    await router.push({ name: 'project-detail', params: { id: project.id } })
  } catch (err) {
    if (err instanceof KanoApiError) {
      newProjectErrors.name = err.problem.detail ?? err.problem.title
    } else {
      throw err
    }
  } finally {
    isCreating.value = false
  }
}

function onRowClick(_event: unknown, payload: { item: { id: string } }) {
  void router.push({ name: 'project-detail', params: { id: payload.item.id } })
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}
</script>

<style scoped>
.pm-projects-table :deep(tbody tr) {
  cursor: pointer;
}
</style>
