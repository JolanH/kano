#!/usr/bin/env node
/**
 * Post-build assertion suite for Epic-3 bundle invariants.
 *
 * Runs from `package.json`'s `postbuild` hook so every `npm run build`
 * (local AND CI) enforces these gates — without depending on an external
 * `size-limit` invocation. Two checks:
 *
 *   1. Respondent initial bundle ≤ 150 KB gzipped (Story 3-8 AC #2).
 *      Computed by walking the Vite manifest from `index.html` →
 *      `_respondent-*.js` → all its transitive static `imports[]`.
 *      Dynamic imports (lazy chunks) do NOT count. This catches the
 *      respondent-statically-imports-PM regression that a naive
 *      `respondent-*.js`-prefix grep would miss.
 *
 *   2. `qrcode` package is dynamically imported, not statically baked
 *      into the PM entry (Story 3-5 AC #3). Verified via the manifest's
 *      `dynamicImports[]` field: every chunk that references `qrcode`
 *      must do so via a dynamic import — never a static one.
 *
 * Non-zero exit on any violation. Output is meant to be readable in
 * both local terminals and CI logs.
 */
import { gzipSync } from 'node:zlib'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const ROOT = resolve(process.cwd())
const DIST = join(ROOT, 'dist')
const DIST_ASSETS = join(DIST, 'assets')
const MANIFEST = join(DIST, '.vite', 'manifest.json')

const RESPONDENT_LIMIT_BYTES = 150 * 1024
const RESPONDENT_ENTRY_PREFIX = '_respondent-'
const QRCODE_MODULE_SUBSTRING = 'qrcode'

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(
        `[check-respondent-bundle] dist/.vite/manifest.json missing. ` +
          `Ensure \`build.manifest: true\` in vite.config.mts.`,
      )
      process.exit(1)
    }
    throw err
  }
}

function findIndexEntry(manifest) {
  // The entry HTML registers under "index.html" in the Vite manifest.
  // It bundles in the index-*.js chunk AND statically imports the
  // pm/respondent route chunks (these are the load-on-first-paint set).
  const entry = manifest['index.html']
  if (!entry) {
    console.error('[check-respondent-bundle] manifest has no "index.html" entry.')
    process.exit(1)
  }
  return entry
}

function collectTransitiveStaticImports(manifest, rootKey) {
  // Walk `imports[]` (NOT `dynamicImports[]`) recursively. Returns the set
  // of manifest keys (each maps to one chunk file) the browser must fetch
  // before the rootKey's JS can execute.
  const seen = new Set()
  const stack = [rootKey]
  while (stack.length) {
    const key = stack.pop()
    if (!key || seen.has(key)) continue
    seen.add(key)
    const entry = manifest[key]
    if (!entry) continue
    for (const imp of entry.imports ?? []) stack.push(imp)
  }
  return seen
}

async function gzippedSize(chunkPath) {
  const buf = await readFile(join(DIST, chunkPath))
  return gzipSync(buf).length
}

async function checkRespondentSize(manifest) {
  const indexEntry = findIndexEntry(manifest)
  // index.html statically imports both `_pm-*.js` and `_respondent-*.js`
  // (Vite emits both as static imports of the HTML entry so the SPA
  // can mount either layout). But for the *respondent* first-paint
  // budget, only the respondent path matters: index → respondent → … .
  const respondentEntryKey = (indexEntry.imports ?? []).find((key) =>
    key.startsWith(RESPONDENT_ENTRY_PREFIX),
  )
  if (!respondentEntryKey) {
    console.error(
      `[check-respondent-bundle] No ${RESPONDENT_ENTRY_PREFIX}* chunk found in ` +
        `index.html imports — manifest structure changed.`,
    )
    process.exit(1)
  }

  // index-*.js is the shared runtime — every route loads it. We include
  // index-*.js + respondent-*.js + their transitive static deps.
  const indexKey = 'index.html'
  const indexFile = indexEntry.file
  const respondentDeps = collectTransitiveStaticImports(manifest, respondentEntryKey)

  // Collect distinct chunk file paths.
  const files = new Map() // file -> bytes
  files.set(indexFile, await gzippedSize(indexFile))
  for (const key of respondentDeps) {
    const entry = manifest[key]
    if (!entry?.file) continue
    if (files.has(entry.file)) continue
    files.set(entry.file, await gzippedSize(entry.file))
  }

  console.log('[check-respondent-bundle] respondent initial bundle (gzipped):')
  let total = 0
  for (const [file, size] of files) {
    console.log(`  ${file}  ${fmtKb(size)}`)
    total += size
  }
  console.log(`  total: ${fmtKb(total)} (limit ${fmtKb(RESPONDENT_LIMIT_BYTES)})`)

  if (total > RESPONDENT_LIMIT_BYTES) {
    console.error(
      `[check-respondent-bundle] FAIL: respondent initial bundle is ${fmtKb(total)} ` +
        `gzipped, over the ${fmtKb(RESPONDENT_LIMIT_BYTES)} ceiling (Story 3-8 AC #2). ` +
        `Cause is usually a static import from src/pages/poll/** into a PM-side module ` +
        `(or vice versa) that pulls the entire PM chunk into the respondent path.`,
    )
    process.exit(1)
  }
}

