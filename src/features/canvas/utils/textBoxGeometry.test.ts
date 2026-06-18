import {
  handleAnchor,
  textAABB,
  aabbOverlap,
  computeResize,
  resizeFromPointer,
  type RotBox,
} from './textBoxGeometry'
import { MIN_TEXT_WIDTH, MIN_TEXT_HEIGHT } from './strokeSerializer'

describe('textAABB', () => {
  it('returns the box itself when unrotated', () => {
    expect(textAABB({ x: 10, y: 20, width: 200, height: 80 })).toEqual({
      minX: 10,
      minY: 20,
      maxX: 210,
      maxY: 100,
    })
  })

  it('expands the bounds for a rotated box and keeps the centre fixed', () => {
    const d = { x: 0, y: 0, width: 200, height: 100, rotation: 45 }
    const aabb = textAABB(d)
    // 45deg rotation of a 200x100 box: half-extent = (200+100)/2 / sqrt(2)*... ->
    // diagonal half-width = (w+h)/2 * cos45 = 150 * 0.7071 ~= 106.066
    const cx = 100,
      cy = 50
    expect((aabb.minX + aabb.maxX) / 2).toBeCloseTo(cx, 5)
    expect((aabb.minY + aabb.maxY) / 2).toBeCloseTo(cy, 5)
    expect(aabb.maxX - aabb.minX).toBeCloseTo(212.132, 2)
    expect(aabb.maxY - aabb.minY).toBeCloseTo(212.132, 2)
  })

  it('falls back to minimum dimensions for legacy strokes', () => {
    const aabb = textAABB({ x: 5, y: 5 })
    expect(aabb.maxX - aabb.minX).toBe(MIN_TEXT_WIDTH)
    expect(aabb.maxY - aabb.minY).toBe(MIN_TEXT_HEIGHT)
  })
})

describe('aabbOverlap', () => {
  const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
  it('detects overlap', () => {
    expect(aabbOverlap(a, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(true)
  })
  it('detects touching edges as overlap', () => {
    expect(aabbOverlap(a, { minX: 10, minY: 0, maxX: 20, maxY: 10 })).toBe(true)
  })
  it('detects separation', () => {
    expect(aabbOverlap(a, { minX: 11, minY: 0, maxX: 20, maxY: 10 })).toBe(false)
  })
})

describe('handleAnchor', () => {
  const b = { x: 0, y: 0, width: 100, height: 60 }
  it('places corner and edge anchors', () => {
    expect(handleAnchor('nw', b)).toEqual({ x: 0, y: 0 })
    expect(handleAnchor('se', b)).toEqual({ x: 100, y: 60 })
    expect(handleAnchor('n', b)).toEqual({ x: 50, y: 0 })
    expect(handleAnchor('e', b)).toEqual({ x: 100, y: 30 })
  })
})

describe('computeResize', () => {
  const b = { x: 0, y: 0, width: 400, height: 300 }
  it('moves the dragged edge and anchors the opposite edge', () => {
    const r = computeResize('e', 250, 0, b)
    expect(r).toEqual({ x: 0, y: 0, width: 250, height: 300 })
  })
  it('clamps width to the minimum', () => {
    const r = computeResize('e', 10, 0, b)
    expect(r.width).toBe(MIN_TEXT_WIDTH)
  })
  it('clamps height to the minimum when dragging north past the floor', () => {
    const r = computeResize('n', 0, 9999, b)
    expect(r.height).toBe(MIN_TEXT_HEIGHT)
  })
})

describe('resizeFromPointer', () => {
  it('is the identity when the pointer sits on the unrotated handle', () => {
    const st: RotBox = { x: 0, y: 0, width: 400, height: 300, rotation: 0 }
    const r = resizeFromPointer('se', st, { x: 400, y: 300 })
    expect(r.x).toBeCloseTo(0, 6)
    expect(r.y).toBeCloseTo(0, 6)
    expect(r.width).toBeCloseTo(400, 6)
    expect(r.height).toBeCloseTo(300, 6)
    expect(r.rotation).toBe(0)
  })

  it('round-trips a rotated handle drag back through the world frame', () => {
    const st: RotBox = { x: 100, y: 100, width: 400, height: 300, rotation: 30 }
    // The SE corner in world space for a 30deg-rotated box, computed the same way
    // textAABB rotates corners. Dragging to exactly that point should be a no-op.
    const cx = st.x + st.width / 2,
      cy = st.y + st.height / 2
    const rad = (st.rotation * Math.PI) / 180
    const lx = st.width / 2,
      ly = st.height / 2
    const wp = {
      x: cx + (lx * Math.cos(rad) - ly * Math.sin(rad)),
      y: cy + (lx * Math.sin(rad) + ly * Math.cos(rad)),
    }
    const r = resizeFromPointer('se', st, wp)
    expect(r.x).toBeCloseTo(st.x, 4)
    expect(r.y).toBeCloseTo(st.y, 4)
    expect(r.width).toBeCloseTo(st.width, 4)
    expect(r.height).toBeCloseTo(st.height, 4)
    expect(r.rotation).toBe(30)
  })
})
