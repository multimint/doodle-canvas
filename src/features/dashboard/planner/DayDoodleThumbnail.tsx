import { useEffect, useRef, useState } from 'react'
import type { Stroke } from '../../../lib/types'
import { drawCommitted } from '../../canvas/engine/scene'
import { DAY_FRAME } from './dayDoodle'

// Marker translucency, matching CanvasStage's marker layer (shown at 0.82). Thumbnails don't use
// a separate layer, so we just draw markers first under a reduced alpha.
const MARKER_ALPHA = 0.82

interface Props {
  strokes: Stroke[]
  // Shared boil frame from PlannerPage's single useSharedBoil loop (every card draws the same
  // frame, so the whole grid wiggles in sync from one rAF). 0 = settled / no wiggle.
  frame: number
}

// A read-only, animated render of one day's Day Doodle, sized to fill its calendar card. Models
// CanvasPreview but its strokes come from props (not RTDB) and it animates off the shared frame.
// The 120×90 frame is fit (contain) and centred so no art is cropped.
export function DayDoodleThumbnail({ strokes, frame }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf = 0
    const ro = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const { width, height } = entry.contentRect
        setSize({ w: Math.round(width), h: Math.round(height) })
      })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0 || size.h === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1

    // Contain the 120×90 frame in the card, centred.
    const scale = Math.min(size.w / DAY_FRAME.width, size.h / DAY_FRAME.height)
    const offX = (size.w - DAY_FRAME.width * scale) / 2
    const offY = (size.h - DAY_FRAME.height * scale) / 2

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offX * dpr, offY * dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const wiggle = frame !== 0
    // Markers behind (translucent), everything else on top — mirrors the canvas layer order.
    ctx.globalAlpha = MARKER_ALPHA
    for (const s of strokes) if (s.type === 'marker') drawCommitted(ctx, s, frame, wiggle)
    ctx.globalAlpha = 1
    for (const s of strokes) if (s.type !== 'marker') drawCommitted(ctx, s, frame, wiggle)
  }, [strokes, frame, size])

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {size.w > 0 && (
        <canvas
          ref={canvasRef}
          width={Math.round(size.w * (window.devicePixelRatio || 1))}
          height={Math.round(size.h * (window.devicePixelRatio || 1))}
          style={{ display: 'block', width: size.w, height: size.h }}
        />
      )}
    </div>
  )
}
