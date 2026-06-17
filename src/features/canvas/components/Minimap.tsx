import { useRef, useEffect, useCallback } from 'react'
import type Konva from 'konva'
import type { Stroke } from '../../../lib/types'
import type { NavHandle } from './DrawingStage'

const MM_W     = 180
const MM_H     = 101
const GRAY_PX  = 15
const WHITE_W  = MM_W - GRAY_PX * 2   // 150
const WHITE_H  = MM_H - GRAY_PX * 2   // 71
const MIN_ZOOM = 0.25
const CANVAS_W = 1920
const CANVAS_H = 1080

// Strokes cache covers canvas ± half-canvas on each side
const CACHE_X     = -CANVAS_W / 2    // -960
const CACHE_Y     = -CANVAS_H / 2    // -540
const CACHE_W     = CANVAS_W * 2     //  3840
const CACHE_H     = CANVAS_H * 2     //  2160
const CACHE_PX    = 360
const CACHE_SCALE = CACHE_PX / CACHE_W

// World size: choose the larger axis constraint so blue fits within the white
// zone (in both dimensions) even at MIN_ZOOM, regardless of screen aspect ratio.
// vpMMW = (stW/MIN_ZOOM) / worldW * MM_W ≤ WHITE_W  →  worldW ≥ stW * MM_W / (MIN_ZOOM * WHITE_W)
// vpMMH = (stH/MIN_ZOOM) / worldH * MM_H ≤ WHITE_H  →  worldW ≥ stH * MM_W / (MIN_ZOOM * WHITE_H)
// The 1.05 margin means blue is 5% smaller than white at MIN_ZOOM (strictly less).
function getWorldW(stW: number, stH: number): number {
  return Math.max(
    stW * MM_W / (MIN_ZOOM * WHITE_W),
    stH * MM_W / (MIN_ZOOM * WHITE_H),
  ) * 1.05
}

export interface MinimapHandle {
  resetCenter: () => void
}

interface Props {
  navHandle:      React.MutableRefObject<NavHandle | null>
  stageRef:       React.RefObject<Konva.Stage>
  viewport:       { zoom: number; pan: { x: number; y: number } }
  strokes:        Stroke[]
  minimapHandle?: React.MutableRefObject<MinimapHandle | null>
}

