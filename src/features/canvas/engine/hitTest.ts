import type { Stroke } from '../../../lib/types'
import { strokeKind } from '../tools/registry'

// Replaces Konva's hit graph. Konva color-keyed an off-screen canvas per node; here we test the
// world point against each stroke's geometry directly. The per-kind geometry (distance-to-
// polyline for the line family, point-in-rotated-rect for text/sticker) now lives in the stroke-
// kind adapters (tools/strokeKinds.ts); this module owns the top-most-first search over them.
// The pure primitives the adapters use are re-exported here so existing callers/tests keep their
// import path.
export { distToPolyline, pointInRotatedRect } from './geom'

// True when the world point hits this stroke's geometry.
export function strokeHit(stroke: Stroke, px: number, py: number): boolean {
  return strokeKind(stroke.type).hit(stroke.data ?? {}, px, py)
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
