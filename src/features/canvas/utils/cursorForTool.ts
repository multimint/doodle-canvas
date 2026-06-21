import type { ToolType } from '../../../lib/types'
import { toolFor } from '../tools/registry'

// The CSS cursor shown over the canvas for a given tool. `hand` and `select` keep their cursor
// even when drawing is disabled (they don't draw); every drawing tool falls back to not-allowed
// when the canvas is at its Stroke Cap. The per-tool keyword lives on the tool descriptor.
export function cursorForTool(tool: ToolType, disabled: boolean): string {
  const t = toolFor(tool)
  if (t.interaction === 'pan' || t.interaction === 'select') return t.cssCursor
  if (disabled) return 'not-allowed'
  return t.cssCursor
}
