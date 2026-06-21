import type { AABB } from '../utils/textBoxGeometry'
import type { StrokeKind, StrokeType } from './types'
import {
  descriptorFromStroke,
  type ShapeDescriptor,
  type SimpleStrokeType,
} from '../render/strokeDescriptor'
import {
  drawSimpleStroke,
  drawStickerStroke,
  type DrawOpts,
} from '../engine/drawStroke'
import { drawTextStroke } from '../engine/textLayout'
import { distToPolyline, pointInRotatedRect, pointsBounds } from '../engine/geom'
import { rectToPerimeter, ellipseToPerimeter, jitterMag } from '../utils/wiggleUtils'
import { MIN_TEXT_WIDTH, MIN_TEXT_HEIGHT } from '../utils/strokeSerializer'

// One adapter per committed stroke kind. This is where a kind's draw / cull-bounds / hit
// geometry live — the bodies that used to be scattered switch arms in scene.ts, strokeBounds.ts
// and hitTest.ts. The delegators in those files now just look the kind up here.

const HIT_TOLERANCE = 4 // extra world px around a stroke so thin lines stay clickable
const DEFAULT_HIT_WIDTH = 6 // strokeWidth fallback when hit-testing (matches old strokeHit)
const DEFAULT_BOUNDS_WIDTH = 1 // strokeWidth fallback when culling (matches old strokeBounds)

// Pad a raw AABB by a half-width plus the boil jitter, so neither the stroke's own thickness
// nor its wiggle can clip at the viewport edge.
function pad(box: AABB | null, sw: number, halfWidth: number): AABB | null {
  if (!box) return null
  const p = halfWidth + jitterMag(sw)
  return {
    minX: box.minX - p,
    minY: box.minY - p,
    maxX: box.maxX + p,
    maxY: box.maxY + p,
  }
}

// Shared definition for the stroked-polyline kinds. `boundsBox` is the exact cull rectangle and
// `hitPts` the clickable outline (they differ for rect/circle: an axis box vs. a traced
// perimeter). `widthMul` is the painted-width multiplier — marker paints 3× its stored width.
function polylineKind(
  type: SimpleStrokeType,
  layer: StrokeKind['layer'],
  widthMul: number,
  boundsBox: (d: ShapeDescriptor) => AABB | null,
  hitPts: (d: ShapeDescriptor) => number[],
): StrokeKind {
  return {
    type,
    layer,
    draw(ctx, data, opts: DrawOpts) {
      drawSimpleStroke(ctx, type, descriptorFromStroke(data), opts)
    },
    bounds(data) {
      const sw = data.strokeWidth ?? DEFAULT_BOUNDS_WIDTH
      return pad(boundsBox(descriptorFromStroke(data)), sw, (sw * widthMul) / 2)
    },
    hit(data, px, py) {
      const d = descriptorFromStroke(data)
      const sw = d.strokeWidth ?? DEFAULT_HIT_WIDTH
      return distToPolyline(hitPts(d), px, py) <= (sw * widthMul) / 2 + HIT_TOLERANCE
    },
  }
}

const pointsBox = (d: ShapeDescriptor) => pointsBounds(d.points)
const points = (d: ShapeDescriptor) => d.points
const rectBox = (d: ShapeDescriptor): AABB => ({
  minX: d.x,
  minY: d.y,
  maxX: d.x + d.width,
  maxY: d.y + d.height,
})
const circleBox = (d: ShapeDescriptor): AABB => ({
  minX: d.x - d.radiusX,
  minY: d.y - d.radiusY,
  maxX: d.x + d.radiusX,
  maxY: d.y + d.radiusY,
})
const rectPts = (d: ShapeDescriptor) => rectToPerimeter(d.x, d.y, d.width, d.height)
const circlePts = (d: ShapeDescriptor) =>
  ellipseToPerimeter(d.x, d.y, d.radiusX, d.radiusY)

// Box kinds (text, sticker): never culled, hit-tested as a rotated rectangle.
const textKind: StrokeKind = {
  type: 'text',
  layer: 'last',
  draw(ctx, data, opts) {
    drawTextStroke(ctx, data, opts.frame, opts.wiggle)
  },
  bounds() {
    return null // text & unknowns: never cull
  },
  hit(data, px, py) {
    return pointInRotatedRect(
      px,
      py,
      data.x ?? 0,
      data.y ?? 0,
      data.width ?? MIN_TEXT_WIDTH,
      data.height ?? MIN_TEXT_HEIGHT,
      data.rotation ?? 0,
    )
  },
}

const stickerKind: StrokeKind = {
  type: 'sticker',
  layer: 'last',
  draw(ctx, data, opts) {
    drawStickerStroke(ctx, data, opts.frame, opts.wiggle, opts.salt)
  },
  bounds() {
    return null
  },
  hit(data, px, py) {
    // Stickers normalise to a square preserving the stored centre (see drawStickerStroke).
    const w = data.width ?? 120
    const h = data.height ?? 120
    const s = Math.max(w, h)
    const cx = (data.x ?? 0) + w / 2
    const cy = (data.y ?? 0) + h / 2
    return pointInRotatedRect(px, py, cx - s / 2, cy - s / 2, s, s, data.rotation ?? 0)
  },
}

export const STROKE_KINDS: Record<StrokeType, StrokeKind> = {
  path: polylineKind('path', 'main', 1, pointsBox, points),
  line: polylineKind('line', 'main', 1, pointsBox, points),
  eraser: polylineKind('eraser', 'mask', 1, pointsBox, points),
  marker: polylineKind('marker', 'marker', 3, pointsBox, points),
  rect: polylineKind('rect', 'main', 1, rectBox, rectPts),
  circle: polylineKind('circle', 'main', 1, circleBox, circlePts),
  text: textKind,
  sticker: stickerKind,
}

export function strokeKind(type: StrokeType): StrokeKind {
  return STROKE_KINDS[type]
}
