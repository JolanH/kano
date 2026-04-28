<template>
  <div class="theme-audit">
    <h1 class="text-h2 mb-6">{{ copy('dev.themeAudit.title') }}</h1>

    <!-- ============================== Colors ============================== -->
    <section class="mb-10">
      <h2 class="text-h3 mb-4">{{ copy('dev.themeAudit.colors') }}</h2>
      <div class="d-flex flex-wrap" style="gap: 16px;">
        <div
          v-for="swatch in colorSwatches"
          :key="swatch.token"
          class="swatch-card"
        >
          <div
            class="swatch-tile"
            role="img"
            :style="{ backgroundColor: swatch.hex }"
            :aria-label="`Color sample for ${swatch.label}`"
          />
          <div class="text-body-2 mt-2 font-weight-medium">{{ swatch.label }}</div>
          <div class="text-caption text-on-surface-variant tabular-nums">{{ swatch.hex }}</div>
          <div class="text-caption text-on-surface-variant">{{ swatch.token }}</div>
        </div>
      </div>
    </section>

    <!-- ============================ Typography ============================ -->
    <section class="mb-10">
      <h2 class="text-h3 mb-4">{{ copy('dev.themeAudit.typography') }}</h2>
      <div class="text-display mb-2">Display 32 — Must-have 71%</div>
      <div class="text-h1 mb-2">H1 24 — Page title</div>
      <div class="text-h2 mb-2">H2 20 — Section heading</div>
      <div class="text-h3 mb-2">H3 16 — Card title</div>
      <div class="text-body-pm mb-2">Body PM 14 — dense table body text.</div>
      <div class="text-body-respondent mb-2">Body respondent 16 — readable on mobile.</div>
      <div class="text-body-large-respondent mb-2">Body-large 18 — the question being answered.</div>
      <div class="text-label mb-2">Label 14 — form labels.</div>
      <div class="text-caption">Caption 12 — metadata · 5 of 12 · 12:34 UTC</div>
    </section>

    <!-- ============================== Spacing ============================== -->
    <section class="mb-10">
      <h2 class="text-h3 mb-4">{{ copy('dev.themeAudit.spacing') }}</h2>
      <div
        v-for="spacing in spacingScale"
        :key="spacing.token"
        class="d-flex align-center mb-2"
      >
        <div class="text-caption me-3 tabular-nums" style="min-width: 80px;">
          {{ spacing.token }}
        </div>
        <div class="text-caption me-3 tabular-nums" style="min-width: 60px;">
          {{ spacing.px }} px
        </div>
        <div
          class="spacing-bar"
          role="img"
          :style="{ width: spacing.px + 'px' }"
          :aria-label="`Spacing token ${spacing.token} (${spacing.px} pixels)`"
        />
      </div>
    </section>

    <!-- ============================== Buttons ============================== -->
    <section class="mb-10">
      <h2 class="text-h3 mb-4">{{ copy('dev.themeAudit.buttons') }}</h2>
      <div class="d-flex flex-wrap mb-3" style="gap: 12px;">
        <v-btn color="primary" size="small">Primary 32</v-btn>
        <v-btn color="primary">Primary 40</v-btn>
        <v-btn color="primary" size="large">Primary 48</v-btn>
      </div>
      <div class="d-flex flex-wrap mb-3" style="gap: 12px;">
        <v-btn variant="outlined" size="small">Secondary 32</v-btn>
        <v-btn variant="outlined">Secondary 40</v-btn>
        <v-btn variant="outlined" size="large">Secondary 48</v-btn>
      </div>
      <div class="d-flex flex-wrap mb-3" style="gap: 12px;">
        <v-btn variant="text" size="small">Tertiary 32</v-btn>
        <v-btn variant="text">Tertiary 40</v-btn>
        <v-btn variant="text" size="large">Tertiary 48</v-btn>
      </div>
      <div class="d-flex flex-wrap" style="gap: 12px;">
        <v-btn color="primary" disabled>Disabled primary</v-btn>
        <v-btn variant="outlined" disabled>Disabled secondary</v-btn>
      </div>
    </section>

    <!-- ============================== Inputs ============================== -->
    <section class="mb-10">
      <h2 class="text-h3 mb-4">{{ copy('dev.themeAudit.inputs') }}</h2>
      <v-text-field label="Project name" placeholder="e.g. Onboarding" />
      <v-textarea label="Feature description" rows="3" />
      <v-select
        label="Category"
        :items="['Must-have', 'Performance', 'Delighter']"
      />
      <v-radio-group label="Likert demo" :model-value="3">
        <v-radio v-for="i in 5" :key="i" :label="`Option ${i}`" :value="i" />
      </v-radio-group>
      <v-checkbox label="Enable auto-advance" />
      <v-switch label="Show advanced settings" color="primary" />
    </section>

    <!-- ============================ Data table ============================ -->
    <section class="mb-10">
      <h2 class="text-h3 mb-4">{{ copy('dev.themeAudit.dataTable') }}</h2>
      <v-data-table
        :headers="tableHeaders"
        :items="tableItems"
        density="comfortable"
      />
    </section>

    <!-- ====================== Feedback / overlay primitives ====================== -->
    <section class="mb-10">
      <h2 class="text-h3 mb-4">{{ copy('dev.themeAudit.feedback') }}</h2>
      <div class="d-flex flex-wrap mb-3" style="gap: 12px;">
        <v-btn @click="dialog = true">Open dialog</v-btn>
        <v-menu>
          <template #activator="{ props }">
            <v-btn v-bind="props">Open menu</v-btn>
          </template>
          <v-list>
            <v-list-item title="First item" />
            <v-list-item title="Second item" />
            <v-list-item title="Third item" />
          </v-list>
        </v-menu>
        <v-tooltip
          location="top"
          aria-label="Sample tooltip body"
        >
          <template #activator="{ props }">
            <v-btn v-bind="props">Hover for tooltip</v-btn>
          </template>
          <span>Tooltip body</span>
        </v-tooltip>
      </div>
      <div class="d-flex flex-wrap" style="gap: 12px;">
        <v-btn color="success" @click="snackbar = { show: true, color: 'success', text: 'Saved.' }">
          Success snackbar
        </v-btn>
        <v-btn color="error" @click="snackbar = { show: true, color: 'error', text: 'Failed.' }">
          Error snackbar
        </v-btn>
        <v-btn color="info" @click="snackbar = { show: true, color: 'info', text: 'FYI.' }">
          Info snackbar
        </v-btn>
      </div>

      <v-dialog v-model="dialog" max-width="480">
        <v-card>
          <v-card-title>Sample dialog</v-card-title>
          <v-card-text>Two-button confirmation pattern. See Story 2-11.</v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="dialog = false">Cancel</v-btn>
            <v-btn color="primary" @click="dialog = false">Confirm</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="2500">
        {{ snackbar.text }}
      </v-snackbar>
    </section>

    <!-- ====================== Progress / skeleton / alerts ====================== -->
    <section class="mb-10">
      <h2 class="text-h3 mb-4">{{ copy('dev.themeAudit.progress') }}</h2>
      <v-progress-linear
        color="primary"
        model-value="50"
        class="mb-4"
        aria-label="Sample progress bar at 50 percent"
      />
      <v-skeleton-loader type="card" class="mb-4" />
      <v-skeleton-loader type="list-item-avatar-two-line@3" class="mb-4" />
      <v-alert type="info" class="mb-2">Info alert</v-alert>
      <v-alert type="success" class="mb-2">Success alert</v-alert>
      <v-alert type="warning" class="mb-2">Warning alert</v-alert>
      <v-alert type="error">Error alert</v-alert>
    </section>

    <!-- ============================ Lists & tabs ============================ -->
    <section class="mb-10">
      <h2 class="text-h3 mb-4">{{ copy('dev.themeAudit.listsAndTabs') }}</h2>
      <v-tabs :model-value="0" class="mb-4">
        <v-tab>Tab one</v-tab>
        <v-tab>Tab two</v-tab>
        <v-tab>Tab three</v-tab>
      </v-tabs>
      <v-list lines="two">
        <v-list-item
          title="First feature"
          subtitle="Must-have · 8 of 12 responses"
        />
        <v-list-item
          title="Second feature"
          subtitle="Performance · 5 of 12 responses"
        />
        <v-list-item
          title="Third feature"
          subtitle="Delighter · 3 of 12 responses"
        />
      </v-list>
    </section>

    <!-- ============================ Overrides ============================ -->
    <section>
      <h2 class="text-h3 mb-4">{{ copy('dev.themeAudit.overrides') }}</h2>
      <v-card class="pa-4">
        <ul class="text-body-2">
          <li>Card elevation 0 (Material default: 1dp shadow)</li>
          <li>Primary button variant flat (default: elevated)</li>
          <li>Input default variant outlined (default: filled with floating label)</li>
          <li>No floating label on TextField (default: animated label)</li>
          <li>App bar uses surface color, not primary (default: primary background)</li>
          <li>Theme is single light theme (default: system / dark / light pair)</li>
        </ul>
      </v-card>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue'

