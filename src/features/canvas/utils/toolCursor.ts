import type { ToolType } from '../../../lib/types'

// The size/area-aware follower cursor (see ToolCursor.tsx). This module holds the pure
// rules — which visual a tool gets and how big the sized variants render — so they can be
// unit-tested without a DOM. cursorForTool still owns the native CSS cursor keyword.

// Smallest on-screen diameter (px) for the sized variants, so a thin stroke at low zoom
// stays aimable instead of collapsing to a sub-pixel dot.
export const MIN_CURSOR_SIZE = 8

export type ToolCursorVariant =
  | 'filled' // pen / brush: solid dot in the tool color, sized to the stroke
  | 'ring' // eraser: hollow ring, sized to the stroke (no color — it erases)
  | 'crosshair' // line / rect / circle: precise point + small color dot (size is the drag)
  | 'none' // text / hand / select: no follower, keep the native cursor

export function toolCursorVariant(tool: ToolType): ToolCursorVariant {
  if (tool === 'pen' || tool === 'brush') return 'filled'
  if (tool === 'eraser') return 'ring'
  if (tool === 'line' || tool === 'rect' || tool === 'circle') return 'crosshair'
  return 'none'
}

// True when the tool draws its footprint with the follower (and so the stage should hide
// the native cursor in its favour).
export function usesToolCursor(tool: ToolType): boolean {
  return toolCursorVariant(tool) !== 'none'
}

// On-screen diameter for the sized variants: the painted width (strokeWidth in canvas
// units, scaled by zoom) clamped to a usable minimum.
export function toolCursorSize(strokeWidth: number, zoom: number): number {
  return Math.max(MIN_CURSOR_SIZE, strokeWidth * zoom)
}
