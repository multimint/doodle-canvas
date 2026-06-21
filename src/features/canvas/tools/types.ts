import type { Stroke, StrokeData, ToolType } from '../../../lib/types'
import type { AABB } from '../utils/textBoxGeometry'
import type { DrawOpts } from '../engine/drawStroke'

// The deep seam. A tool's identity used to be smeared across ~10 modules, each with its own
// `switch (tool)` / `switch (type)`; here it lives in two small tables (tools/tools.ts and
// tools/strokeKinds.ts) keyed off these interfaces. Adding a tool or stroke kind is now a local
// change — one descriptor + one adapter — instead of edits across the codebase.

export type StrokeType = Stroke['type']

// The follower-cursor visual a tool paints at the pointer (see ToolCursor.tsx). Owned here so
// the cursor modules can depend on the registry without the registry depending back on them.
export type ToolCursorVariant =
  | 'pen' // precise solid dot in the tool colour, sized to the thin stroke
  | 'marker' // translucent rounded-square felt nib at the broad marker width
  | 'ring' // eraser: hollow ring, sized to the stroke (no colour — it erases)
  | 'crosshair' // line / rect / circle: precise point + small colour dot
  | 'sticker' // a ghost of the selected sticker, previewing the stamp
  | 'none' // text / hand / select: no follower, keep the native cursor

// How the pointer FSM (CanvasStage) treats a tool. A new tool that fits an existing interaction
// needs no FSM edit — it dispatches on this, not on the tool id.
export type InteractionKind =
  | 'freehand' // accumulate points on move (pen, marker, eraser)
  | 'two-point' // start + current as the two ends (line)
  | 'drag-rect' // start + current as opposite corners (rect, circle)
  | 'stamp' // single click commits at the point (sticker)
  | 'text' // drag a box, then open the editor (text)
  | 'pan' // drag the camera (hand)
  | 'select' // hit-test / marquee / move existing strokes (select)

// Everything a caller must know about a tool: its UI chrome, its cursor, how the FSM drives it,
// and which committed stroke kind it produces.
export interface ToolDescriptor {
  id: ToolType
  produces?: StrokeType // committed stroke type, if the tool makes strokes
  label: string
  icon: string // icon name in the icon set
  cssCursor: string // native CSS cursor keyword when no follower is shown
  cursorVariant: ToolCursorVariant
  footprintScale: number // painted width ÷ picked width (marker 3×, else 1×)
  interaction: InteractionKind
  inToolbar: boolean // shown in the toolbar's main draw-tools row
}

// Everything a caller must know about a committed stroke kind: which canvas layer it paints on
// (the eraser-compositing ordering depends on this), how to draw it, its cull bounds, and its
// hit geometry. One adapter per `Stroke['type']`.
export interface StrokeKind {
  type: StrokeType
  // Which raster layer this kind paints on:
  //   'marker' → the translucent highlighter layer only,
  //   'main'   → the opaque main layer only,
  //   'mask'   → BOTH layers (the eraser: its destination-out must cut markers and main alike),
  //   'last'   → painted after the eraser has run, so it's immune to it (text, sticker).
  layer: 'marker' | 'main' | 'mask' | 'last'
  draw(ctx: CanvasRenderingContext2D, data: StrokeData, opts: DrawOpts): void
  bounds(data: StrokeData): AABB | null // null = never cull / always render
  hit(data: StrokeData, px: number, py: number): boolean
}
