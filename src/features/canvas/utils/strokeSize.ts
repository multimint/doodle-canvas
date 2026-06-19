// The discrete stroke sizes offered in the toolbar, and the rule for stepping between
// them (used by the mouse-wheel resize on drawing tools). Kept in one place so the wheel
// and the toolbar buttons always agree on the available sizes.

export const STROKE_SIZES = [3, 6, 12, 22]

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
