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
  // 'image' renders a fixed template artwork (backgroundImage) pinned to the document extent and
  // scaled with zoom — used by the Daily Planner's "My Day" sheet.
  background: 'dot-grid' | 'plain' | 'lined' | 'image'
  // Asset URL for the `image` background (the imported SVG template). Ignored otherwise.
  backgroundImage?: string
  // Camera behaviour. 'free' is the normal pan/zoom canvas. 'bounded' starts fit-to-frame, lets the
  // user zoom in, but clamps pan to the document edges and forbids zooming out past fit — the
  // Daily Planner's "no infinite" view. Defaults to 'free'.
  view?: 'free' | 'bounded'
  defaultTool: ToolType
  // Title a freshly-created document of this kind gets; falls back to 'Untitled Canvas'.
  defaultTitle?: string
}
