import type { ToolType } from '../../../lib/types'

// The CSS cursor shown over the canvas for a given tool. `hand` and `select` keep their
// cursor even when drawing is disabled (they don't draw); every drawing tool falls back
// to not-allowed when the canvas is at its Stroke Cap.
export function cursorForTool(tool: ToolType, disabled: boolean): string {
  if (tool === 'hand') return 'grab'
  if (tool === 'select') return 'default'
  if (disabled) return 'not-allowed'
  if (tool === 'eraser') return 'cell'
  if (tool === 'text') return 'text'
  return 'crosshair'
}
