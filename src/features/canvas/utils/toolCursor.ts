import type { ToolType } from '../../../lib/types'

// The size/area-aware follower cursor (see ToolCursor.tsx). This module holds the pure
// rules — which visual a tool gets and how big the sized variants render — so they can be
// unit-tested without a DOM. cursorForTool still owns the native CSS cursor keyword.

// Smallest on-screen diameter (px) for the sized variants, so a thin stroke at low zoom
// stays aimable instead of collapsing to a sub-pixel dot.
export const MIN_CURSOR_SIZE = 8

export type ToolCursorVariant =
  | 'pen' // pen: precise solid dot in the tool color, sized to the thin stroke
  | 'marker' // marker: translucent rounded-square felt nib at the broad marker width
  | 'ring' // eraser: hollow ring, sized to the stroke (no color — it erases)
  | 'crosshair' // line / rect / circle: precise point + small color dot (size is the drag)
  | 'sticker' // sticker: a ghost of the selected sticker, previewing the stamp before placing
  | 'none' // text / hand / select: no follower, keep the native cursor

export function toolCursorVariant(tool: ToolType): ToolCursorVariant {
  if (tool === 'pen') return 'pen'
  if (tool === 'marker') return 'marker'
  if (tool === 'eraser') return 'ring'
  if (tool === 'line' || tool === 'rect' || tool === 'circle') return 'crosshair'
  if (tool === 'sticker') return 'sticker'
  return 'none'
}

// True when the tool draws its footprint with the follower (and so the stage should hide
// the native cursor in its favour).
export function usesToolCursor(tool: ToolType): boolean {
  return toolCursorVariant(tool) !== 'none'
}

// How much wider than the picked stroke width the tool actually paints, so each cursor can
// mirror its real footprint: the pen lays a 1× line and the marker a 3× felt nib.
export function toolFootprintScale(tool: ToolType): number {
  if (tool === 'marker') return 3
  return 1
}

// On-screen diameter for the sized variants: the painted width (strokeWidth in canvas units,
// scaled by zoom and the tool's footprint multiplier) clamped to a usable minimum.
export function toolCursorSize(strokeWidth: number, zoom: number, scale = 1): number {
  return Math.max(MIN_CURSOR_SIZE, strokeWidth * zoom * scale)
}
