import type { StrokeData } from '../../../lib/types'
import type { ShapeDescriptor, SimpleStrokeType } from '../render/strokeDescriptor'
import {
  jitterPoints,
  jitterMag,
  rectToPerimeter,
  ellipseToPerimeter,
} from '../utils/wiggleUtils'
import { sprayFor, drawSpray } from '../utils/sprayUtils'
import { drawSticker } from '../render/stickerLibrary'

// The immediate-mode twin of the old Konva strokeShapes.tsx: it knows how each non-text
// stroke type paints onto a raw 2D context that already carries the camera transform. Lines
// are boiled by jittering their vertices for the current frame (the wiggle.html technique,
// using the project's deterministic jrand so the look matches the old node-swap boil), rects
// and circles trace a jittered outline polyline, brush blits its cached spray frames, and
// stickers stamp from the shared sticker library. Pure drawing — the scene owns the loop and
// the per-layer routing (markers vs. main), and the boil clock owns `frame`.

// Per-draw boil context. `wiggle` off → draw the clean base geometry (toggle / frozen).
export interface DrawOpts {
  frame: number
  salt: number
  wiggle: boolean
  // Device px per world unit (devicePixelRatio × camera zoom) for the spray bitmap cache.
  pr: number
  // True for an in-progress stroke (this client's or a remote's) — brush skips its frame cache.
  live?: boolean
}

// Default stroke width matches the old renderShape fallback.
function sw(d: ShapeDescriptor): number {
  return d.strokeWidth ?? 6
}

// The vertices to stroke this frame: jittered when boiling, the raw base otherwise.
function frameVerts(
  base: number[],
  width: number,
  o: DrawOpts,
): ArrayLike<number> {
  return o.wiggle ? jitterPoints(base, o.frame, width, o.salt) : base
}

function tracePolyline(
  ctx: CanvasRenderingContext2D,
  pts: ArrayLike<number>,
  closed: boolean,
) {
  if (pts.length < 2) return
  ctx.beginPath()
  ctx.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
  if (closed) ctx.closePath()
}

// Draw one non-text, non-sticker stroke. The eraser uses destination-out, which is scoped by
// save/restore so it never bleeds into the next stroke.
export function drawSimpleStroke(
  ctx: CanvasRenderingContext2D,
  type: SimpleStrokeType,
  d: ShapeDescriptor,
  o: DrawOpts,
) {
  const width = sw(d)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (type) {
    case 'path':
    case 'line': {
      ctx.strokeStyle = d.color ?? '#000'
      ctx.lineWidth = width
      tracePolyline(ctx, frameVerts(d.points, width, o), false)
      ctx.stroke()
      break
    }
    case 'marker': {
      // 3× width, fully opaque (highlighter translucency, if any, is a canvas-layer property).
      const w = width * 3
      ctx.strokeStyle = d.color ?? '#000'
      ctx.lineWidth = w
      tracePolyline(ctx, frameVerts(d.points, w, o), false)
      ctx.stroke()
      break
    }
    case 'eraser': {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = d.color ?? 'rgba(0,0,0,1)'
      ctx.lineWidth = width
      tracePolyline(ctx, frameVerts(d.points, width, o), false)
      ctx.stroke()
      break
    }
    case 'rect': {
      const base = rectToPerimeter(d.x, d.y, d.width, d.height)
      ctx.strokeStyle = d.color ?? '#000'
      ctx.lineWidth = width
      tracePolyline(ctx, frameVerts(base, width, o), true)
      ctx.stroke()
      break
    }
    case 'circle': {
      const base = ellipseToPerimeter(d.x, d.y, d.radiusX, d.radiusY)
      ctx.strokeStyle = d.color ?? '#000'
      ctx.lineWidth = width
      tracePolyline(ctx, frameVerts(base, width, o), true)
      ctx.stroke()
      break
    }
    case 'brush': {
      // Droplets stay 1px at every size; spread/density scale inside generateSprayPoints.
      drawSpray(ctx, {
        sprayPoints: sprayFor(d.points, width),
        color: d.color ?? '#000',
        dotSize: 1,
        // Fixed boil amplitude so a speck hops the same tiny amount at any brush size.
        jmag: jitterMag(0),
        frame: o.frame,
        live: o.live ?? false,
        pr: o.pr,
      })
      break
    }
  }
  ctx.restore()
}

// Normalize stored (possibly non-square) sticker data to a square, preserving the center.
// Mirrors squareGeom in the old StickerNode so committed stickers render identically.
function squareGeom(x: number, y: number, w: number, h: number) {
  const s = Math.max(w, h)
  return { cx: x + w / 2, cy: y + h / 2, size: s }
}

// Stamp a sticker: translate to its center, rotate, and draw from the sticker library at
// half-size (the library draws centered at the origin). Matches the old StickerNode transform.
export function drawStickerStroke(
  ctx: CanvasRenderingContext2D,
  data: StrokeData,
) {
  const { cx, cy, size } = squareGeom(
    data.x ?? 0,
    data.y ?? 0,
    data.width ?? 120,
    data.height ?? 120,
  )
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(((data.rotation ?? 0) * Math.PI) / 180)
  drawSticker(ctx, data.stickerId ?? 'flower', size / 2, data.stroke ?? '#000000')
  ctx.restore()
}
