import { useRef, useEffect, useCallback } from 'react'
import type { Stroke } from '../../../lib/types'
import type { NavHandle } from '../hooks/useCamera'
import { drawCommitted } from '../engine/scene'
import {
  MM_W, MM_H, GRAY_PX, WHITE_W, WHITE_H, CANVAS_W, CANVAS_H,
  CACHE_X, CACHE_Y, CACHE_W, CACHE_H, CACHE_SCALE,
  getWorldW, getWorldH, minimapToCanvas,
} from './minimapMath'

export interface MinimapHandle {
  resetCenter: () => void
}

interface Props {
  navHandle:      React.MutableRefObject<NavHandle | null>
  viewport:       { zoom: number; pan: { x: number; y: number } }
  strokes:        Stroke[]
  minimapHandle?: React.MutableRefObject<MinimapHandle | null>
}

// Bottom-right minimap. Same dead-zone/lerp follow + click-to-pan as before, but it rasterizes
// strokes itself via the immediate-mode engine (drawCommitted) onto a low-res offscreen canvas
// — replacing Konva's layer.toCanvas() — and reads viewport/size from the camera NavHandle.
export function Minimap({ navHandle, viewport, strokes, minimapHandle }: Props) {
  const bgRef       = useRef<HTMLCanvasElement>(null)
  const blueRef     = useRef<HTMLDivElement>(null)
  const cacheRef    = useRef<HTMLCanvasElement | null>(null)
  const wrapRef     = useRef<HTMLDivElement>(null)
  const dragging    = useRef(false)
  const mmCenterRef = useRef({ x: CANVAS_W / 2, y: CANVAS_H / 2 })
  const rafRef      = useRef(0)

  const size = () => navHandle.current?.getSize() ?? { w: 0, h: 0 }

  // Render all strokes to a low-res off-screen canvas (only on stroke change). Single canvas,
  // timestamp order — the eraser's destination-out cuts what came before it, good enough for a
  // thumbnail. Boil frame 0, wiggle off (a still preview).
  const buildCache = useCallback(() => {
    const cv = document.createElement('canvas')
    cv.width = Math.max(1, Math.round(CACHE_W * CACHE_SCALE))
    cv.height = Math.max(1, Math.round(CACHE_H * CACHE_SCALE))
    const ctx = cv.getContext('2d')
    if (!ctx) {
      cacheRef.current = null
      return
    }
    ctx.setTransform(CACHE_SCALE, 0, 0, CACHE_SCALE, -CACHE_X * CACHE_SCALE, -CACHE_Y * CACHE_SCALE)
    for (const s of strokes) drawCommitted(ctx, s, 0, false)
    cacheRef.current = cv
  }, [strokes])

  const renderBg = useCallback(
    (mmLeft: number, mmTop: number, worldW: number, worldH: number) => {
      const ctx = bgRef.current?.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, MM_W, MM_H)
      ctx.fillStyle = '#ddd0bd'
      ctx.fillRect(0, 0, MM_W, MM_H)
      ctx.fillStyle = '#faf5ee'
      ctx.fillRect(GRAY_PX, GRAY_PX, WHITE_W, WHITE_H)

      const cache = cacheRef.current
      if (cache) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(GRAY_PX, GRAY_PX, WHITE_W, WHITE_H)
        ctx.clip()
        const iL = Math.max(mmLeft, CACHE_X)
        const iT = Math.max(mmTop, CACHE_Y)
        const iR = Math.min(mmLeft + worldW, CACHE_X + CACHE_W)
        const iB = Math.min(mmTop + worldH, CACHE_Y + CACHE_H)
        if (iR > iL && iB > iT) {
          const dx = ((iL - mmLeft) / worldW) * MM_W
          const dy = ((iT - mmTop) / worldH) * MM_H
          const dw = ((iR - iL) / worldW) * MM_W
          const dh = ((iB - iT) / worldH) * MM_H
          const srcX = (iL - CACHE_X) * CACHE_SCALE
          const srcY = (iT - CACHE_Y) * CACHE_SCALE
          const srcW = (iR - iL) * CACHE_SCALE
          const srcH = (iB - iT) * CACHE_SCALE
          ctx.drawImage(cache, srcX, srcY, srcW, srcH, dx, dy, dw, dh)
        }
        ctx.restore()
      }
    },
    [],
  )

  const update = useCallback(() => {
    const { w: stW, h: stH } = size()
    if (!stW || !stH) return
    const z = viewport.zoom
    const px = viewport.pan.x
    const py = viewport.pan.y

    const vpCx = -px / z + stW / 2
    const vpCy = -py / z + stH / 2
    const vpW = stW / z
    const vpH = stH / z

    const worldW = getWorldW(stW, stH)
    const worldH = getWorldH(worldW)

    let mmLeft = mmCenterRef.current.x - worldW / 2
    let mmTop = mmCenterRef.current.y - worldH / 2

    const blueL0 = ((vpCx - vpW / 2 - mmLeft) / worldW) * MM_W
    const blueR0 = ((vpCx + vpW / 2 - mmLeft) / worldW) * MM_W
    const blueT0 = ((vpCy - vpH / 2 - mmTop) / worldH) * MM_H
    const blueB0 = ((vpCy + vpH / 2 - mmTop) / worldH) * MM_H

    if (blueL0 < GRAY_PX) mmLeft = vpCx - vpW / 2 - (GRAY_PX * worldW) / MM_W
    if (blueR0 > MM_W - GRAY_PX) mmLeft = vpCx + vpW / 2 - ((MM_W - GRAY_PX) * worldW) / MM_W
    if (blueT0 < GRAY_PX) mmTop = vpCy - vpH / 2 - (GRAY_PX * worldH) / MM_H
    if (blueB0 > MM_H - GRAY_PX) mmTop = vpCy + vpH / 2 - ((MM_H - GRAY_PX) * worldH) / MM_H

    const targetCx = mmLeft + worldW / 2
    const targetCy = mmTop + worldH / 2
    const dx = targetCx - mmCenterRef.current.x
    const dy = targetCy - mmCenterRef.current.y
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      mmCenterRef.current = { x: targetCx, y: targetCy }
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    } else {
      mmCenterRef.current = {
        x: mmCenterRef.current.x + dx * 0.25,
        y: mmCenterRef.current.y + dy * 0.25,
      }
      if (!rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0
          update()
        })
    }
    mmLeft = mmCenterRef.current.x - worldW / 2
    mmTop = mmCenterRef.current.y - worldH / 2

    renderBg(mmLeft, mmTop, worldW, worldH)

    const blueL = ((vpCx - vpW / 2 - mmLeft) / worldW) * MM_W
    const blueT = ((vpCy - vpH / 2 - mmTop) / worldH) * MM_H
    const blueW = (vpW / worldW) * MM_W
    const blueH = (vpH / worldH) * MM_H
    const el = blueRef.current
    if (el) {
      el.style.left = blueL + 'px'
      el.style.top = blueT + 'px'
      el.style.width = blueW + 'px'
      el.style.height = blueH + 'px'
      el.style.display = blueW > 0 && blueH > 0 ? 'block' : 'none'
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, renderBg])

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
    return () => {
      minimapHandle.current = null
    }
  }, [minimapHandle, update])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  useEffect(() => {
    buildCache()
    update()
  }, [strokes, buildCache, update])

  useEffect(() => {
    if (!cacheRef.current) buildCache()
    update()
  }, [viewport, buildCache, update])

  const goTo = useCallback(
    (clientX: number, clientY: number) => {
      const rect = wrapRef.current?.getBoundingClientRect()
      const nav = navHandle.current
      const { w: stW, h: stH } = size()
      if (!rect || !nav || !stW || !stH) return
      const z = viewport.zoom
      const worldW = getWorldW(stW, stH)
      const worldH = getWorldH(worldW)
      const mmLeft = mmCenterRef.current.x - worldW / 2
      const mmTop = mmCenterRef.current.y - worldH / 2
      const mx = Math.max(0, Math.min(MM_W, clientX - rect.left))
      const my = Math.max(0, Math.min(MM_H, clientY - rect.top))
      const { cx, cy } = minimapToCanvas(mx, my, mmLeft, mmTop, worldW, worldH)
      nav.applyViewport(z, { x: stW / 2 - cx * z, y: stH / 2 - cy * z })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navHandle, viewport],
  )

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
      onMouseDown={(e) => { dragging.current = true; goTo(e.clientX, e.clientY) }}
      onMouseMove={(e) => { if (dragging.current) goTo(e.clientX, e.clientY) }}
      onMouseUp={() => { dragging.current = false }}
      onMouseLeave={() => { dragging.current = false }}
    >
      <canvas ref={bgRef} width={MM_W} height={MM_H} style={{ display: 'block' }} />
      <div
        ref={blueRef}
        style={{
          position: 'absolute',
          display: 'none',
          border: '1.5px solid var(--m-primary)',
          background: 'color-mix(in oklab, var(--m-primary) 10%, transparent)',
          pointerEvents: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}
