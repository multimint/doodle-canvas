import type { StrokeData, ToolType } from '../../../lib/types'
import { simplifyPoints } from './simplifyPoints'

export const MIN_TEXT_WIDTH = 200
export const MIN_TEXT_HEIGHT = 80

// Freehand tools sample a point on every mousemove — hundreds of near-collinear vertices for
// one stroke. tension splines, per-vertex boil variants, and Firebase payloads all scale with
// that count, so thin out redundant points at commit (RDP, ~0.6px world tolerance). Drawn
// shape is visually identical; only imperceptible wobble between samples is dropped.
const SIMPLIFY_TOLERANCE = 0.6

export function buildStrokeData(
  tool: ToolType,
  points: number[],
  color: string,
  strokeWidth: number,
  extra?: Partial<StrokeData>,
): StrokeData {
  if (tool === 'eraser') {
    return {
      points: simplifyPoints(points, SIMPLIFY_TOLERANCE),
      stroke: 'rgba(0,0,0,1)',
      strokeWidth,
      globalCompositeOperation: 'destination-out',
    }
  }
  if (tool === 'pen') {
    return { points: simplifyPoints(points, SIMPLIFY_TOLERANCE), stroke: color, strokeWidth }
  }
  if (tool === 'brush') {
    return { points: simplifyPoints(points, SIMPLIFY_TOLERANCE), stroke: color, strokeWidth }
  }
  if (tool === 'marker') {
    return { points: simplifyPoints(points, SIMPLIFY_TOLERANCE), stroke: color, strokeWidth }
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
    const [x, y, x2, y2] = points
    const width = Math.max(MIN_TEXT_WIDTH, Math.abs((x2 ?? x) - x))
    const height = Math.max(MIN_TEXT_HEIGHT, Math.abs((y2 ?? y) - y))
    return {
      x: Math.min(x, x2 ?? x),
      y: Math.min(y, y2 ?? y),
      width,
      height,
      text: extra?.text ?? '',
      fontSize: strokeWidth * 4 + 8,
      stroke: color,
      fill: color,
      strokeWidth: 0,
    }
  }
  return {}
}
