/**
 * plugins/vuetify.ts
 *
 * Builds the single `createVuetify()` instance for the SPA. The Tixeo theme
 * tokens (Story 1.6) plus the per-component defaults (flat buttons, outlined
 * cards/inputs) are applied here so every page inherits the same register
 * without per-component prop noise.
 */

import { createVuetify } from 'vuetify'
import { tixeoTheme } from '@/theme/tixeo'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import '@/theme/overrides.scss'

export default createVuetify({
  theme: {
    defaultTheme: 'tixeo',
    themes: {
      tixeo: tixeoTheme,
    },
  },
  defaults: {
    VBtn: { variant: 'flat' },
    VCard: { elevation: 0, variant: 'outlined' },
    VTextField: { variant: 'outlined', density: 'comfortable' },
    VTextarea: { variant: 'outlined', density: 'comfortable' },
    VSelect: { variant: 'outlined', density: 'comfortable' },
  },
})
