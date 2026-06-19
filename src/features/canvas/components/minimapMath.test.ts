import {
  getWorldW,
  getWorldH,
  minimapToCanvas,
  MM_W,
  MM_H,
  WHITE_W,
  WHITE_H,
  MIN_ZOOM,
} from './minimapMath'

describe('getWorldW', () => {
  it('keeps the viewport within the white zone at min zoom (both axes)', () => {
    const stW = 1600,
      stH = 900
    const worldW = getWorldW(stW, stH)
    const worldH = getWorldH(worldW)
    // Blue indicator size in minimap px at MIN_ZOOM must be <= the white zone.
    const blueW = ((stW / MIN_ZOOM) / worldW) * MM_W
    const blueH = ((stH / MIN_ZOOM) / worldH) * MM_H
    expect(blueW).toBeLessThanOrEqual(WHITE_W)
    expect(blueH).toBeLessThanOrEqual(WHITE_H)
  })

  it('grows with stage size', () => {
    expect(getWorldW(3200, 1800)).toBeGreaterThan(getWorldW(1600, 900))
  })
})

describe('getWorldH', () => {
  it('preserves the minimap aspect ratio', () => {
    expect(getWorldH(MM_W)).toBeCloseTo(MM_H, 6)
    expect(getWorldH(360)).toBeCloseTo((360 * MM_H) / MM_W, 6)
  })
})

describe('minimapToCanvas', () => {
  it('maps the minimap corners to the world window corners', () => {
    const mmLeft = 100,
      mmTop = 50,
      worldW = 2000,
      worldH = worldW * (MM_H / MM_W)
    expect(minimapToCanvas(0, 0, mmLeft, mmTop, worldW, worldH)).toEqual({
      cx: 100,
      cy: 50,
    })
    expect(minimapToCanvas(MM_W, MM_H, mmLeft, mmTop, worldW, worldH)).toEqual({
      cx: mmLeft + worldW,
      cy: mmTop + worldH,
    })
  })

  it('maps the minimap centre to the world-window centre', () => {
    const r = minimapToCanvas(MM_W / 2, MM_H / 2, 0, 0, 1800, 1000)
    expect(r.cx).toBeCloseTo(900, 6)
    expect(r.cy).toBeCloseTo(500, 6)
  })
})
