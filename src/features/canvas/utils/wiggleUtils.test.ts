import {
  FRAME_MS,
  FRAMES,
  jitterMag,
  frameIndex,
  jitterPoints,
  buildVariants,
  rectToPerimeter,
  ellipseToPerimeter,
} from './wiggleUtils'

describe('jitterMag', () => {
  it('floors at 1.5px so thin strokes still boil', () => {
    expect(jitterMag(0)).toBe(1.5)
    expect(jitterMag(3)).toBe(1.5)
  })

  it('scales gently with stroke width for fat strokes', () => {
    expect(jitterMag(100)).toBeCloseTo(12)
  })
})

describe('frameIndex', () => {
  it('advances one step per FRAME_MS and wraps after FRAMES', () => {
    expect(frameIndex(0)).toBe(0)
    expect(frameIndex(FRAME_MS)).toBe(1)
    expect(frameIndex(FRAME_MS * 2)).toBe(2)
    expect(frameIndex(FRAME_MS * FRAMES)).toBe(0)
  })
})

describe('jitterPoints', () => {
  const base = [0, 0, 10, 10, 20, 0]

  it('is deterministic for a given (points, frame)', () => {
    expect(jitterPoints(base, 1, 6, 42)).toEqual(jitterPoints(base, 1, 6, 42))
  })

  it('keeps every vertex within the jitter amplitude of its origin', () => {
    const mag = jitterMag(6)
    const out = jitterPoints(base, 2, 6, 7)
    for (let i = 0; i < base.length; i++) {
      expect(Math.abs(out[i] - base[i])).toBeLessThanOrEqual(mag)
    }
  })

  it('produces a different shape on different frames', () => {
    expect(jitterPoints(base, 0, 6, 7)).not.toEqual(jitterPoints(base, 1, 6, 7))
  })

  it('returns a copy, leaving the input untouched', () => {
    const input = [...base]
    jitterPoints(input, 1, 6)
    expect(input).toEqual(base)
  })
})

describe('buildVariants', () => {
  const base = [0, 0, 5, 5]

  it('returns one variant per frame, each matching jitterPoints', () => {
    const variants = buildVariants(base, 6, 9)
    expect(variants).toHaveLength(FRAMES)
    for (let f = 0; f < FRAMES; f++) {
      expect(variants[f]).toEqual(jitterPoints(base, f, 6, 9))
      expect(variants[f]).toHaveLength(base.length)
    }
  })
})

describe('rectToPerimeter', () => {
  it('traces a closed outline starting at the top-left corner', () => {
    const pts = rectToPerimeter(10, 20, 100, 40, 22)
    expect(pts.length % 2).toBe(0)
    expect(pts.length).toBeGreaterThanOrEqual(8) // at least the four corners
    expect(pts[0]).toBe(10)
    expect(pts[1]).toBe(20)
  })

  it('keeps every sampled point on the rectangle bounding box', () => {
    const pts = rectToPerimeter(0, 0, 50, 30, 22)
    for (let i = 0; i < pts.length; i += 2) {
      expect(pts[i]).toBeGreaterThanOrEqual(0)
      expect(pts[i]).toBeLessThanOrEqual(50)
      expect(pts[i + 1]).toBeGreaterThanOrEqual(0)
      expect(pts[i + 1]).toBeLessThanOrEqual(30)
    }
  })
})

describe('ellipseToPerimeter', () => {
  it('samples at least 12 points around the ellipse', () => {
    const pts = ellipseToPerimeter(0, 0, 30, 20)
    expect(pts.length % 2).toBe(0)
    expect(pts.length / 2).toBeGreaterThanOrEqual(12)
  })

  it('starts at the rightmost point (angle 0)', () => {
    const pts = ellipseToPerimeter(5, 5, 10, 4)
    expect(pts[0]).toBeCloseTo(15)
    expect(pts[1]).toBeCloseTo(5)
  })
})
