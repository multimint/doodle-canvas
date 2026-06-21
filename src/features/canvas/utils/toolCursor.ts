import type { ToolType } from '../../../lib/types'
import { toolFor } from '../tools/registry'
import type { ToolCursorVariant } from '../tools/registry'

// The size/area-aware follower cursor (see ToolCursor.tsx). The per-tool rules — which visual a
// tool gets and how much wider than the picked width it paints — now live on the tool descriptor
// (tools/tools.ts); these are thin readers over the registry. cursorForTool still owns the native
// CSS cursor keyword. The size math stays here as it's purely numeric.
export type { ToolCursorVariant }

// Smallest on-screen diameter (px) for the sized variants, so a thin stroke at low zoom stays
// aimable instead of collapsing to a sub-pixel dot.
export const MIN_CURSOR_SIZE = 8

export function toolCursorVariant(tool: ToolType): ToolCursorVariant {
  return toolFor(tool).cursorVariant
}

// True when the tool draws its footprint with the follower (and so the stage should hide the
// native cursor in its favour).
export function usesToolCursor(tool: ToolType): boolean {
  return toolFor(tool).cursorVariant !== 'none'
}

// How much wider than the picked stroke width the tool actually paints, so each cursor can
// mirror its real footprint: the pen lays a 1× line and the marker a 3× felt nib.
export function toolFootprintScale(tool: ToolType): number {
  return toolFor(tool).footprintScale
}

// On-screen diameter for the sized variants: the painted width (strokeWidth in canvas units,
// scaled by zoom and the tool's footprint multiplier) clamped to a usable minimum.
export function toolCursorSize(strokeWidth: number, zoom: number, scale = 1): number {
  return Math.max(MIN_CURSOR_SIZE, strokeWidth * zoom * scale)
}
