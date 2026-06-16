import type Konva from 'konva'

const JITTER_MS = 80

export function generateSprayPoints(rawPoints: number[], strokeWidth: number): number[] {
  const radius       = strokeWidth * 2.5
  const STEP         = Math.max(2, strokeWidth / 2)  // pixels between clusters along path
  const PER_CLUSTER  = 8                              // dots per cluster
  const result: number[] = []

  let seed = 1
  const rand = () => {
    seed = ((seed * 1664525) + 1013904223) | 0
    return (seed >>> 0) / 0x100000000
  }

  const place = (cx: number, cy: number) => {
    for (let j = 0; j < PER_CLUSTER; j++) {
      const angle = rand() * Math.PI * 2
      const dist  = rand() * rand() * radius  // quadratic: dense at center, sparse at edge
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
  const t   = (shape.getAttr('animT')       as number)   ?? 0
  const sp  = (shape.getAttr('sprayPoints') as number[]) ?? []
  const ds  = (shape.getAttr('dotSize')     as number)   ?? 2
  const frame = Math.floor(t / JITTER_MS)
  // Use underlying canvas2D for rect() (path method not exposed on Konva.Context).
  // beginPath/fillShape go through the Konva proxy so hit-canvas colorKey is preserved.
  const c2d = (ctx as unknown as { _context: CanvasRenderingContext2D })._context

  const move = frame % 4  // 0-3 pixels, cycles every 4 jitter frames (~320ms)

  ctx.beginPath()
  for (let i = 0; i < sp.length; i += 2) {
    const idx  = i >>> 1
    // Direction is fixed per dot (hash of index only, no frame involvement)
    const dir  = (((idx * 2246822519) | 0) >>> 0) % 4  // 0=right 1=left 2=down 3=up
    const jx   = dir === 0 ?  move : dir === 1 ? -move : 0
    const jy   = dir === 2 ?  move : dir === 3 ? -move : 0
    c2d.rect(Math.round(sp[i]) + jx, Math.round(sp[i + 1]) + jy, ds, ds)
  }
  ctx.fillShape(shape)
}
