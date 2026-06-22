// The discrete stroke sizes offered in the toolbar, and the rule for stepping between
// them (used by the mouse-wheel resize on drawing tools). Kept in one place so the wheel
// and the toolbar buttons always agree on the available sizes.

export const STROKE_SIZES = [3, 6, 12, 22]

// The eraser paints (and its cursor ring shows) at a multiple of the chosen size. This factor
// flows to the committed eraser stroke, its follower cursor, AND the cursor broadcast to friends,
// so everyone sees the same footprint. (Distinct from a tool's marker-style `footprintScale`.)
export const ERASER_SCALE = 4

// The width a tool actually paints with for a given picked width — the eraser's enlarged footprint,
// every other tool 1:1. Single source for the canvas and the Day Doodle modal.
export function effectiveStrokeWidth(tool: string, strokeWidth: number): number {
  return tool === 'eraser' ? strokeWidth * ERASER_SCALE : strokeWidth
}

// Step one size up (dir = 1) or down (dir = -1) from the size closest to `current`,
// clamped to the ends of the list.
export function stepStrokeWidth(current: number, dir: 1 | -1): number {
  let idx = 0
  let best = Infinity
  STROKE_SIZES.forEach((s, i) => {
    const d = Math.abs(s - current)
    if (d < best) {
      best = d
      idx = i
    }
  })
  const next = Math.min(STROKE_SIZES.length - 1, Math.max(0, idx + dir))
  return STROKE_SIZES[next]
}
