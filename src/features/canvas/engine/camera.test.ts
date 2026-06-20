import {
  type Camera,
  screenToWorld,
  worldToScreen,
  viewportBounds,
  clampZoom,
  zoomToward,
  fitCamera,
  MIN_ZOOM,
  MAX_ZOOM,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from './camera'

const cam: Camera = { panX: 100, panY: 50, zoom: 2 }

describe('screenToWorld / worldToScreen', () => {
  it('are inverses of each other', () => {
    const w = screenToWorld(cam, 640, 480)
    const s = worldToScreen(cam, w.x, w.y)
    expect(s.x).toBeCloseTo(640)
    expect(s.y).toBeCloseTo(480)
  })

  it('worldToScreen applies world*zoom + pan', () => {
    expect(worldToScreen(cam, 10, 20)).toEqual({ x: 10 * 2 + 100, y: 20 * 2 + 50 })
  })

  it('screenToWorld inverts the stage transform', () => {
    expect(screenToWorld(cam, 120, 90)).toEqual({ x: (120 - 100) / 2, y: (90 - 50) / 2 })
  })
})

describe('viewportBounds', () => {
  it('returns the visible world rect for a container size', () => {
    const b = viewportBounds(cam, 800, 600)
    expect(b.minX).toBeCloseTo((0 - 100) / 2)
    expect(b.minY).toBeCloseTo((0 - 50) / 2)
    expect(b.maxX).toBeCloseTo((800 - 100) / 2)
    expect(b.maxY).toBeCloseTo((600 - 50) / 2)
  })
})

describe('clampZoom', () => {
  it('clamps below and above the allowed range', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
    expect(clampZoom(99)).toBe(MAX_ZOOM)
    expect(clampZoom(1.5)).toBe(1.5)
  })
})

describe('zoomToward', () => {
  it('keeps the anchor point stationary on screen', () => {
    const anchorX = 300
    const anchorY = 200
    const before = screenToWorld(cam, anchorX, anchorY)
    const next = zoomToward(cam, 3, anchorX, anchorY)
    const after = screenToWorld(next, anchorX, anchorY)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps the resulting zoom', () => {
    expect(zoomToward(cam, 999, 0, 0).zoom).toBe(MAX_ZOOM)
  })
})

describe('fitCamera', () => {
  it('never scales above 1:1 and centres the canvas', () => {
    const c = fitCamera(CANVAS_WIDTH * 2, CANVAS_HEIGHT * 2)
    expect(c.zoom).toBe(1)
    expect(c.panX).toBeCloseTo((CANVAS_WIDTH * 2 - CANVAS_WIDTH) / 2)
    expect(c.panY).toBeCloseTo((CANVAS_HEIGHT * 2 - CANVAS_HEIGHT) / 2)
  })

  it('scales down to fit a small container', () => {
    const c = fitCamera(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)
    expect(c.zoom).toBeCloseTo(0.5)
  })
})
