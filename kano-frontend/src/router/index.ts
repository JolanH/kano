/**
 * router/index.ts
 *
 * Routes are split between two layout registers:
 *
 * - `/app/*` — PM workspace; rendered inside `PmLayout` (dark sidebar +
 *   1440px-centered content). Mounts the placeholder pages today; Epic 2+
 *   replaces them.
 * - `/poll/*` — Respondent surface; rendered inside `RespondentLayout`
 *   (chromeless, 480px container, 16px gutter). Stub for now; Epic 3 / 4
 *   ship the real flow.
 *
 * The `meta.layout` discriminator drives `App.vue`'s layout switch, so adding
 * a new route just requires picking `'pm'` or `'respondent'` here.
 *
 * Story 1.8 adds a dev-only `/dev/theme-audit` route gated on
 * `import.meta.env.DEV` so the screen is statically tree-shaken out of
 * production builds (verified by inspecting the build output).
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/app/polls',
  },
  {
    path: '/app',
    redirect: '/app/polls',
  },
  {
    path: '/app/projects',
    name: 'projects',
    component: () => import('@/pages/app/Projects.vue'),
    meta: { layout: 'pm' },
  },
  {
    path: '/app/projects/:id',
    name: 'project-detail',
    component: () => import('@/pages/app/ProjectDetail.vue'),
    meta: { layout: 'pm' },
  },
  {
    path: '/app/projects/:id/polls/:pollId/share',
    name: 'poll-share',
    component: () => import('@/pages/app/PollShare.vue'),
    meta: { layout: 'pm' },
  },
  {
    path: '/app/projects/:id/polls/:pollId/analysis',
    name: 'poll-analysis',
    component: () => import('@/pages/app/AnalysisPlaceholder.vue'),
    meta: { layout: 'pm' },
  },
  {
    path: '/app/polls',
    name: 'polls',
    component: () => import('@/pages/app/Polls.vue'),
    meta: { layout: 'pm' },
  },
  {
    path: '/poll/:uuid',
    name: 'poll-landing',
    component: () => import('@/pages/poll/Landing.vue'),
    meta: { layout: 'respondent' },
  },
  {
    // The `:index(\\d+)` regex restricts the param to digits so malformed
    // URLs 404 at the router instead of reaching the component.
    path: '/poll/:uuid/q/:index(\\d+)',
    name: 'poll-question',
    component: () => import('@/pages/poll/Question.vue'),
    meta: { layout: 'respondent' },
  },
  {
    path: '/poll/:uuid/submit-confirm',
    name: 'poll-submit-confirm',
    component: () => import('@/pages/poll/SubmitConfirm.vue'),
    meta: { layout: 'respondent' },
  },
  {
    path: '/poll/:uuid/thanks',
    name: 'poll-thanks',
    component: () => import('@/pages/poll/Thanks.vue'),
    meta: { layout: 'respondent' },
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/pages/common/NotFound.vue'),
    meta: { layout: 'pm' },
  },
]

if (import.meta.env.DEV) {
  routes.push({
    path: '/dev/theme-audit',
    component: () => import('@/pages/dev/ThemeAudit.vue'),
    meta: { layout: 'pm' },
  })
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
