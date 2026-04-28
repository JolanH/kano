/**
 * main.ts
 *
 * Bootstraps Vuetify (with the Tixeo theme), Pinia, and the router; loads
 * Inter at four weights (400 body, 500 label, 600 heading, 700 display) so
 * the typography scale defined in `_bmad-output/planning-artifacts/ux-design-specification.md
 * §Typography System` resolves without a network round-trip in production.
 */

import { createApp } from 'vue'

import App from './App.vue'
import { registerPlugins } from '@/plugins'

import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'

const app = createApp(App)

registerPlugins(app)

app.mount('#app')
