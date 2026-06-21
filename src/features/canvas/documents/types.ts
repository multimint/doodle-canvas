import type { ToolType } from '../../../lib/types'

// A document kind: the template a canvas is created from. Today the app ships one kind ('canvas'),
// so this is a thin seam — but it's the one place the per-template knobs (size, background, the
// tool a fresh document opens with) live, so adding a second template (e.g. a sticky-note board
// or grid paper) is a local change here rather than edits to creation, loading, and rendering.
export interface DocumentKind {
  id: string
  label: string
  width: number
  height: number
  background: 'dot-grid' | 'plain' | 'lined'
  defaultTool: ToolType
}
