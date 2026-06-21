// The tool/stroke registry: the single seam callers go through instead of switching on tool or
// stroke type. Re-exports the two descriptor tables and their lookups so consumers import from
// one place.
export type {
  ToolDescriptor,
  StrokeKind,
  StrokeType,
  ToolCursorVariant,
  InteractionKind,
} from './types'
export { TOOLS, TOOL_LIST, toolFor, toolbarTools } from './tools'
export { STROKE_KINDS, strokeKind } from './strokeKinds'

import type { ToolType } from '../../../lib/types'
import type { StrokeKind } from './types'
import { toolFor } from './tools'
import { strokeKind } from './strokeKinds'

// The committed stroke kind a tool produces (pen → path, etc.), or null for tools that don't
// make strokes (hand, select).
export function strokeKindForTool(tool: ToolType): StrokeKind | null {
  const produces = toolFor(tool).produces
  return produces ? strokeKind(produces) : null
}
