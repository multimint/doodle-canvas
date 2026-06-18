import { MIN_TEXT_WIDTH, MIN_TEXT_HEIGHT } from './strokeSerializer'

// Pure geometry for Text Box selection, resize, and rotation. No React or Konva
// imports — all functions operate on plain numbers so they are unit-testable in
// isolation. Coordinates are world (canvas) coords unless noted.

// 8 resize handles for a selected Text Box. role letters encode which edges move.
export type HandleRole = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const RESIZE_HANDLES: { role: HandleRole; cursor: string }[] = [
  { role: 'nw', cursor: 'nwse-resize' },
  { role: 'n', cursor: 'ns-resize' },
  { role: 'ne', cursor: 'nesw-resize' },
  { role: 'e', cursor: 'ew-resize' },
  { role: 'se', cursor: 'nwse-resize' },
  { role: 's', cursor: 'ns-resize' },
  { role: 'sw', cursor: 'nesw-resize' },
  { role: 'w', cursor: 'ew-resize' },
]

export type Box = { x: number; y: number; width: number; height: number }

export function handleAnchor(role: HandleRole, b: Box): { x: number; y: number } {
  const left = b.x,
    right = b.x + b.width,
    top = b.y,
    bottom = b.y + b.height
  const midX = (left + right) / 2,
    midY = (top + bottom) / 2
  switch (role) {
    case 'nw':
      return { x: left, y: top }
    case 'n':
      return { x: midX, y: top }
    case 'ne':
      return { x: right, y: top }
    case 'e':
      return { x: right, y: midY }
    case 'se':
      return { x: right, y: bottom }
    case 's':
      return { x: midX, y: bottom }
    case 'sw':
      return { x: left, y: bottom }
    case 'w':
      return { x: left, y: midY }
  }
}

export type AABB = { minX: number; minY: number; maxX: number; maxY: number }

// Axis-aligned bounding box of a (possibly rotated) Text Box, in world coords.
export function textAABB(d: {
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
}): AABB {
  const x = d.x ?? 0,
    y = d.y ?? 0,
    w = d.width ?? MIN_TEXT_WIDTH,
    h = d.height ?? MIN_TEXT_HEIGHT
  const rot = ((d.rotation ?? 0) * Math.PI) / 180
  if (!rot) return { minX: x, minY: y, maxX: x + w, maxY: y + h }
  const cx = x + w / 2,
    cy = y + h / 2
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const [px, py] of [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]) {
    const dx = px - cx,
      dy = py - cy
    const rx = cx + dx * Math.cos(rot) - dy * Math.sin(rot)
    const ry = cy + dx * Math.sin(rot) + dy * Math.cos(rot)
    minX = Math.min(minX, rx)
    minY = Math.min(minY, ry)
    maxX = Math.max(maxX, rx)
    maxY = Math.max(maxY, ry)
  }
  return { minX, minY, maxX, maxY }
}

export const aabbOverlap = (a: AABB, b: AABB) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY

// Move the dragged edge(s) to the pointer; opposite edges stay anchored; clamp to min.
export function computeResize(
  role: HandleRole,
  px: number,
  py: number,
  b: Box,
): Box {
  let left = b.x,
    right = b.x + b.width,
    top = b.y,
    bottom = b.y + b.height
  if (role.includes('w')) left = Math.min(px, right - MIN_TEXT_WIDTH)
  if (role.includes('e')) right = Math.max(px, left + MIN_TEXT_WIDTH)
  if (role.includes('n')) top = Math.min(py, bottom - MIN_TEXT_HEIGHT)
  if (role.includes('s')) bottom = Math.max(py, top + MIN_TEXT_HEIGHT)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export type RotBox = Box & { rotation: number }

// Given a resize handle role, the box's fixed start frame (st), and the world pointer,
// return the box's new world geometry. Unrotate pointer -> resize in local frame ->
// re-rotate the new centre back to world. Shared by single- and multi-select handles.
export function resizeFromPointer(
  role: HandleRole,
  st: RotBox,
  wp: { x: number; y: number },
): RotBox {
  const cx = st.x + st.width / 2,
    cy = st.y + st.height / 2
  const rad = (st.rotation * Math.PI) / 180
  const dx = wp.x - cx,
    dy = wp.y - cy
  const lx = dx * Math.cos(-rad) - dy * Math.sin(-rad)
  const ly = dx * Math.sin(-rad) + dy * Math.cos(-rad)
  const base = {
    x: -st.width / 2,
    y: -st.height / 2,
    width: st.width,
    height: st.height,
  }
  const nb = computeResize(role, lx, ly, base)
  const ocx = nb.x + nb.width / 2,
    ocy = nb.y + nb.height / 2
  const wcx = cx + (ocx * Math.cos(rad) - ocy * Math.sin(rad))
  const wcy = cy + (ocx * Math.sin(rad) + ocy * Math.cos(rad))
  return {
    x: wcx - nb.width / 2,
    y: wcy - nb.height / 2,
    width: nb.width,
    height: nb.height,
    rotation: st.rotation,
  }
}
