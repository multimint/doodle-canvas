import type Konva from 'konva'
import type { Stroke, StrokeData, ToolType } from '../../../lib/types'

export function strokeToKonvaProps(stroke: Stroke): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: stroke.id,
    listening: false,
    ...stroke.data,
  }

  switch (stroke.type) {
    case 'path':
    case 'eraser':
      return {
        ...base,
        lineCap: 'round',
        lineJoin: 'round',
        tension: 0.5,
      }
    case 'rect':
      return { ...base, fill: 'transparent' }
    case 'circle':
      return { ...base, fill: 'transparent' }
    case 'line':
      return { ...base, lineCap: 'round' }
    case 'text':
      return { ...base, fontFamily: 'sans-serif' }
    default:
      return base
  }
}

export function buildStrokeData(
  tool: ToolType,
  points: number[],
  color: string,
  strokeWidth: number,
  extra?: Partial<StrokeData>,
): StrokeData {
  if (tool === 'eraser') {
    return {
      points,
      stroke: 'rgba(0,0,0,1)',
      strokeWidth,
      globalCompositeOperation: 'destination-out',
    }
  }
  if (tool === 'pen') {
    return { points, stroke: color, strokeWidth }
  }
  if (tool === 'line') {
    return { points, stroke: color, strokeWidth }
  }
  if (tool === 'rect') {
    const [x, y, x2, y2] = points
    return {
      x: Math.min(x, x2),
      y: Math.min(y, y2),
      width: Math.abs(x2 - x),
      height: Math.abs(y2 - y),
      stroke: color,
      strokeWidth,
    }
  }
  if (tool === 'circle') {
    const [x, y, x2, y2] = points
    return {
      x: (x + x2) / 2,
      y: (y + y2) / 2,
      radiusX: Math.abs(x2 - x) / 2,
      radiusY: Math.abs(y2 - y) / 2,
      stroke: color,
      strokeWidth,
    }
  }
  if (tool === 'text') {
    return {
      x: points[0],
      y: points[1],
      text: extra?.text ?? '',
      fontSize: strokeWidth * 4 + 8,
      stroke: color,
      fill: color,
      strokeWidth: 0,
    }
  }
  return {}
}

export function konvaShapeToStroke(
  shape: Konva.Shape,
  tool: ToolType,
  authorId: string,
): Omit<Stroke, 'id'> {
  const attrs = shape.attrs as StrokeData
  return {
    type: tool === 'pen' ? 'path' : tool,
    authorId,
    data: attrs,
    timestamp: Date.now(),
  }
}
