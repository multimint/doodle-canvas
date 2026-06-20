import type Konva from 'konva'
import { jrand } from './wiggleUtils'

// Builds the spray-can stamp pattern for a stroke. Mirrors the reference drawSpraySegment:
// clusters stepped ~2px along the path, each emitting `density` droplets with a triangular
// (center-weighted) radial spread. Kept fully deterministic — a fixed LCG seed instead of
// Math.random — so the same stroke re-sprays identically on every render, after refresh, and
// across collaborators (the stroke is stored as vector points and re-rendered, never as pixels).
export function generateSprayPoints(rawPoints: number[], strokeWidth: number): number[] {
  const radius  = strokeWidth * 2.5                          // broad dispersion (2.5x footprint)
  const STEP    = 2                                          // px between clusters (ref: dist/2)
  const density = Math.max(3, Math.floor(strokeWidth * 1.5)) // droplets per cluster, scales w/ size
  const result: number[] = []

  let seed = 1
  const rand = () => {
    seed = ((seed * 1664525) + 1013904223) | 0
    return (seed >>> 0) / 0x100000000
  }

  const place = (cx: number, cy: number) => {
    for (let p = 0; p < density; p++) {
      const angle = rand() * Math.PI * 2
      // Triangular distribution: averaging two seeds pulls most droplets toward the center.
      const centerWeight = (rand() + rand()) * 0.5
      const dist = centerWeight * radius
      result.push(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist)
    }
  }

  if (rawPoints.length < 2) return result

  // Place first cluster at stroke start
  place(rawPoints[0], rawPoints[1])

  // Walk each segment at fixed arc-length steps so density is drawing-speed independent
  let distSinceLast = 0
  for (let i = 0; i + 3 < rawPoints.length; i += 2) {
    const x0 = rawPoints[i],     y0 = rawPoints[i + 1]
    const x1 = rawPoints[i + 2], y1 = rawPoints[i + 3]
    const dx = x1 - x0, dy = y1 - y0
    const segLen = Math.hypot(dx, dy)
    if (segLen === 0) continue

    let d = STEP - distSinceLast  // distance to first cluster in this segment
    while (d <= segLen) {
      const t = d / segLen
      place(x0 + dx * t, y0 + dy * t)
      d += STEP
    }
    distSinceLast = segLen - (d - STEP)  // carry-over distance for next segment
  }

  return result
}

export function brushSceneFunc(ctx: Konva.Context, shape: Konva.Shape) {
  // animT carries the shared boil frame index (0..FRAMES-1), set by useWiggle.
  const frame = (shape.getAttr('animT')      as number)   ?? 0
  const sp    = (shape.getAttr('sprayPoints') as number[]) ?? []
  const ds    = (shape.getAttr('dotSize')     as number)   ?? 2
  const jmag  = (shape.getAttr('jmag')        as number)   ?? 1.5
  // Use underlying canvas2D for rect() (path method not exposed on Konva.Context).
  // beginPath/fillShape go through the Konva proxy so hit-canvas colorKey is preserved.
  const c2d = (ctx as unknown as { _context: CanvasRenderingContext2D })._context

  ctx.beginPath()
  for (let i = 0; i < sp.length; i += 2) {
    const idx = i >>> 1
    // Each dot hops between FRAMES fixed jittered spots — a per-dot, per-frame offset so
    // the whole spray boils coherently with the rest of the canvas.
    const jx = jrand(idx, frame, 0) * jmag
    const jy = jrand(idx, frame, 1) * jmag
    c2d.rect(Math.round(sp[i] + jx), Math.round(sp[i + 1] + jy), ds, ds)
  }
  ctx.fillShape(shape)
}