import { useCopy } from '@/composables/useCopy'
import { tixeoColors } from '@/theme/tixeo'

const copy = useCopy()

const colorSwatches = [
  { token: 'primary', label: 'Primary (Tixeo orange)', hex: tixeoColors.primary },
  { token: 'surface-variant', label: 'Sidebar dark', hex: tixeoColors['surface-variant'] },
  { token: 'success', label: 'Success', hex: tixeoColors.success },
  { token: 'warning', label: 'Warning', hex: tixeoColors.warning },
  { token: 'error', label: 'Error', hex: tixeoColors.error },
  { token: 'info', label: 'Info', hex: tixeoColors.info },
  { token: 'category-must', label: 'Must-have', hex: tixeoColors['category-must'] },
  { token: 'category-perf', label: 'Performance', hex: tixeoColors['category-perf'] },
  { token: 'category-del', label: 'Delighter', hex: tixeoColors['category-del'] },
  { token: 'category-ind', label: 'Indifferent', hex: tixeoColors['category-ind'] },
  { token: 'category-rev', label: 'Reverse', hex: tixeoColors['category-rev'] },
  { token: 'category-que', label: 'Questionable', hex: tixeoColors['category-que'] },
]

const spacingScale = [
  { token: 'space-1', px: 4 },
  { token: 'space-2', px: 8 },
  { token: 'space-3', px: 12 },
  { token: 'space-4', px: 16 },
  { token: 'space-6', px: 24 },
  { token: 'space-8', px: 32 },
  { token: 'space-12', px: 48 },
  { token: 'space-16', px: 64 },
]

