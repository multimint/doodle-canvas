// The camera maps between world space (where strokes live) and screen space (CSS pixels
// inside the canvas container). It mirrors the transform the old Konva stage applied —
// scaleX/Y = zoom, x/y = pan — so screen = world * zoom + pan. Keeping it as pure
// functions (no DOM, no React) makes every coordinate conversion unit-testable and lets
// the immediate-mode renderer, hit-testing, and DOM overlays all share one source of truth.

export interface Camera {
  panX: number
  panY: number
  zoom: number
}

// World-space axis-aligned bounding box of what's currently visible. Used to cull
// off-screen strokes from the per-frame draw (the perf win over Konva, which drew every
// node regardless of viewport).
export interface ViewportBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

// Zoom limits + initial canvas extent, carried over verbatim from the old useViewport so
// fit-to-container and zoom clamping behave identically.
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 3
export const CANVAS_WIDTH = 1920
export const CANVAS_HEIGHT = 1080

// Screen (container CSS px) → world. The inverse of the stage transform; equivalent to
// Konva's getRelativePointerPosition().
export function screenToWorld(
  cam: Camera,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return { x: (sx - cam.panX) / cam.zoom, y: (sy - cam.panY) / cam.zoom }
}

// World → screen (container CSS px). The transform DOM overlays use to track world points
// (same `x * zoom + pan` the old code wrote inline for cursors/handles).
export function worldToScreen(
  cam: Camera,
  wx: number,
  wy: number,
): { x: number; y: number } {
  return { x: wx * cam.zoom + cam.panX, y: wy * cam.zoom + cam.panY }
}

// The visible world rectangle for a container of size (w, h) in CSS px.
export function viewportBounds(
  cam: Camera,
  w: number,
  h: number,
): ViewportBounds {
  const tl = screenToWorld(cam, 0, 0)
  const br = screenToWorld(cam, w, h)
  return { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y }
}

// Clamp a raw zoom into the allowed range. Kept separate so both wheel (snap to 0.1) and
// pinch (continuous) can reuse the bound without duplicating the constants.
export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
}

// Zoom toward an anchor point (in screen px) keeping that point stationary on screen.
// Powers wheel zoom and pinch; the anchor is the pointer / pinch midpoint.
export function zoomToward(
  cam: Camera,
  newZoom: number,
  anchorX: number,
  anchorY: number,
): Camera {
  const z = clampZoom(newZoom)
  const ratio = z / cam.zoom
  return {
    zoom: z,
    panX: anchorX - (anchorX - cam.panX) * ratio,
    panY: anchorY - (anchorY - cam.panY) * ratio,
  }
}

// Initial fit: scale the fixed canvas extent to fit the container (never up past 1:1) and
// centre it. Returns the starting camera. Mirrors useViewport's first-resize behaviour.
export function fitCamera(w: number, h: number): Camera {
  const zoom = Math.min(1, w / CANVAS_WIDTH, h / CANVAS_HEIGHT)
  return {
    zoom,
    panX: (w - CANVAS_WIDTH * zoom) / 2,
    panY: (h - CANVAS_HEIGHT * zoom) / 2,
  }
}

// Fit a small fixed world frame (fw×fh, e.g. a 120×90 Day Doodle) into the container, centred.
// Unlike fitCamera this *upscales* (no 1:1 ceiling) so a tiny frame fills a much larger modal,
// and it is re-applied on every resize so a locked view always shows the whole frame and nothing
// outside it.
export function fitFixedFrame(w: number, h: number, fw: number, fh: number): Camera {
  const zoom = Math.min(w / fw, h / fh)
  return {
    zoom,
    panX: (w - fw * zoom) / 2,
    panY: (h - fh * zoom) / 2,
  }
}
