/**
 * Holds the theme-audit page honest as the project grows.
 *
 * 1. Primitive-coverage: every Vuetify primitive (`<v-…>`) used anywhere in
 *    product code MUST also appear on `src/pages/dev/ThemeAudit.vue`. The
 *    audit page is the canary against framework regressions — a primitive
 *    that exists in the product but not on the audit page is silently
 *    excluded from the canary. An explicit allowlist below carries the
 *    layout-only primitives (`v-app`, `v-app-bar`, `v-main`,
 *    `v-navigation-drawer`) that compose the page chrome and are exercised
 *    by `PmLayout` itself, not by the audit page's body.
 *
 * 2. Decorative-token coverage: the audit page renders every Kano-theme
 *    color token, including the four decorative tokens (`outline`,
 *    `outline-variant`, `surface-bright`, `background`) that earlier
 *    drafts omitted. Visual-regression now catches drift on those too.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { tixeoColors } from '@/theme/tixeo'

const SRC_ROOT = resolve(__dirname, '../../src')
const AUDIT_PAGE = resolve(SRC_ROOT, 'pages/dev/ThemeAudit.vue')

// Layout-level primitives composed in `PmLayout` / `RespondentLayout`;
// rendering the audit page inside the PM layout means the layout chrome
// already exercises them on every visit. The audit page body doesn't need
// to also render them.
const LAYOUT_PRIMITIVES = new Set<string>([
  'v-app',
  'v-app-bar',
  'v-app-bar-title',
  'v-main',
  'v-container',
  'v-navigation-drawer',
  'v-icon',
  'v-spacer',
])

function listVueFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) {
      // Skip the dev directory itself — the audit page is the canary, it
      // shouldn't need to cover its own primitives.
      if (relative(SRC_ROOT, full) === 'pages/dev') continue
      listVueFiles(full, out)
    } else if (extname(entry) === '.vue') {
      out.push(full)
    }
  }
  return out
}

function extractVuetifyTags(source: string): Set<string> {
  const tags = new Set<string>()
  // Match `<v-tag` and `<v-tag-with-dashes` opening tokens. Component names
  // are case-insensitive in Vue templates; we normalize to lower-case.
  for (const match of source.matchAll(/<(v-[a-z0-9-]+)/gi)) {
    tags.add(match[1].toLowerCase())
  }
  return tags
}

describe('theme-audit primitive-coverage canary', () => {
  test('every Vuetify primitive used in product code appears on ThemeAudit.vue', () => {
    const productFiles = listVueFiles(SRC_ROOT)
    const productTags = new Set<string>()
    for (const file of productFiles) {
      const source = readFileSync(file, 'utf8')
      for (const tag of extractVuetifyTags(source)) productTags.add(tag)
    }

    const auditSource = readFileSync(AUDIT_PAGE, 'utf8')
    const auditTags = extractVuetifyTags(auditSource)

    const missing = [...productTags]
      .filter((tag) => !auditTags.has(tag))
      .filter((tag) => !LAYOUT_PRIMITIVES.has(tag))

    expect(
      missing,
      `Vuetify primitives used in product code but not exercised on the theme-audit page:`,
    ).toEqual([])
  })
})

describe('theme-audit decorative-token coverage', () => {
  test('every decorative token has a swatch on the audit page', () => {
    const auditSource = readFileSync(AUDIT_PAGE, 'utf8')
    const decorativeTokens = ['outline', 'outline-variant', 'surface-bright', 'background']
    for (const token of decorativeTokens) {
      // The swatch list registers tokens via the literal string token name.
      expect(
        auditSource.includes(`token: '${token}'`),
        `decorative token "${token}" must appear in colorSwatches`,
      ).toBe(true)
    }
  })

  test('every category token has a swatch on the audit page', () => {
    const auditSource = readFileSync(AUDIT_PAGE, 'utf8')
    for (const token of Object.keys(tixeoColors)) {
      if (!token.startsWith('category-')) continue
      expect(
        auditSource.includes(`token: '${token}'`),
        `category token "${token}" must appear in colorSwatches`,
      ).toBe(true)
    }
  })
})
