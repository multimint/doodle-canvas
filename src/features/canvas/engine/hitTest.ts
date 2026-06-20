import type { Stroke, StrokeData } from '../../../lib/types'
import { MIN_TEXT_WIDTH, MIN_TEXT_HEIGHT } from '../utils/strokeSerializer'
import { rectToPerimeter, ellipseToPerimeter } from '../utils/wiggleUtils'
import { descriptorFromStroke } from '../render/strokeDescriptor'

// Replaces Konva's hit graph. Konva color-keyed an off-screen canvas per node; here we test
// the world point against each stroke's geometry directly: distance-to-polyline for the line
// family, and point-in-rotated-rect for the full-box types (text, sticker). Strokes are tested
// top-most first so the result matches what the user sees on top. A small world-space tolerance
// keeps thin strokes clickable, mirroring the generous hit widths the old renderer used.

const TOLERANCE = 4 // extra world px around a stroke so thin lines stay clickable

// Squared distance from point (px,py) to segment (ax,ay)-(bx,by). Squared to avoid sqrt in the
// inner loop; callers compare against a squared threshold.
function distSqToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return (px - cx) ** 2 + (py - cy) ** 2
}

// Min distance from a point to a flat [x0,y0,x1,y1,…] polyline. Infinity for <2 points.
export function distToPolyline(
  pts: ArrayLike<number>,
  px: number,
  py: number,
): number {
  if (pts.length < 4) {
    if (pts.length < 2) return Infinity
    return Math.hypot(px - pts[0], py - pts[1])
  }
  let min = Infinity
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const d = distSqToSegment(px, py, pts[i], pts[i + 1], pts[i + 2], pts[i + 3])
    if (d < min) min = d
  }
  return Math.sqrt(min)
}

// Whether (px,py) lies inside a box rotated `rotDeg` about its centre. Un-rotates the point
// into the box's local frame, then does a plain bounds test.
export function pointInRotatedRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
  rotDeg: number,
): boolean {
  const cx = x + w / 2
  const cy = y + h / 2
  const rad = (-rotDeg * Math.PI) / 180
  const dx = px - cx
  const dy = py - cy
  const lx = cx + dx * Math.cos(rad) - dy * Math.sin(rad)
  const ly = cy + dx * Math.sin(rad) + dy * Math.cos(rad)
  return lx >= x && lx <= x + w && ly >= y && ly <= y + h
}

// Hit half-width (world px) for a line-family stroke — the on-screen thickness the user aims at.
function lineThreshold(type: Stroke['type'], sw: number): number {
  if (type === 'marker') return (sw * 3) / 2
  if (type === 'brush') return sw * 2.5 // spray dispersion radius
  return sw / 2
}

// True when the world point hits this stroke's geometry.
export function strokeHit(stroke: Stroke, px: number, py: number): boolean {
  const data: StrokeData = stroke.data ?? {}
  if (stroke.type === 'text') {
    return pointInRotatedRect(
      px,
      py,
      data.x ?? 0,
      data.y ?? 0,
      data.width ?? MIN_TEXT_WIDTH,
      data.height ?? MIN_TEXT_HEIGHT,
      data.rotation ?? 0,
    )
  }
  if (stroke.type === 'sticker') {
    // Stickers normalize to a square preserving the stored centre (see drawStickerStroke).
    const w = data.width ?? 120
    const h = data.height ?? 120
    const s = Math.max(w, h)
    const cx = (data.x ?? 0) + w / 2
    const cy = (data.y ?? 0) + h / 2
    return pointInRotatedRect(px, py, cx - s / 2, cy - s / 2, s, s, data.rotation ?? 0)
  }

  const d = descriptorFromStroke(data)
  const sw = d.strokeWidth ?? 6
  let pts: number[]
  if (stroke.type === 'rect') pts = rectToPerimeter(d.x, d.y, d.width, d.height)
  else if (stroke.type === 'circle')
    pts = ellipseToPerimeter(d.x, d.y, d.radiusX, d.radiusY)
  else pts = d.points
  return distToPolyline(pts, px, py) <= lineThreshold(stroke.type, sw) + TOLERANCE
}

// Top-most stroke at the world point, or null. `filter` lets a caller restrict the search
// (e.g. only text/sticker for the select tool, or exclude markers).
export function strokeAt(
  strokes: Stroke[],
  px: number,
  py: number,
  filter?: (s: Stroke) => boolean,
): Stroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i]
    if (filter && !filter(s)) continue
    if (strokeHit(s, px, py)) return s
  }
  return null
}
