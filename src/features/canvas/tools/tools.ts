import type { ToolType } from '../../../lib/types'
import type { ToolDescriptor } from './types'

// The tool table. Everything the UI, the cursor modules, and the pointer FSM need to know about
// a tool lives in one descriptor here — replacing the parallel switch statements that used to
// live in cursorForTool.ts, toolCursor.ts, Toolbar.tsx's DRAW_TOOLS, and CanvasStage's FSM.
// Order is the toolbar display order for the entries with `inToolbar: true`.
export const TOOL_LIST: ToolDescriptor[] = [
  {
    id: 'pen',
    produces: 'path',
    label: 'Pen',
    icon: 'pen',
    cssCursor: 'crosshair',
    cursorVariant: 'pen',
    footprintScale: 1,
    interaction: 'freehand',
    inToolbar: true,
  },
  {
    id: 'marker',
    produces: 'marker',
    label: 'Marker',
    icon: 'marker',
    cssCursor: 'crosshair',
    cursorVariant: 'marker',
    footprintScale: 3,
    interaction: 'freehand',
    inToolbar: true,
  },
  {
    id: 'line',
    produces: 'line',
    label: 'Line',
    icon: 'line',
    cssCursor: 'crosshair',
    cursorVariant: 'crosshair',
    footprintScale: 1,
    interaction: 'two-point',
    inToolbar: true,
  },
  {
    id: 'rect',
    produces: 'rect',
    label: 'Rectangle',
    icon: 'square',
    cssCursor: 'crosshair',
    cursorVariant: 'crosshair',
    footprintScale: 1,
    interaction: 'drag-rect',
    inToolbar: true,
  },
  {
    id: 'circle',
    produces: 'circle',
    label: 'Circle',
    icon: 'circle',
    cssCursor: 'crosshair',
    cursorVariant: 'crosshair',
    footprintScale: 1,
    interaction: 'drag-rect',
    inToolbar: true,
  },
  {
    id: 'text',
    produces: 'text',
    label: 'Text',
    icon: 'text',
    cssCursor: 'text',
    cursorVariant: 'none',
    footprintScale: 1,
    interaction: 'text',
    inToolbar: true,
  },
  {
    id: 'sticker',
    produces: 'sticker',
    label: 'Sticker',
    icon: 'sticker',
    cssCursor: 'crosshair',
    cursorVariant: 'sticker',
    footprintScale: 1,
    interaction: 'stamp',
    inToolbar: true,
  },
  {
    id: 'eraser',
    produces: 'eraser',
    label: 'Eraser',
    icon: 'eraser',
    cssCursor: 'cell',
    cursorVariant: 'ring',
    footprintScale: 1,
    interaction: 'freehand',
    inToolbar: false, // rendered as its own button outside the draw-tools row
  },
  {
    id: 'hand',
    label: 'Hand (Space)',
    icon: 'hand',
    cssCursor: 'grab',
    cursorVariant: 'none',
    footprintScale: 1,
    interaction: 'pan',
    inToolbar: false,
  },
  {
    id: 'select',
    label: 'Select',
    icon: 'pen', // never shown; select has no toolbar button
    cssCursor: 'default',
    cursorVariant: 'none',
    footprintScale: 1,
    interaction: 'select',
    inToolbar: false,
  },
]

export const TOOLS: Record<ToolType, ToolDescriptor> = Object.fromEntries(
  TOOL_LIST.map((t) => [t.id, t]),
) as Record<ToolType, ToolDescriptor>

export function toolFor(id: ToolType): ToolDescriptor {
  return TOOLS[id]
}

// The tools shown in the toolbar's main draw-tools row, in display order.
export function toolbarTools(): ToolDescriptor[] {
  return TOOL_LIST.filter((t) => t.inToolbar)
}
