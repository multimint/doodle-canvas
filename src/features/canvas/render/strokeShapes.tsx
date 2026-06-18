import { Line, Rect, Ellipse, Shape } from 'react-konva'
import type Konva from 'konva'
import type { ReactElement } from 'react'
import { generateSprayPoints, brushSceneFunc } from '../utils/sprayUtils'
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
      const sprayPoints = generateSprayPoints(d.points, d.strokeWidth ?? 6)
      const dotSize = Math.max(1, Math.floor((d.strokeWidth ?? 6) / 6))
      return (
        <Shape
          {...common}
          fill={d.color}
          sceneFunc={brushSceneFunc}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...({ sprayPoints, dotSize, animT: 0 } as any)}
        />
      )
    }
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
    case 'rect':
      return (
        <Rect
          {...common}
          x={d.x}
          y={d.y}
          width={d.width}
          height={d.height}
          stroke={d.color}
          strokeWidth={d.strokeWidth}
          fill='transparent'
        />
      )
    case 'circle':
      return (
        <Ellipse
          {...common}
          x={d.x}
          y={d.y}
          radiusX={d.radiusX}
          radiusY={d.radiusY}
          stroke={d.color}
          strokeWidth={d.strokeWidth}
          fill='transparent'
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