const tableHeaders = [
  { title: 'Feature', key: 'name' },
  { title: 'Category', key: 'category' },
  { title: 'Responses', key: 'responses' },
]

const tableItems = [
  { name: 'Auto-save', category: 'Must-have', responses: 12 },
  { name: 'Custom themes', category: 'Performance', responses: 8 },
  { name: 'AI suggestions', category: 'Delighter', responses: 4 },
  { name: 'CSV export', category: 'Indifferent', responses: 2 },
]

const dialog = ref(false)
const snackbar = reactive({ show: false, color: 'success', text: '' })
</script>

<style scoped>
.theme-audit {
  padding: 24px;
}

.swatch-card {
  width: 120px;
}

.swatch-tile {
  width: 48px;
  height: 48px;
  border: 1px solid rgba(0, 0, 0, 0.12);
}

.spacing-bar {
  height: 16px;
  background-color: rgb(var(--v-theme-primary));
}

.text-display { font-size: 2rem; font-weight: 700; line-height: 1.2; }
.text-h1 { font-size: 1.5rem; font-weight: 600; line-height: 1.25; }
.text-h2 { font-size: 1.25rem; font-weight: 600; line-height: 1.3; }
.text-h3 { font-size: 1rem; font-weight: 600; line-height: 1.4; }
.text-body-pm { font-size: 0.875rem; line-height: 1.5; }
.text-body-respondent { font-size: 1rem; line-height: 1.55; }
.text-body-large-respondent { font-size: 1.125rem; font-weight: 500; line-height: 1.45; }
.text-label { font-size: 0.875rem; font-weight: 500; line-height: 1.4; }
.text-caption { font-size: 0.75rem; line-height: 1.4; }
</style>
