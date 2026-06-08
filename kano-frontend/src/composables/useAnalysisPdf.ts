/**
 * `useAnalysisPdf` — client-side "Export PDF" for the poll analysis surface.
 *
 * Rasterizes a live DOM element (the `.analysis-page` section) to a canvas via
 * `html2canvas`, then slices that canvas across as many A4 pages as needed and
 * downloads the result with `jspdf`. The PDF is a faithful snapshot of what's
 * on screen — the chosen tradeoff is that text/SVG become a raster image
 * rather than selectable vector text.
 *
 * Both libraries are loaded with dynamic `import()` INSIDE `exportToPdf` (never
 * at module top-level) so they land in a lazy Vite chunk — mirroring the
 * `qrcode` pattern in `PollSharePanel.vue`. This keeps them out of the static
 * index/respondent entry and preserves the 150 KB respondent-bundle gate in
 * `scripts/check-respondent-bundle.mjs`.
 *
 * `exporting` lets the caller bind a loading state on the trigger button.
 * Failures (dynamic-import error, html2canvas throw) reset `exporting` in a
 * `finally` and re-throw so the caller can surface its own error UI.
 */

import { ref, type Ref } from 'vue'

export interface AnalysisPdfController {
  exporting: Ref<boolean>
  exportToPdf: (el: HTMLElement, filename: string) => Promise<void>
}

export function useAnalysisPdf(): AnalysisPdfController {
  const exporting = ref(false)

  async function exportToPdf(el: HTMLElement, filename: string): Promise<void> {
    // Re-entrancy guard: a double-click shouldn't fire two concurrent
    // captures into the same download.
    if (exporting.value) return
    exporting.value = true
    try {
      // `html2canvas-pro` (not the stock `html2canvas`): the original is
      // pinned at 1.4.1 (2022) and throws `unsupported color function
      // "color"` because the browser resolves our theme's `color-mix()` into
      // the modern `color(srgb …)` syntax it can't parse. The `-pro` fork is a
      // drop-in with the same default-export API plus `color()`/`oklch`/`lab`
      // support.
      const { default: html2canvas } = await import('html2canvas-pro')
      const { jsPDF } = await import('jspdf')

      // White background so the captured surface isn't transparent (which
      // renders black in some PDF viewers). `scale: 2` keeps text/chart
      // edges crisp without ballooning the PNG unreasonably.
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })

      // A zero-dimension canvas means the capture failed or the surface had
      // collapsed (e.g. detached/hidden). Without this guard `imgH` below
      // would be `NaN`, the pagination loop would never run, and `save()`
      // would emit a corrupt one-page PDF *silently* — defeating the whole
      // point of the error snackbar. Throw so the caller surfaces it.
      if (!canvas.width || !canvas.height) {
        throw new Error('useAnalysisPdf: captured canvas has zero dimensions')
      }

      const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      // Scale the captured image to the page width; height follows the source
      // aspect ratio. A surface taller than one page is paged by repeatedly
      // re-placing the same image at a negative y-offset and clipping to the
      // page — the canonical html2canvas → jsPDF multi-page pattern.
      const imgH = (canvas.height * pageW) / canvas.width
      const img = canvas.toDataURL('image/png')

      let heightLeft = imgH
      let position = 0
      pdf.addImage(img, 'PNG', 0, position, pageW, imgH)
      heightLeft -= pageH
      // `> PAGE_EPSILON` (not `> 0`): float drift through the scale×2 and
      // px→pt conversions can leave a sub-point sliver after the last full
      // page, which would otherwise emit a gratuitous near-blank trailing
      // page. 1 pt ≈ 0.35 mm — well below anything a reader would notice.
      const PAGE_EPSILON = 1
      while (heightLeft > PAGE_EPSILON) {
        position -= pageH
        pdf.addPage()
        pdf.addImage(img, 'PNG', 0, position, pageW, imgH)
        heightLeft -= pageH
      }

      pdf.save(filename)
    } finally {
      exporting.value = false
    }
  }

  return { exporting, exportToPdf }
}
