import {
  type Camera,
  screenToWorld,
  worldToScreen,
  viewportBounds,
  clampZoom,
  zoomToward,
  fitCamera,
  fitFixedFrame,
  fitZoom,
  clampPan,
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

describe('fitFixedFrame', () => {
  // The Day Doodle frame: a 120×90 world enlarged to fill a bigger modal container.
  it('upscales a small frame past 1:1 (unlike fitCamera)', () => {
    const c = fitFixedFrame(480, 360, 120, 90)
    expect(c.zoom).toBeCloseTo(4)
  })

  it('contains the frame on the limiting axis and centres the slack', () => {
    // 120×90 (4:3) into a square 360×360: width is the limit → zoom 3, vertical slack centred.
    const c = fitFixedFrame(360, 360, 120, 90)
    expect(c.zoom).toBeCloseTo(3)
    expect(c.panX).toBeCloseTo((360 - 120 * 3) / 2)
    expect(c.panY).toBeCloseTo((360 - 90 * 3) / 2)
  })

  it('maps the frame fully inside the container (no overflow)', () => {
    const c = fitFixedFrame(400, 300, 120, 90)
    const br = worldToScreen(c, 120, 90)
    const tl = worldToScreen(c, 0, 0)
    expect(tl.x).toBeGreaterThanOrEqual(-0.001)
    expect(tl.y).toBeGreaterThanOrEqual(-0.001)
    expect(br.x).toBeLessThanOrEqual(400.001)
    expect(br.y).toBeLessThanOrEqual(300.001)
  })
})

describe('fitZoom', () => {
  it('returns the limiting-axis ratio (no 1:1 ceiling)', () => {
    expect(fitZoom(480, 360, 120, 90)).toBeCloseTo(4) // both axes 4 → 4
    expect(fitZoom(360, 360, 120, 90)).toBeCloseTo(3) // width limits (3 vs 4) → 3
  })
})

describe('clampPan', () => {
  // A portrait sheet (200×400) bounded into a 200×300 viewport at fit zoom.
  const fw = 200
  const fh = 400
  const w = 200
  const h = 300
  const fz = fitZoom(w, h, fw, fh) // 0.75 (height limits)

  it('centres the frame on an axis where it is smaller than the viewport', () => {
    // At fit zoom width = 200*0.75 = 150 < 200 → centred horizontally; height = 300 = viewport.
    const c = clampPan({ panX: 999, panY: -999, zoom: fz }, w, h, fw, fh)
    expect(c.panX).toBeCloseTo((w - fw * fz) / 2)
    expect(c.panY).toBeCloseTo(0) // height fills exactly → only valid pan is 0
  })

  it('clamps pan so a zoomed-in frame never reveals empty space past its edges', () => {
    const zoom = 2 // sheet now 400×800, both larger than the 200×300 viewport
    // Panning hard positive (toward revealing the top-left gap) is clamped to 0.
    const tooFarTL = clampPan({ panX: 50, panY: 80, zoom }, w, h, fw, fh)
    expect(tooFarTL.panX).toBeCloseTo(0)
    expect(tooFarTL.panY).toBeCloseTo(0)
    // Panning hard negative is clamped so the bottom-right edge stops at the viewport border.
    const tooFarBR = clampPan({ panX: -9999, panY: -9999, zoom }, w, h, fw, fh)
    expect(tooFarBR.panX).toBeCloseTo(w - fw * zoom) // -200
    expect(tooFarBR.panY).toBeCloseTo(h - fh * zoom) // -500
  })

  it('leaves an in-range pan untouched', () => {
    const zoom = 2
    const c = clampPan({ panX: -100, panY: -200, zoom }, w, h, fw, fh)
    expect(c.panX).toBeCloseTo(-100)
    expect(c.panY).toBeCloseTo(-200)
  })
})
