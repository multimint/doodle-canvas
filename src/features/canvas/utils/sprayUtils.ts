import type Konva from 'konva'

const JITTER_MS = 80  // discrete jitter interval — ~12 hops per second

export function generateSprayPoints(rawPoints: number[], strokeWidth: number): number[] {
  const radius = strokeWidth * 2.5
  const dotsPerSample = 12
  const result: number[] = []

  let seed = 1
  const rand = () => {
    seed = ((seed * 1664525) + 1013904223) | 0
    return (seed >>> 0) / 0x100000000
  }

  // Sample every other raw point (step = 4 numbers = every 2nd point)
  for (let i = 0; i + 1 < rawPoints.length; i += 4) {
    const cx = rawPoints[i]
    const cy = rawPoints[i + 1]
    for (let j = 0; j < dotsPerSample; j++) {
      const angle = rand() * Math.PI * 2
      // rand()*rand() = quadratic falloff: dense at center, sparse at edge
      const dist = rand() * rand() * radius
      result.push(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist)
    }
  }
  return result
}

export function brushSceneFunc(ctx: Konva.Context, shape: Konva.Shape) {
  const t   = (shape.getAttr('animT')      as number)   ?? 0
  const sp  = (shape.getAttr('sprayPoints') as number[]) ?? []
  const ds  = (shape.getAttr('dotSize')    as number)   ?? 2
  const frame = Math.floor(t / JITTER_MS)
  // Access underlying canvas2D to call rect() (path method not exposed on Konva.Context).
  // beginPath/fillShape go through the Konva proxy so hit-canvas colorKey is handled correctly.
  const c2d = (ctx as unknown as { _context: CanvasRenderingContext2D })._context

  ctx.beginPath()
  for (let i = 0; i < sp.length; i += 2) {
    const idx = i >>> 1
    const h1 = (((idx * 1103515245 + frame * 12345) | 0) >>> 0)
    const h2 = (((idx * 214013   + frame * 2531011) | 0) >>> 0)
    const x = Math.round(sp[i])     + (h1 % 3) - 1
    const y = Math.round(sp[i + 1]) + (h2 % 3) - 1
    c2d.rect(x, y, ds, ds)  // square pixel added to shared path
  }
  ctx.fillShape(shape)  // fills with shape.fill() on scene, colorKey on hit canvas
}
