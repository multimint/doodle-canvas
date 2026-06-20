import { jrand, FRAMES } from './wiggleUtils'

// Builds the spray-can stamp pattern for a stroke. Mirrors the reference drawSpraySegment:
// clusters stepped ~2px along the path, each emitting `density` droplets with a triangular
// (center-weighted) radial spread. Kept fully deterministic — a fixed LCG seed instead of
// Math.random — so the same stroke re-sprays identically on every render, after refresh, and
// across collaborators (the stroke is stored as vector points and re-rendered, never as pixels).

// Hard ceiling on droplets per stroke. Each one is a fill + a boil re-fill 12×/s, so an
// unbounded count is what tanks both drawing (live regen) and viewing (boil). Strokes below
// this are untouched and look identical; only long/fat strokes that would blow past it get
// their cluster spacing widened to land near the budget — the pathological strokes that were
// actually costing the frames. Keep it a round number so the math stays obvious.
const MAX_DROPLETS = 2500

export function generateSprayPoints(rawPoints: number[], strokeWidth: number): number[] {
  const radius  = strokeWidth * 2.5                          // broad dispersion (2.5x footprint)
  const density = Math.max(3, Math.floor(strokeWidth * 1.5)) // droplets per cluster, scales w/ size

  // Total path length, so we can pick a cluster spacing that keeps the droplet count bounded.
  let pathLen = 0
  for (let i = 0; i + 3 < rawPoints.length; i += 2) {
    pathLen += Math.hypot(rawPoints[i + 2] - rawPoints[i], rawPoints[i + 3] - rawPoints[i + 1])
  }
  // Base spacing 2px (≈ the reference app's dist/2); widen it just enough that
  // (clusters × density) stays under the budget. Short strokes keep the dense 2px spacing.
  const BASE_STEP = 2
  const estDroplets = (pathLen / BASE_STEP) * density
  const STEP = estDroplets > MAX_DROPLETS ? BASE_STEP * (estDroplets / MAX_DROPLETS) : BASE_STEP
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

// Per-stroke spray cache. The droplet pattern depends only on (points, strokeWidth), and a
// committed stroke hands back the SAME points array reference every render (see
// descriptorFromStroke), so we memoize on that reference. Without this, every DrawingStage
// re-render — i.e. every mousemove while drawing — regenerated the full spray (thousands of
// droplets) for EVERY brush stroke on screen, not just the live one. A WeakMap lets a stroke's
// entry be collected once its data array is gone (e.g. the stroke is deleted or edited).
const sprayCache = new WeakMap<number[], { sw: number; spray: number[] }>()

export function sprayFor(points: number[], strokeWidth: number): number[] {
  const hit = sprayCache.get(points)
  if (hit && hit.sw === strokeWidth) return hit.spray
  const spray = generateSprayPoints(points, strokeWidth)
  sprayCache.set(points, { sw: strokeWidth, spray })
  return spray
}

// Append every droplet of boil frame `frame` to the current path, rounded to the world grid
// (the historic look). The caller owns beginPath/fill and the fillStyle.
function pathDroplets(
  c2d: CanvasRenderingContext2D, sp: number[], frame: number, ds: number, jmag: number,
) {
  for (let i = 0; i < sp.length; i += 2) {
    const idx = i >>> 1
    // Each dot hops between FRAMES fixed jittered spots — a per-dot, per-frame offset so
    // the whole spray boils coherently with the rest of the canvas.
    const jx = jrand(idx, frame, 0) * jmag
    const jy = jrand(idx, frame, 1) * jmag
    c2d.rect(Math.round(sp[i] + jx), Math.round(sp[i + 1] + jy), ds, ds)
  }
}

// ── 3-frame bitmap cache ──────────────────────────────────────────────────────────────────
// Re-filling thousands of droplet rects on every boil frame (12×/s, every visible stroke) is
// the spray draw cost. The boil only ever shows FRAMES fixed jitters, so we rasterize each one
// to an offscreen canvas ONCE and blit it — turning the per-frame work from O(droplets) into a
// single drawImage. Frames are baked at the stroke's current on-screen resolution (devicePixel
// ratio × zoom) so they stay crisp; a >20% zoom change rebuilds them. Keyed on the spray array
// reference (stable per committed stroke, see sprayFor), so a deleted/edited stroke's frames are
// GC'd with it. Live and oversized strokes skip the cache and draw droplets directly.

interface FrameCache {
  color: string
  ds: number
  jmag: number
  pr: number                 // device px per world unit the frames were baked at
  x: number; y: number       // world-space top-left the frames map to
  w: number; h: number       // world-space size
  frames: HTMLCanvasElement[]
}

// Per-frame pixel budget. Above this a stroke is too big to cache cheaply (a huge sprayed area
// zoomed in) — fall back to direct droplet drawing rather than allocate a giant canvas ×FRAMES.
const MAX_FRAME_PX = 4_000_000

const frameCache = new WeakMap<number[], FrameCache>()

function sprayExtent(sp: number[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < sp.length; i += 2) {
    const x = sp[i], y = sp[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

function buildFrames(
  sp: number[], color: string, ds: number, jmag: number, pr: number,
): FrameCache | null {
  if (sp.length < 2) return null
  const pad = jmag + ds + 1 // jitter + dot size can push a droplet just past the raw extent
  const e = sprayExtent(sp)
  const x = e.minX - pad, y = e.minY - pad
  const w = e.maxX - e.minX + pad * 2, h = e.maxY - e.minY + pad * 2
  const pw = Math.ceil(w * pr), ph = Math.ceil(h * pr)
  if (pw <= 0 || ph <= 0 || pw * ph > MAX_FRAME_PX) return null

  const frames: HTMLCanvasElement[] = []
  for (let f = 0; f < FRAMES; f++) {
    const cv = document.createElement('canvas')
    cv.width = pw
    cv.height = ph
    const c = cv.getContext('2d')
    if (!c) return null
    c.scale(pr, pr)        // bake at on-screen resolution
    c.translate(-x, -y)    // world coords → frame-local
    c.fillStyle = color
    c.beginPath()
    pathDroplets(c, sp, f, ds, jmag)
    c.fill()
    frames.push(cv)
  }
  return { color, ds, jmag, pr, x, y, w, h, frames }
}

function framesFor(
  sp: number[], color: string, ds: number, jmag: number, pr: number,
): FrameCache | null {
  const hit = frameCache.get(sp)
  // Reuse unless style changed or the zoom moved enough to matter (>20%).
  if (hit && hit.color === color && hit.ds === ds && hit.jmag === jmag &&
      Math.abs(hit.pr - pr) <= hit.pr * 0.2) {
    return hit
  }
  const built = buildFrames(sp, color, ds, jmag, pr)
  if (built) frameCache.set(sp, built)
  return built
}

export interface SprayDrawOpts {
  sprayPoints: number[]
  color: string
  dotSize: number
  jmag: number
  frame: number
  // The live stroke's geometry changes every move, so baking 3 frames each time would cost
  // more than it saves — live strokes draw droplets straight.
  live: boolean
  // Device px per world unit (devicePixelRatio × camera zoom) the cache frames bake at, so a
  // blitted frame stays crisp. A >20% change rebuilds the frames (see framesFor).
  pr: number
}

// Draw a spray stroke for boil frame `frame` onto a 2D context that already carries the world
// transform (camera pan/zoom). Committed strokes blit their cached bitmap frame; live and
// oversized strokes path the droplets directly. The immediate-mode replacement for the old
// Konva brush sceneFunc — same cache, no Konva indirection.
export function drawSpray(c2d: CanvasRenderingContext2D, o: SprayDrawOpts) {
  const sp = o.sprayPoints
  if (sp.length < 2) return
  const fi = ((o.frame % FRAMES) + FRAMES) % FRAMES

  if (!o.live) {
    const fc = framesFor(sp, o.color, o.dotSize, o.jmag, o.pr)
    if (fc) {
      c2d.drawImage(fc.frames[fi], fc.x, fc.y, fc.w, fc.h)
      return
    }
    // fc null → stroke too big to cache: fall through to direct draw.
  }

  c2d.fillStyle = o.color
  c2d.beginPath()
  pathDroplets(c2d, sp, fi, o.dotSize, o.jmag)
  c2d.fill()
}
