import { Line, Shape } from 'react-konva'
import type Konva from 'konva'
import type { ReactElement } from 'react'
import { sprayFor, brushSceneFunc, brushHitFunc } from '../utils/sprayUtils'
import { rectToPerimeter, ellipseToPerimeter, jitterMag } from '../utils/wiggleUtils'
import type { ShapeDescriptor, SimpleStrokeType } from './strokeDescriptor'

// The single place that knows how each non-text Stroke type maps to a Konva node.
// All three render paths (committed strokes, this client's live stroke, and remote
// clients' live strokes) build a ShapeDescriptor and call renderShape, so adding or
// changing a shape happens here once instead of in three parallel switch statements.
// Text Boxes are NOT handled here — they render as an interactive Group elsewhere.

export type { ShapeDescriptor, SimpleStrokeType } from './strokeDescriptor'
export { descriptorFromStroke, descriptorFromLive } from './strokeDescriptor'

// Per-call Konva props that differ between the render paths: committed strokes listen
// for double-click deletion and register a wiggle ref; live strokes don't listen.
export interface ShapeChrome {
  key?: string | number
  id?: string
  listening: boolean
  ref?: (node: Konva.Node | null) => void
  onDblClick?: () => void
  // True for an in-progress stroke (this client's live draw or a remote one). Brush uses it to
  // skip its bitmap-frame cache, whose geometry would change every frame anyway.
  live?: boolean
}

export function renderShape(
  type: SimpleStrokeType,
  d: ShapeDescriptor,
  chrome: ShapeChrome,
): ReactElement | null {
  const common = {
    key: chrome.key,
    id: chrome.id,
    listening: chrome.listening,
    ref: chrome.ref,
    onDblClick: chrome.onDblClick,
    // Perf: skip Konva's "perfect draw" offscreen buffer (it double-draws every stroked shape
    // to a temp canvas to hide AA seams — needless for a hand-drawn wiggle look) and the
    // shadow-on-stroke buffer (no shadows here). Roughly halves per-shape draw cost, and the
    // boil re-rasterizes every visible shape ~12×/s, so this compounds. No visual change.
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
  }
  switch (type) {
    case 'path':
      return (
        <Line
          {...common}
          points={d.points}
          stroke={d.color}
          strokeWidth={d.strokeWidth}
          lineCap='round'
          lineJoin='round'
          tension={0.5}
        />
      )
    case 'brush': {
      const sw = d.strokeWidth ?? 6
      // Cached by the points array reference — recomputed only when the stroke's geometry
      // actually changes (the growing live stroke), never on unrelated re-renders.
      const sprayPoints = sprayFor(d.points, sw)
      // Droplets stay the finest 1px size at every brush size — a larger spray spreads wider
      // and denser (radius + density scale in generateSprayPoints), but each speck stays small.
      const dotSize = 1
      return (
        <Shape
          {...common}
          fill={d.color}
          sceneFunc={brushSceneFunc}
          hitFunc={brushHitFunc}
          // Fixed boil amplitude (jitterMag(0), not jitterMag(sw)) so a speck hops the same tiny
          // amount at every brush size — otherwise big brushes smear each 1px dot into a fat blob.
          // hitPoints/hitWidth feed brushHitFunc (a fat line along the original path covers the
          // sprayed width); `live` tells the scene func to skip its frame cache for live strokes.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...({
            sprayPoints,
            dotSize,
            jmag: jitterMag(0),
            animT: 0,
            live: chrome.live ?? false,
            hitPoints: d.points,
            hitWidth: sw * 5,
          } as any)}
        />
      )
    }
    case 'marker':
      // A broad felt-tip stroke. Drawn FULLY OPAQUE so overlapping marker strokes just
      // cover each other instead of stacking alpha (no darkening where they cross). The
      // highlighter translucency is applied once to the whole marker layer via CSS opacity
      // (see MARKER_LAYER_OPACITY in DrawingStage). Boils via the pen's points-swap path.
      return (
        <Line
          {...common}
          points={d.points}
          stroke={d.color}
          strokeWidth={(d.strokeWidth ?? 6) * 3}
          lineCap='round'
          lineJoin='round'
          tension={0.4}
        />
      )
    case 'eraser':
      return (
        <Line
          {...common}
          points={d.points}
          stroke='rgba(0,0,0,1)'
          strokeWidth={d.strokeWidth}
          lineCap='round'
          lineJoin='round'
          tension={0.5}
          globalCompositeOperation='destination-out'
        />
      )
    // Rect/circle render as closed polylines tracing their outline (not Rect/Ellipse
    // nodes) so the boil can jitter their vertices like any other line. Selection is
    // text-only, so nothing depends on these being true geometric primitives.
    case 'rect':
      return (
        <Line
          {...common}
          points={rectToPerimeter(d.x, d.y, d.width, d.height)}
          stroke={d.color}
          strokeWidth={d.strokeWidth}
          lineJoin='round'
          closed
        />
      )
    case 'circle':
      return (
        <Line
          {...common}
          points={ellipseToPerimeter(d.x, d.y, d.radiusX, d.radiusY)}
          stroke={d.color}
          strokeWidth={d.strokeWidth}
          lineJoin='round'
          closed
        />
      )
    case 'line':
      return (
        <Line
          {...common}
          points={d.points}
          stroke={d.color}
          strokeWidth={d.strokeWidth}
          lineCap='round'
        />
      )
    default:
      return null
  }
}
