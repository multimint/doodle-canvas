import { buildStrokeData } from '../utils/strokeSerializer'
import type { Stroke, StrokeData, ToolType } from '../../../lib/types'

// Pure, render-agnostic stroke geometry. Kept free of react-konva so the adapters
// below stay unit-testable without a canvas backend. The JSX renderer that consumes
// these lives in strokeShapes.tsx.

export type SimpleStrokeType =
  | 'path'
  | 'brush'
  | 'eraser'
  | 'rect'
  | 'circle'
  | 'line'

// Final, render-ready geometry + style, normalized so the renderer never has to know
// whether it came from a committed Stroke or from raw live pointer points.
export interface ShapeDescriptor {
  points: number[]
  x: number
  y: number
  width: number
  height: number
  radiusX: number
  radiusY: number
  color?: string
  strokeWidth?: number
}

// Adapter 1: a committed Stroke's stored data already holds final geometry.
export function descriptorFromStroke(data: StrokeData): ShapeDescriptor {
  return {
    points: data.points ?? [],
    x: data.x ?? 0,
    y: data.y ?? 0,
    width: data.width ?? 0,
    height: data.height ?? 0,
    radiusX: data.radiusX ?? 0,
    radiusY: data.radiusY ?? 0,
    color: data.stroke,
    strokeWidth: data.strokeWidth,
  }
}

// Adapter 2: a live stroke carries only raw points; reuse buildStrokeData so the
// rect/circle centre+size math lives in exactly one place.
export function descriptorFromLive(s: {
  type: Stroke['type']
  points: number[]
  color: string
  strokeWidth: number
}): ShapeDescriptor {
  const tool: ToolType = s.type === 'path' ? 'pen' : (s.type as ToolType)
  return descriptorFromStroke(
    buildStrokeData(tool, s.points, s.color, s.strokeWidth),
  )
}