async function checkLazyQrcode(manifest) {
  // The qrcode library must appear ONLY in `dynamicImports[]`, never
  // `imports[]`. If it ever shows up as a static import on any chunk,
  // PollSharePanel (or some other consumer) regressed into a static
  // top-level `import 'qrcode'`.
  const offenders = []
  let dynamicReferenced = false
  for (const [key, entry] of Object.entries(manifest)) {
    for (const imp of entry.imports ?? []) {
      if (imp.includes(QRCODE_MODULE_SUBSTRING)) offenders.push({ from: key, imp })
    }
    for (const imp of entry.dynamicImports ?? []) {
      if (imp.includes(QRCODE_MODULE_SUBSTRING)) dynamicReferenced = true
    }
  }
  if (offenders.length > 0) {
    console.error(
      `[check-respondent-bundle] FAIL: '${QRCODE_MODULE_SUBSTRING}' must be lazy-loaded ` +
        `(Story 3-5 AC #3) but is statically imported by:`,
    )
    for (const { from, imp } of offenders) {
      console.error(`    ${from}  →  ${imp}`)
    }
    console.error(
      `  Ensure the import uses dynamic \`import('qrcode')\`, not a top-level ` +
        `\`import ... from 'qrcode'\`.`,
    )
    process.exit(1)
  }
  if (!dynamicReferenced) {
    console.warn(
      `[check-respondent-bundle] WARN: '${QRCODE_MODULE_SUBSTRING}' not found in any ` +
        `dynamicImports[]. If PollSharePanel was removed, also remove the dependency.`,
    )
  } else {
    console.log(
      `[check-respondent-bundle] qrcode is lazy-loaded (found in dynamicImports[]).`,
    )
  }
}

async function checkDistExists() {
  try {
    await readdir(DIST_ASSETS)
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`[check-respondent-bundle] no dist/ — run \`npm run build\` first`)
      process.exit(1)
    }
    throw err
  }
}

async function checkRespondentChunkPurity(manifest) {
  // The respondent chunk MUST NOT pull in PM-only Vuetify primitives
  // (Story 3-8 AC #1). These show up as separate async chunks named
  // after the Vuetify component; if the manifest shows respondent-*.js
  // statically importing one of them, the boundary leaked.
  const PM_ONLY_VUETIFY_PATTERNS = [
    /VDataTable/i,
    /VNavigationDrawer/i,
    /VDataIterator/i,
    /VStepper/i,
  ]
  // Find the manifest key for the respondent chunk.
  const respondentKey = Object.keys(manifest).find(
    (k) => k.startsWith(RESPONDENT_ENTRY_PREFIX) && k.endsWith('.js'),
  )
  if (!respondentKey) return
  const staticDeps = collectTransitiveStaticImports(manifest, respondentKey)
  const offenders = []
  for (const key of staticDeps) {
    const file = manifest[key]?.file ?? ''
    if (PM_ONLY_VUETIFY_PATTERNS.some((re) => re.test(file))) {
      offenders.push(file)
    }
  }
  if (offenders.length > 0) {
    console.error(
      `[check-respondent-bundle] FAIL: respondent chunk statically depends ` +
        `on PM-only Vuetify components (Story 3-8 AC #1):`,
    )
    for (const f of offenders) console.error(`    ${f}`)
    process.exit(1)
  }
}

async function main() {
  const start = Date.now()
  await checkDistExists()
  const manifest = await loadManifest()
  await checkRespondentSize(manifest)
  await checkRespondentChunkPurity(manifest)
  await checkLazyQrcode(manifest)
  console.log(`[check-respondent-bundle] OK (${Date.now() - start} ms)`)
}

main().catch((err) => {
  console.error('[check-respondent-bundle] unexpected error:', err)
  process.exit(1)
})
