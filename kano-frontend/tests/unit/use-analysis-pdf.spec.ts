// @vitest-environment jsdom
/**
 * useAnalysisPdf — client-side PDF export composable.
 *
 * `html2canvas` and `jspdf` are mocked so the spec asserts the orchestration
 * (lazy import → capture → A4 pagination → save) and the `exporting` lifecycle
 * without running a real canvas rasterization. The two load-bearing behaviors:
 *
 *  - a short surface produces ONE page (one addImage, no addPage)
 *  - a tall surface is sliced across multiple pages (addPage per overflow)
 *
 * plus `exporting` flips true→false on success AND resets on failure.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  html2canvas: vi.fn(),
  addImage: vi.fn(),
  addPage: vi.fn(),
  save: vi.fn(),
  // A4 in points, as jsPDF reports it.
  getWidth: vi.fn(() => 595),
  getHeight: vi.fn(() => 842),
}))

vi.mock('html2canvas-pro', () => ({ default: mocks.html2canvas }))
vi.mock('jspdf', () => ({
  // A class (not an arrow-fn mock) so `new jsPDF(...)` is constructable.
  jsPDF: class {
    internal = { pageSize: { getWidth: mocks.getWidth, getHeight: mocks.getHeight } }
    addImage = mocks.addImage
    addPage = mocks.addPage
    save = mocks.save
  },
}))

import { useAnalysisPdf } from '@/composables/useAnalysisPdf'

function fakeCanvas(width: number, height: number) {
  return { width, height, toDataURL: vi.fn(() => 'data:image/png;base64,AAAA') }
}

const el = {} as HTMLElement

beforeEach(() => {
  mocks.html2canvas.mockReset()
  mocks.addImage.mockReset()
  mocks.addPage.mockReset()
  mocks.save.mockReset()
})

describe('useAnalysisPdf', () => {
  test('a short surface produces a single page and saves with the filename', async () => {
    // imgH = 500 * 595 / 1000 = 297.5 pt <= 842 pt page height → one page.
    mocks.html2canvas.mockResolvedValue(fakeCanvas(1000, 500))
    const { exporting, exportToPdf } = useAnalysisPdf()

    await exportToPdf(el, 'kano-analysis-epoch-2.pdf')

    expect(mocks.html2canvas).toHaveBeenCalledWith(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    })
    expect(mocks.addImage).toHaveBeenCalledTimes(1)
    expect(mocks.addPage).not.toHaveBeenCalled()
    expect(mocks.save).toHaveBeenCalledWith('kano-analysis-epoch-2.pdf')
    expect(exporting.value).toBe(false)
  })

  test('a tall surface is sliced across multiple A4 pages', async () => {
    // imgH = 4000 * 595 / 1000 = 2380 pt; pages of 842 pt → 3 pages total
    // (one initial addImage + two addPage/addImage for the overflow).
    mocks.html2canvas.mockResolvedValue(fakeCanvas(1000, 4000))
    const { exportToPdf } = useAnalysisPdf()

    await exportToPdf(el, 'tall.pdf')

    expect(mocks.addPage).toHaveBeenCalledTimes(2)
    expect(mocks.addImage).toHaveBeenCalledTimes(3)
    expect(mocks.save).toHaveBeenCalledWith('tall.pdf')
  })

  test('exporting flips true during the run and back to false on success', async () => {
    let inFlight: boolean | null = null
    mocks.html2canvas.mockImplementation(async () => {
      inFlight = controller.exporting.value
      return fakeCanvas(1000, 500)
    })
    const controller = useAnalysisPdf()

    const promise = controller.exportToPdf(el, 'x.pdf')
    expect(controller.exporting.value).toBe(true)
    await promise
    expect(inFlight).toBe(true)
    expect(controller.exporting.value).toBe(false)
  })

  test('a capture failure re-throws and still resets exporting', async () => {
    mocks.html2canvas.mockRejectedValue(new Error('boom'))
    const { exporting, exportToPdf } = useAnalysisPdf()

    await expect(exportToPdf(el, 'x.pdf')).rejects.toThrow('boom')
    expect(exporting.value).toBe(false)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  test('a zero-dimension canvas throws (no silent corrupt PDF) and resets exporting', async () => {
    mocks.html2canvas.mockResolvedValue(fakeCanvas(0, 0))
    const { exporting, exportToPdf } = useAnalysisPdf()

    await expect(exportToPdf(el, 'x.pdf')).rejects.toThrow(/zero dimensions/)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(exporting.value).toBe(false)
  })

  test('a re-entrant call while a run is in flight is ignored', async () => {
    mocks.html2canvas.mockResolvedValue(fakeCanvas(1000, 500))
    const { exporting, exportToPdf } = useAnalysisPdf()
    exporting.value = true // simulate an in-flight export

    await exportToPdf(el, 'x.pdf')

    expect(mocks.html2canvas).not.toHaveBeenCalled()
  })
})
