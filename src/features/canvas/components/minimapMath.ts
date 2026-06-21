// Pure geometry + constants for the Minimap. Separated from the component so the
// world-sizing constraint and the minimap-pixel <-> canvas-coordinate conversions can be
// unit-tested without a canvas/Konva stage.

export const MM_W = 180
export const MM_H = 101
export const GRAY_PX = 15
export const WHITE_W = MM_W - GRAY_PX * 2 // 150
export const WHITE_H = MM_H - GRAY_PX * 2 // 71
export const MIN_ZOOM = 0.25
export const CANVAS_W = 1920
export const CANVAS_H = 1080

// Strokes cache covers canvas ± half-canvas on each side
export const CACHE_X = -CANVAS_W / 2 // -960
export const CACHE_Y = -CANVAS_H / 2 // -540
export const CACHE_W = CANVAS_W * 2 //  3840
export const CACHE_H = CANVAS_H * 2 //  2160
const CACHE_PX = 360
export const CACHE_SCALE = CACHE_PX / CACHE_W

// World size: choose the larger axis constraint so blue fits within the white
// zone (in both dimensions) even at MIN_ZOOM, regardless of screen aspect ratio.
// vpMMW = (stW/MIN_ZOOM) / worldW * MM_W ≤ WHITE_W  →  worldW ≥ stW * MM_W / (MIN_ZOOM * WHITE_W)
// vpMMH = (stH/MIN_ZOOM) / worldH * MM_H ≤ WHITE_H  →  worldW ≥ stH * MM_W / (MIN_ZOOM * WHITE_H)
// The 1.05 margin means blue is 5% smaller than white at MIN_ZOOM (strictly less).
export function getWorldW(stW: number, stH: number): number {
  return (
    Math.max(
      (stW * MM_W) / (MIN_ZOOM * WHITE_W),
      (stH * MM_W) / (MIN_ZOOM * WHITE_H),
    ) * 1.05
  )
}

// Minimap world height keeps the minimap's pixel aspect ratio.
export function getWorldH(worldW: number): number {
  return (worldW * MM_H) / MM_W
}

// Translate a minimap-pixel position to canvas coords, given the current world window.
export function minimapToCanvas(
  mx: number,
  my: number,
  mmLeft: number,
  mmTop: number,
  worldW: number,
  worldH: number,
): { cx: number; cy: number } {
  return {
    cx: mmLeft + (mx / MM_W) * worldW,
    cy: mmTop + (my / MM_H) * worldH,
  }
}
