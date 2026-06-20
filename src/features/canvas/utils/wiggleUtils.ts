// Shared "boil" primitives: the deterministic per-vertex jitter that makes every
// stroke shake between a small set of fixed variants, cycled on a slow clock. This is
// the Konva-native stand-in for the reference paint app's 3-offscreen-frame boil — we
// keep vector nodes and just swap their geometry, so zoom/pan/selection/Firebase are
// untouched. useWiggle.ts drives the clock; strokeShapes.tsx feeds in the geometry.

// 3 frames at ~12fps, matching the reference app's renderLoop (1000/12 ≈ 83ms).
export const FRAME_MS = 83
export const FRAMES = 3

// Jitter amplitude in canvas units. Mirrors the reference app: a 1.5px floor so thin
// strokes still visibly boil, scaling gently with stroke width so fat strokes wobble more.
export function jitterMag(strokeWidth: number): number {
  return Math.max(1.5, strokeWidth * 0.12)
}

// Which of the FRAMES variants is showing at time t. One shared clock for the whole canvas.
export function frameIndex(t: number): number {
  return Math.floor(t / FRAME_MS) % FRAMES
}

// Deterministic signed noise in [-1, 1] from three integer seeds. Pure function of its
// inputs, so a given (vertex, frame) always lands on the same offset — that stability is
// what turns random noise into a repeatable 3-position boil instead of continuous static.
export function jrand(a: number, b: number, c: number): number {
  let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b)
  h = (h ^ Math.imul((b + 0x165667b1) >>> 0, 0xc2b2ae35)) >>> 0
  h = (h ^ Math.imul((c + 0x27d4eb2f) >>> 0, 0x9e3779b9)) >>> 0
  h ^= h >>> 15
  return ((h >>> 0) / 0xffffffff) * 2 - 1
}

// Stable per-stroke salt so neighbouring strokes don't boil in lockstep.
export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h >>> 0
}

// Copy of a flat [x0,y0,x1,y1,...] array with every vertex jittered for a given frame.
// Returns a Float32Array: contiguous, 4 bytes/element (vs ~48 for boxed number[]), faster
// to allocate and iterate in Konva's inner draw loop, and lower GC pressure at 2000 strokes.
export function jitterPoints(
  points: number[],
  frame: number,
  strokeWidth: number,
  salt = 0,
): Float32Array {
  const mag = jitterMag(strokeWidth)
  const out = new Float32Array(points.length)
  for (let i = 0; i < points.length; i += 2) {
    const v = i >>> 1
    out[i] = points[i] + jrand(v, frame, salt) * mag
    out[i + 1] = points[i + 1] + jrand(v, frame, salt + 101) * mag
  }
  return out
}

// Precompute all FRAMES jittered variants of a fixed point set (committed strokes).
export function buildVariants(
  points: number[],
  strokeWidth: number,
  salt = 0,
): Float32Array[] {
  const variants: Float32Array[] = []
  for (let f = 0; f < FRAMES; f++) {
    variants.push(jitterPoints(points, f, strokeWidth, salt))
  }
  return variants
}

// Small per-frame (dx, dy) wobble for a whole node (used to boil Text Boxes by nudging
// the glyph node within its box). Amplitude floor matches a thin stroke.
export function nodeJitter(salt: number, frame: number): [number, number] {
  const mag = jitterMag(0)
  return [jrand(salt, frame, 7) * mag, jrand(salt, frame, 9) * mag]
}

// Per-frame whole-sticker boil: a small translate + rotate that hops between the 3 boil
// frames, scaled to the sticker so big stamps shimmy proportionally. This is the reference
// app's sticker wiggle, driven by the project's deterministic jrand instead of sin(frame),
// so a sticker shakes in lockstep with the surrounding lines. Returns [dx, dy, dRot(rad)].
export function stickerJitter(
  salt: number,
  frame: number,
  size: number,
): [number, number, number] {
  const amp = Math.max(2, size * 0.05)
  return [
    jrand(salt, frame, 11) * amp,
    jrand(salt, frame, 13) * amp,
    jrand(salt, frame, 17) * 0.06,
  ]
}

// ── Outline roughening ──────────────────────────────────────────────────────────────
// Rect/circle have no points of their own, so to boil them we trace their outline as a
// sampled polyline (vertices ~`step` apart) and let the same jitter machinery shake it.

function pushEdge(
  ax: number, ay: number, bx: number, by: number, step: number, out: number[],
) {
  const len = Math.hypot(bx - ax, by - ay)
  const n = Math.max(1, Math.round(len / step))
  for (let i = 0; i < n; i++) {
    const t = i / n
    out.push(ax + (bx - ax) * t, ay + (by - ay) * t)
  }
}

// Closed polyline tracing a rectangle's perimeter (corners always included).
export function rectToPerimeter(
  x: number, y: number, w: number, h: number, step = 22,
): number[] {
  const out: number[] = []
  pushEdge(x, y, x + w, y, step, out)
  pushEdge(x + w, y, x + w, y + h, step, out)
  pushEdge(x + w, y + h, x, y + h, step, out)
  pushEdge(x, y + h, x, y, step, out)
  return out
}

// Closed polyline approximating an ellipse outline.
export function ellipseToPerimeter(
  cx: number, cy: number, rx: number, ry: number, step = 22,
): number[] {
  const circ = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
  const n = Math.max(12, Math.round(circ / step))
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)
  }
  return out
}
