import type { Stroke } from '../../../lib/types'
import { type Camera, type ViewportBounds } from './camera'
import { strokeBounds } from '../utils/strokeBounds'
import { hashStr } from '../utils/wiggleUtils'
import {
  descriptorFromStroke,
  type SimpleStrokeType,
} from '../render/strokeDescriptor'
import { drawSimpleStroke, drawStickerStroke } from './drawStroke'
import { drawTextStroke } from './textLayout'

// The scene layer: turns the committed stroke list into draw calls on the layered canvases.
// It owns the camera→device transform, the per-frame clear, viewport culling (the win over
// Konva, which drew every node), and the per-stroke dispatch. CanvasStage owns the loop and
// routes which strokes go to the marker canvas vs. the main canvas (eraser compositing depends
// on that ordering); this module just knows how to paint a given stroke.

// Map the world→device-pixel transform onto a context. The canvas backing store is sized at
// devicePixelRatio for crispness, so device px = (world * zoom + pan) * dpr.
export function applyCamera(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  dpr: number,
) {
  const s = cam.zoom * dpr
  ctx.setTransform(s, 0, 0, s, cam.panX * dpr, cam.panY * dpr)
}

// Clear a transparent layer (the dot grid lives in CSS behind the canvases, so we never fill).
export function clearLayer(
  ctx: CanvasRenderingContext2D,
  wCss: number,
  hCss: number,
  dpr: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, wCss * dpr, hCss * dpr)
}

// True when any part of the stroke's padded bounds intersects the viewport. strokeBounds
// returns null for text (and unknowns), which we treat as always-visible.
export function isVisible(stroke: Stroke, bounds: ViewportBounds): boolean {
  const b = strokeBounds(stroke)
  if (!b) return true
  return !(
    b.maxX < bounds.minX ||
    b.minX > bounds.maxX ||
    b.maxY < bounds.minY ||
    b.minY > bounds.maxY
  )
}

// Paint one committed stroke onto a context that already carries the camera transform.
// `pr` (device px per world unit) feeds the spray bitmap cache.
export function drawCommitted(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  frame: number,
  wiggle: boolean,
  pr: number,
) {
  if (stroke.type === 'text') {
    drawTextStroke(ctx, stroke.data ?? {}, frame, wiggle)
    return
  }
  if (stroke.type === 'sticker') {
    drawStickerStroke(ctx, stroke.data ?? {})
    return
  }
  drawSimpleStroke(
    ctx,
    stroke.type as SimpleStrokeType,
    descriptorFromStroke(stroke.data),
    { frame, salt: hashStr(stroke.id), wiggle, pr },
  )
}

// Draw a list of strokes in order, culling those outside the viewport. The eraser is never
// culled away from a marker it overlaps, because both share the timestamp-ordered list the
// caller passes — culling only drops strokes wholly off-screen.
export function drawList(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  bounds: ViewportBounds,
  frame: number,
  wiggle: boolean,
  pr: number,
) {
  for (const s of strokes) {
    if (!isVisible(s, bounds)) continue
    drawCommitted(ctx, s, frame, wiggle, pr)
  }
}
