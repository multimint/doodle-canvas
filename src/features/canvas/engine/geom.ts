import type { AABB } from '../utils/textBoxGeometry'

// Pure geometric primitives shared by the stroke-kind adapters (tools/strokeKinds.ts) and the
// hit-test / culling delegators. Kept in a leaf module with no domain imports so the kind
// adapters can use it without dragging in the registry — which would otherwise close an import
// cycle (registry → kinds → hitTest → registry).

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

// Axis-aligned bounds of a flat [x0,y0,x1,y1,…] point list. Null for <1 point.
export function pointsBounds(pts: number[] | undefined): AABB | null {
  if (!pts || pts.length < 2) return null
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const x = pts[i],
      y = pts[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}
