import Konva from 'konva'
import { FRAMES } from '../utils/wiggleUtils'

// Boil for Text Boxes: instead of nudging the whole glyph node, draw the Konva text through
// one of the SVG displacement filters (#wiggle-filter-0..FRAMES-1) so the letter OUTLINES warp.
// The frame is the node's `animT` attr, set by useWiggle. animT unset or < 0 → draw clean (no
// filter): used while a box is selected/edited (so handles + the editor textarea stay aligned
// with the glyphs) and whenever the boil is globally off.

// Konva calls Text's own _sceneFunc to lay out + fill the glyphs; we just toggle the canvas
// filter around it. Reach the raw 2D context (Konva.Context proxies to it) to set ctx.filter.
function rawCtx(context: Konva.Context): CanvasRenderingContext2D {
  return (context as unknown as { _context: CanvasRenderingContext2D })._context
}

function drawGlyphs(context: Konva.Context, shape: Konva.Shape) {
  ;(Konva.Text.prototype as unknown as {
    _sceneFunc: (c: Konva.Context) => void
  })._sceneFunc.call(shape, context)
}

export function wigglyTextSceneFunc(context: Konva.Context, shape: Konva.Shape) {
  const frame = shape.getAttr('animT') as number | undefined
  const on = frame != null && frame >= 0
  const raw = rawCtx(context)
  if (on) raw.filter = `url(#wiggle-filter-${frame % FRAMES})`
  drawGlyphs(context, shape)
  // The shape-level context.restore() in drawScene already clears this, but reset eagerly so
  // a stray filter can never bleed into a sibling draw.
  if (on) raw.filter = 'none'
}

// Hit canvas must stay unfiltered AND keep Text's default full-box hit area (Konva._hitFunc
// fills the whole width×height rect, so the box is grabbable anywhere inside — not just on the
// thin glyph strokes). Drawing the glyphs here instead would make an empty/sparse box almost
// impossible to click or drag.
export function wigglyTextHitFunc(context: Konva.Context, shape: Konva.Shape) {
  ;(Konva.Text.prototype as unknown as {
    _hitFunc: (c: Konva.Context) => void
  })._hitFunc.call(shape, context)
}
