import type { Stroke } from '../../../lib/types'
import type { AABB } from './textBoxGeometry'
import { jitterMag } from './wiggleUtils'

// World-space bounding box of a non-text stroke, padded so neither the stroke's own width nor
// its boil jitter can clip at the viewport edge. Returns null for types we never cull (text,
// or anything missing geometry) — the caller treats null as "always render". Used for viewport
// culling: off-screen strokes are dropped from the scene entirely, so they cost nothing to
// boil. When they pan back in they remount and re-register with the wiggle hook.

function pointsBounds(pts: number[] | undefined): AABB | null {
  if (!pts || pts.length < 2) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

export function strokeBounds(stroke: Stroke): AABB | null {
  const d = stroke.data ?? {}
  const sw = d.strokeWidth ?? 1
  let box: AABB | null
  let pad = sw / 2

  switch (stroke.type) {
    case 'path':
    case 'line':
    case 'eraser':
      box = pointsBounds(d.points)
      break
    case 'marker':
      box = pointsBounds(d.points)
      pad = (sw * 3) / 2 // rendered 3× wider than its stored strokeWidth (see strokeShapes)
      break
    case 'brush':
      box = pointsBounds(d.points)
      pad = sw * 2.5 // spray dispersion radius (see generateSprayPoints)
      break
    case 'rect':
      box = {
        minX: d.x ?? 0,
        minY: d.y ?? 0,
        maxX: (d.x ?? 0) + (d.width ?? 0),
        maxY: (d.y ?? 0) + (d.height ?? 0),
      }
      break
    case 'circle':
      box = {
        minX: (d.x ?? 0) - (d.radiusX ?? 0),
        minY: (d.y ?? 0) - (d.radiusY ?? 0),
        maxX: (d.x ?? 0) + (d.radiusX ?? 0),
        maxY: (d.y ?? 0) + (d.radiusY ?? 0),
      }
      break
    default:
      return null // text & unknown types: never cull
  }
  if (!box) return null
  pad += jitterMag(sw) // boil can push a vertex out by up to this much
  return {
    minX: box.minX - pad,
    minY: box.minY - pad,
    maxX: box.maxX + pad,
    maxY: box.maxY + pad,
  }
}