export function Minimap({ navHandle, stageRef, viewport, strokes, minimapHandle }: Props) {
  const bgRef       = useRef<HTMLCanvasElement>(null)
  const blueRef     = useRef<HTMLDivElement>(null)
  const cacheRef    = useRef<HTMLCanvasElement | null>(null)
  const wrapRef     = useRef<HTMLDivElement>(null)
  const dragging    = useRef(false)
  // Minimap center in canvas coords — follows viewport with a dead zone
  const mmCenterRef   = useRef({ x: CANVAS_W / 2, y: CANVAS_H / 2 })
  const rafRef        = useRef(0)
  const cacheErrorRef = useRef(false)

  // Render strokes to a low-res off-screen canvas (expensive — only on stroke change)
  const buildCache = useCallback(() => {
    const stage = stageRef.current
    const layer = navHandle.current?.getLayer()
    if (!stage || !layer) return

    const savedX = stage.x(), savedY = stage.y(), savedS = stage.scaleX()
    stage.x(0); stage.y(0); stage.scaleX(1); stage.scaleY(1)
    try {
      cacheRef.current = layer.toCanvas({
        x: CACHE_X, y: CACHE_Y,
        width:  CACHE_W,
        height: CACHE_H,
        pixelRatio: CACHE_SCALE,
      }) as HTMLCanvasElement
      cacheErrorRef.current = false
    } catch { cacheRef.current = null; cacheErrorRef.current = true }
    stage.x(savedX); stage.y(savedY); stage.scaleX(savedS); stage.scaleY(savedS)
  }, [navHandle, stageRef])

  // Fast composite: gray border → white zone → clipped stroke blit.
  // Takes live mmLeft/mmTop/worldW/worldH so it works both from the strokes
  // rebuild path and the viewport-change path.
  const renderBg = useCallback((
    mmLeft: number, mmTop: number, worldW: number, worldH: number,
  ) => {
    const ctx = bgRef.current?.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, MM_W, MM_H)

    // Gray border fills the whole minimap
    ctx.fillStyle = '#ddd0bd'   // --m-line-2
    ctx.fillRect(0, 0, MM_W, MM_H)

    // White comfortable zone
    ctx.fillStyle = '#faf5ee'   // --m-bg
    ctx.fillRect(GRAY_PX, GRAY_PX, WHITE_W, WHITE_H)

    // Blit strokes from cache, clipped to white zone so gray stays clean
    const cache = cacheRef.current
    if (cache) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(GRAY_PX, GRAY_PX, WHITE_W, WHITE_H)
      ctx.clip()

      const iL = Math.max(mmLeft, CACHE_X)
      const iT = Math.max(mmTop,  CACHE_Y)
      const iR = Math.min(mmLeft + worldW, CACHE_X + CACHE_W)
      const iB = Math.min(mmTop  + worldH, CACHE_Y + CACHE_H)

      if (iR > iL && iB > iT) {
        const dx   = (iL - mmLeft) / worldW * MM_W
        const dy   = (iT - mmTop)  / worldH * MM_H
        const dw   = (iR - iL)     / worldW * MM_W
        const dh   = (iB - iT)     / worldH * MM_H
        const srcX = (iL - CACHE_X) * CACHE_SCALE
        const srcY = (iT - CACHE_Y) * CACHE_SCALE
        const srcW = (iR - iL)      * CACHE_SCALE
        const srcH = (iB - iT)      * CACHE_SCALE
        ctx.drawImage(cache, srcX, srcY, srcW, srcH, dx, dy, dw, dh)
      }

      ctx.restore()
    }
  }, [])

  // Full update on each viewport change:
  //   1. Compute viewport in canvas coords from live stage state
  //   2. Run dead zone clamping to update mmCenter
  //   3. Composite background
  //   4. Imperatively position the blue indicator div
  const update = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return

    const stW = stage.width()
    const stH = stage.height()
    if (!stW || !stH) return

    const z  = stage.scaleX()
    const px = stage.x()
    const py = stage.y()

    // Viewport center + size in canvas coords
    const vpCx = -px / z + stW / 2
    const vpCy = -py / z + stH / 2
    const vpW  = stW / z
    const vpH  = stH / z

    // Dynamic world size (see getWorldW comment)
    const worldW = getWorldW(stW, stH)
    const worldH = worldW * MM_H / MM_W

    // Current minimap world bounds
    let mmLeft = mmCenterRef.current.x - worldW / 2
    let mmTop  = mmCenterRef.current.y - worldH / 2

    // Blue edges in minimap pixels under current mmCenter
    const blueL0 = (vpCx - vpW / 2 - mmLeft) / worldW * MM_W
    const blueR0 = (vpCx + vpW / 2 - mmLeft) / worldW * MM_W
    const blueT0 = (vpCy - vpH / 2 - mmTop)  / worldH * MM_H
    const blueB0 = (vpCy + vpH / 2 - mmTop)  / worldH * MM_H

    // Dead zone: compute target mmCenter so blue stays within the white zone
    if (blueL0 < GRAY_PX)        mmLeft = vpCx - vpW / 2 - GRAY_PX * worldW / MM_W
    if (blueR0 > MM_W - GRAY_PX) mmLeft = vpCx + vpW / 2 - (MM_W - GRAY_PX) * worldW / MM_W
    if (blueT0 < GRAY_PX)        mmTop  = vpCy - vpH / 2 - GRAY_PX * worldH / MM_H
    if (blueB0 > MM_H - GRAY_PX) mmTop  = vpCy + vpH / 2 - (MM_H - GRAY_PX) * worldH / MM_H

    // Lerp toward target at 1/4 speed; keep scheduling rAF frames until converged
    const targetCx = mmLeft + worldW / 2
    const targetCy = mmTop  + worldH / 2
    const dx = targetCx - mmCenterRef.current.x
    const dy = targetCy - mmCenterRef.current.y
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      mmCenterRef.current = { x: targetCx, y: targetCy }
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    } else {
      mmCenterRef.current = { x: mmCenterRef.current.x + dx * 0.25, y: mmCenterRef.current.y + dy * 0.25 }
      if (!rafRef.current) rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; update() })
    }
    mmLeft = mmCenterRef.current.x - worldW / 2
    mmTop  = mmCenterRef.current.y - worldH / 2

    // Composite background at new mmCenter
    renderBg(mmLeft, mmTop, worldW, worldH)

    // Imperatively update blue indicator position (avoids a React re-render per frame)
    const blueL = (vpCx - vpW / 2 - mmLeft) / worldW * MM_W
    const blueT = (vpCy - vpH / 2 - mmTop)  / worldH * MM_H
    const blueW = vpW / worldW * MM_W
    const blueH = vpH / worldH * MM_H

    const el = blueRef.current
    if (el) {
      el.style.left    = blueL + 'px'
      el.style.top     = blueT + 'px'
      el.style.width   = blueW + 'px'
      el.style.height  = blueH + 'px'
      el.style.display = blueW > 0 && blueH > 0 ? 'block' : 'none'
    }
  }, [stageRef, renderBg])

  // Expose resetCenter so ZoomControls can reset the minimap pan on Reset
  useEffect(() => {
    if (!minimapHandle) return
    minimapHandle.current = {
      resetCenter: () => {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
        mmCenterRef.current = { x: CANVAS_W / 2, y: CANVAS_H / 2 }
        update()
      },
    }
    return () => { minimapHandle.current = null }
  }, [minimapHandle, update])

  // Cancel any running lerp loop on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // Strokes changed: rebuild cache then full update (always retry even after prior failure)
  useEffect(() => { buildCache(); update() }, [strokes, buildCache, update])

  // Viewport changed: update; rebuild cache only if not built and no prior failure
  useEffect(() => { if (!cacheRef.current && !cacheErrorRef.current) buildCache(); update() }, [viewport, buildCache, update])

  // Click / drag: translate minimap px → canvas coord → center viewport there
  const goTo = useCallback((clientX: number, clientY: number) => {
    const rect  = wrapRef.current?.getBoundingClientRect()
    const stage = stageRef.current
    const nav   = navHandle.current
    if (!rect || !stage || !nav) return

    const stW = stage.width()
    const stH = stage.height()
    const z   = stage.scaleX()

    const worldW = getWorldW(stW, stH)
    const worldH = worldW * MM_H / MM_W
    const mmLeft = mmCenterRef.current.x - worldW / 2
    const mmTop  = mmCenterRef.current.y - worldH / 2

    const mx = Math.max(0, Math.min(MM_W, clientX - rect.left))
    const my = Math.max(0, Math.min(MM_H, clientY - rect.top))
    const cx = mmLeft + mx / MM_W * worldW
    const cy = mmTop  + my / MM_H * worldH

    nav.applyViewport(z, {
      x: stW / 2 - cx * z,
      y: stH / 2 - cy * z,
    })
  }, [navHandle, stageRef])

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'absolute', bottom: 20, right: 20,
        width: MM_W, height: MM_H,
        borderRadius: 'var(--m-r-sm)', overflow: 'hidden',
        border: '1.5px solid var(--m-line)',
        boxShadow: 'var(--m-shadow)',
        cursor: 'crosshair',
        zIndex: 10,
      }}
      onMouseDown={e => { dragging.current = true;  goTo(e.clientX, e.clientY) }}
      onMouseMove={e => { if (dragging.current) goTo(e.clientX, e.clientY) }}
      onMouseUp={()    => { dragging.current = false }}
      onMouseLeave={() => { dragging.current = false }}
    >
      <canvas ref={bgRef} width={MM_W} height={MM_H} style={{ display: 'block' }} />
      <div
        ref={blueRef}
        style={{
          position:      'absolute',
          display:       'none',
          border:        '1.5px solid var(--m-primary)',
          background:    'color-mix(in oklab, var(--m-primary) 10%, transparent)',
          pointerEvents: 'none',
          boxSizing:     'border-box',
        }}
      />
    </div>
  )
}
