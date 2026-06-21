import type { StrokeData } from '../../../lib/types'
import { DOODLE_FONT } from '../../../lib/fonts'
import { MIN_TEXT_WIDTH, MIN_TEXT_HEIGHT } from '../utils/strokeSerializer'
import { FRAMES } from '../utils/wiggleUtils'

// One source of truth for Text Box layout: word-wrap, line widths, vertical/horizontal
// alignment, and caret placement. The old code leaned on Konva.Text's internal `textArr` /
// `_getTextWidth` (see the deleted RemoteTextCaret), which tied caret rendering to Konva. This
// pure module reproduces that layout so the on-canvas draw, the editor overlay, and remote
// carets all agree — without a rendering backend. A `measure` function is injected so the math
// is unit-testable with a synthetic metric; production uses a shared offscreen 2D context.

type Align = 'left' | 'center' | 'right'
type VAlign = 'top' | 'middle' | 'bottom'

export interface TextLayoutOpts {
  fontSize: number
  fontFamily: string
  width: number
  height: number
  lineHeight: number // multiple of fontSize
  align: Align
  verticalAlign: VAlign
}

interface TextLine {
  text: string
  width: number
}

export interface TextLayout {
  lines: TextLine[]
  lineHeightPx: number
  totalHeight: number
}

export type Measure = (s: string) => number

// The Text Box defaults the old Konva <Text> was configured with (padding 0, lineHeight 1,
// centered both ways). Callers override fontSize/width/height per box.
const TEXT_DEFAULTS: Omit<TextLayoutOpts, 'fontSize' | 'width' | 'height'> = {
  fontFamily: DOODLE_FONT,
  lineHeight: 1,
  align: 'center',
  verticalAlign: 'middle',
}

// The CSS/Canvas `font` shorthand for a box (matches what Konva built internally).
function textFont(fontSize: number, fontFamily = DOODLE_FONT): string {
  return `${fontSize}px ${fontFamily}`
}

// Shared offscreen context for measuring. Created lazily; harmless to be null in non-DOM
// environments (callers that need real metrics run in the browser).
let measureCanvas: HTMLCanvasElement | null = null
export function makeMeasurer(fontSize: number, fontFamily = DOODLE_FONT): Measure {
  if (typeof document === 'undefined') return (s) => s.length * fontSize * 0.5
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return (s) => s.length * fontSize * 0.5
  ctx.font = textFont(fontSize, fontFamily)
  return (s) => ctx.measureText(s).width
}

// Word-wrap one hard-break-free paragraph into lines that each fit `maxWidth`. Greedy by word;
// a single word wider than the box is broken by character. The boundary space is dropped (as
// Konva did), so caret mapping re-finds each line in the source string to absorb the gap.
function wrapParagraph(para: string, maxWidth: number, measure: Measure): string[] {
  if (para === '' || measure(para) <= maxWidth) return [para]
  const out: string[] = []
  let line = ''
  for (const word of para.split(' ')) {
    const candidate = line ? line + ' ' + word : word
    if (measure(candidate) <= maxWidth) {
      line = candidate
      continue
    }
    if (line) {
      out.push(line)
      line = ''
    }
    if (measure(word) <= maxWidth) {
      line = word
    } else {
      // Char-wrap an over-long word.
      let chunk = ''
      for (const ch of word) {
        if (chunk && measure(chunk + ch) > maxWidth) {
          out.push(chunk)
          chunk = ch
        } else {
          chunk += ch
        }
      }
      line = chunk
    }
  }
  out.push(line)
  return out
}

export function layoutText(
  text: string,
  opts: TextLayoutOpts,
  measure: Measure,
): TextLayout {
  const lineHeightPx = opts.fontSize * opts.lineHeight
  const paragraphs = text.split('\n')
  const lines: TextLine[] = []
  for (const para of paragraphs) {
    for (const lt of wrapParagraph(para, opts.width, measure)) {
      lines.push({ text: lt, width: measure(lt) })
    }
  }
  return { lines, lineHeightPx, totalHeight: lines.length * lineHeightPx }
}

