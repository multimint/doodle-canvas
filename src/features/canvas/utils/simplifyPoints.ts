// Ramer–Douglas–Peucker line simplification on a flat [x0,y0,x1,y1,...] point array.
// Freehand tools capture one sample per mousemove, so a single stroke arrives with hundreds
// of near-collinear vertices. Dropping the ones that sit within `tolerance` (world px) of the
// line between their neighbours leaves the visible curve unchanged while shrinking the vertex
// count that the tension spline, the per-vertex boil variants, and Firebase all pay for.

// Perpendicular distance from point (px,py) to the segment (ax,ay)-(bx,by).
function segDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay) // degenerate segment → point distance
  // Project P onto the segment, clamped to [0,1], then measure to the projection.
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function simplifyPoints(points: number[], tolerance: number): number[] {
  const n = points.length >>> 1
  if (n < 3 || tolerance <= 0) return points

  // Iterative RDP (explicit stack) to avoid blowing the call stack on very long strokes.
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack: [number, number][] = [[0, n - 1]]

  while (stack.length) {
    const [first, last] = stack.pop()!
    let maxDist = -1
    let idx = -1
    const ax = points[first * 2], ay = points[first * 2 + 1]
    const bx = points[last * 2], by = points[last * 2 + 1]
    for (let i = first + 1; i < last; i++) {
      const d = segDist(points[i * 2], points[i * 2 + 1], ax, ay, bx, by)
      if (d > maxDist) {
        maxDist = d
        idx = i
      }
    }
    if (maxDist > tolerance && idx !== -1) {
      keep[idx] = 1
      stack.push([first, idx], [idx, last])
    }
  }

  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(points[i * 2], points[i * 2 + 1])
  }
  return out
}
