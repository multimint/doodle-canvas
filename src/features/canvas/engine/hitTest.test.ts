import {
  distToPolyline,
  pointInRotatedRect,
  strokeHit,
  strokeAt,
} from './hitTest'
import type { Stroke } from '../../../lib/types'

describe('distToPolyline', () => {
  const line = [0, 0, 100, 0]
  it('is zero on the line', () => {
    expect(distToPolyline(line, 50, 0)).toBeCloseTo(0)
  })
  it('measures perpendicular distance off the line', () => {
    expect(distToPolyline(line, 50, 7)).toBeCloseTo(7)
  })
  it('clamps to the nearest endpoint past the ends', () => {
    expect(distToPolyline(line, -3, 4)).toBeCloseTo(5) // 3-4-5
  })
})

describe('pointInRotatedRect', () => {
  it('detects a point inside an unrotated box', () => {
    expect(pointInRotatedRect(5, 5, 0, 0, 10, 10, 0)).toBe(true)
    expect(pointInRotatedRect(15, 5, 0, 0, 10, 10, 0)).toBe(false)
  })
  it('respects rotation about the box centre', () => {
    // A 90° rotation of a 40×10 box about its centre (20,5): a point at the rotated long axis.
    expect(pointInRotatedRect(20, 19, 0, 0, 40, 10, 90)).toBe(true)
    expect(pointInRotatedRect(39, 5, 0, 0, 40, 10, 90)).toBe(false)
  })
})

function stroke(over: Partial<Stroke>): Stroke {
  return {
    id: 'x',
    type: 'path',
    authorId: 'a',
    timestamp: 0,
    data: {},
    ...over,
  } as Stroke
}

describe('strokeHit', () => {
  it('hits a pen stroke within its half-width + tolerance', () => {
    const s = stroke({
      type: 'path',
      data: { points: [0, 0, 100, 0], strokeWidth: 6 },
    })
    expect(strokeHit(s, 50, 3)).toBe(true)
    expect(strokeHit(s, 50, 40)).toBe(false)
  })

  it('hits a text box anywhere inside its rotated frame', () => {
    const s = stroke({
      type: 'text',
      data: { x: 0, y: 0, width: 200, height: 80, text: 'hi' },
    })
    expect(strokeHit(s, 100, 40)).toBe(true)
    expect(strokeHit(s, 400, 40)).toBe(false)
  })

  it('hits a sticker inside its normalized square', () => {
    const s = stroke({
      type: 'sticker',
      data: { x: 0, y: 0, width: 120, height: 120, stickerId: 'star' },
    })
    expect(strokeHit(s, 60, 60)).toBe(true)
    expect(strokeHit(s, 200, 60)).toBe(false)
  })
})

describe('strokeAt', () => {
  const a = stroke({ id: 'a', type: 'path', data: { points: [0, 0, 100, 0], strokeWidth: 6 } })
  const b = stroke({ id: 'b', type: 'path', data: { points: [0, 0, 100, 0], strokeWidth: 6 } })

  it('returns the top-most matching stroke', () => {
    expect(strokeAt([a, b], 50, 0)?.id).toBe('b')
  })

  it('respects a filter', () => {
    expect(strokeAt([a, b], 50, 0, (s) => s.id === 'a')?.id).toBe('a')
  })

  it('returns null when nothing is hit', () => {
    expect(strokeAt([a, b], 50, 99)).toBeNull()
  })
})