// Left edge (box-local x) of a line given the horizontal alignment.
function lineLeft(lineWidth: number, opts: TextLayoutOpts): number {
  if (opts.align === 'center') return (opts.width - lineWidth) / 2
  if (opts.align === 'right') return opts.width - lineWidth
  return 0
}

// Top edge (box-local y) of the text block given the vertical alignment.
function blockTop(totalHeight: number, opts: TextLayoutOpts): number {
  if (opts.verticalAlign === 'middle') return (opts.height - totalHeight) / 2
  if (opts.verticalAlign === 'bottom') return opts.height - totalHeight
  return 0
}

// Box-local caret rectangle for a global caret offset into `text`. Mirrors the old
// RemoteTextCaret math, but reads this module's layout instead of Konva internals.
export function caretRect(
  layout: TextLayout,
  text: string,
  caretOffset: number,
  opts: TextLayoutOpts,
  measure: Measure,
): { x: number; y: number; h: number } {
  const lines =
    layout.lines.length === 0 ? [{ text: '', width: 0 }] : layout.lines
  const caret = Math.max(0, Math.min(caretOffset, text.length))

  // Map the global caret offset to (lineIdx, col). Re-find each line's text starting past the
  // previous line so the dropped boundary space / '\n' doesn't shift the column.
  let pos = 0
  let lineIdx = lines.length - 1
  let col = lines[lineIdx].text.length
  for (let i = 0; i < lines.length; i++) {
    const lt = lines[i].text
    let start = text.indexOf(lt, pos)
    if (start < 0) start = pos
    const end = start + lt.length
    if (caret <= end || i === lines.length - 1) {
      lineIdx = i
      col = caret < start ? 0 : Math.min(caret, end) - start
      break
    }
    pos = end
  }

  const line = lines[lineIdx]
  const x = lineLeft(line.width, opts) + measure(line.text.slice(0, col))
  const y = blockTop(layout.totalHeight, opts) + lineIdx * layout.lineHeightPx
  return { x, y, h: layout.lineHeightPx }
}

// Build the layout opts for a committed/active Text Box from its stored data.
export function optsFromData(data: {
  fontSize?: number
  width?: number
  height?: number
}): TextLayoutOpts {
  return {
    ...TEXT_DEFAULTS,
    fontSize: data.fontSize ?? 24,
    width: data.width ?? MIN_TEXT_WIDTH,
    height: data.height ?? MIN_TEXT_HEIGHT,
  }
}

// Draw a Text Box's glyphs onto a context that already carries the camera transform, at world
// position (data.x, data.y). Boil warps the letter outlines through the SVG displacement filter
// (#wiggle-filter-N), exactly as the old wigglyText sceneFunc did; wiggle off draws clean. An
// empty box renders a faint "Text" placeholder so it stays visible and selectable.
export function drawTextStroke(
  ctx: CanvasRenderingContext2D,
  data: StrokeData,
  frame: number,
  wiggle: boolean,
) {
  const opts = optsFromData(data)
  const isEmpty = !data.text
  const display = isEmpty ? 'Text' : data.text!
  const color = isEmpty ? '#b8b8b8' : (data.fill ?? data.stroke ?? '#14151c')
  const measure = makeMeasurer(opts.fontSize, opts.fontFamily)
  const layout = layoutText(display, opts, measure)

  const x0 = data.x ?? 0
  const y0 = data.y ?? 0
  const top = blockTop(layout.totalHeight, opts)

  ctx.save()
  // Rotate about the box centre (matches the old Konva group rotation).
  const rot = data.rotation ?? 0
  if (rot) {
    const cx = x0 + opts.width / 2
    const cy = y0 + opts.height / 2
    ctx.translate(cx, cy)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.translate(-cx, -cy)
  }
  ctx.font = textFont(opts.fontSize, opts.fontFamily)
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  if (wiggle) ctx.filter = `url(#wiggle-filter-${frame % FRAMES})`
  layout.lines.forEach((line, i) => {
    const lx = x0 + lineLeft(line.width, opts)
    const ly = y0 + top + i * layout.lineHeightPx
    ctx.fillText(line.text, lx, ly)
  })
  ctx.restore()
}
