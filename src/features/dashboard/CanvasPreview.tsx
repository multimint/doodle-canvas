import { useEffect, useRef, useState } from 'react'
import { ref, get } from 'firebase/database'
import { rtdb } from '../../lib/firebase'
import { Icon } from '../../lib/icons'
import type { Stroke } from '../../lib/types'
import { strokeKind } from '../canvas/tools/registry'
import { documentKind } from '../canvas/documents/registry'

// Default canvas template dimensions (the dashboard preview predates per-doc sizing).
const { width: CANVAS_W, height: CANVAS_H } = documentKind()

interface Props {
  canvasId: string
  accentColor?: string
}

// Static thumbnail render: the same per-kind draw the live canvas uses, with the boil frozen
// (wiggle off). Routing through the registry means a new stroke kind shows in previews for free.
function renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  strokeKind(stroke.type).draw(ctx, stroke.data ?? {}, { frame: 0, salt: 0, wiggle: false })
  ctx.restore()
}

export function CanvasPreview({ canvasId, accentColor = '#3d5afe' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [loaded, setLoaded] = useState(false)
  const [visible, setVisible] = useState(false)

  // Fix 2: rAF gate collapses rapid resize events into one setSize per frame
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let rafId = 0
    const ro = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const w = entry.contentRect.width
        setSize({ w, h: Math.round(w * CANVAS_H / CANVAS_W) })
      })
    })
    ro.observe(el)
    return () => { ro.disconnect(); cancelAnimationFrame(rafId) }
  }, [])

  // Fix 1: defer Firebase fetch until the card enters the viewport
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true)
    }, { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    setLoaded(false)
    get(ref(rtdb, `canvases/${canvasId}/strokes`))
      .then((snap) => {
        const result: Stroke[] = []
        snap.forEach((child) => {
          result.push({ id: child.key!, ...child.val() } as Stroke)
        })
        result.sort((a, b) => a.timestamp - b.timestamp)
        setStrokes(result)
        setLoaded(true)
      })
      .catch(() => { setLoaded(true) })
  }, [canvasId, visible])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0 || !loaded) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const scale = size.w / CANVAS_W
    ctx.save()
    ctx.scale(scale, scale)

    const markerFirst = [
      ...strokes.filter((s) => s.type === 'marker'),
      ...strokes.filter((s) => s.type !== 'marker'),
    ]
    for (const stroke of markerFirst) renderStroke(ctx, stroke)

    ctx.restore()
  }, [strokes, size, loaded])

  const isEmpty = loaded && strokes.length === 0

  return (
    <div ref={containerRef} style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', background: 'transparent', position: 'relative' }}>
      {size.w > 0 && (
        <canvas ref={canvasRef} width={size.w} height={size.h} style={{ display: 'block', width: '100%', height: '100%' }} />
      )}
      {isEmpty && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 9, paddingTop: 24,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12, background: '#fff',
            boxShadow: '0 3px 10px rgba(20,23,45,.08)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="pen" size={17} color={accentColor} />
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--m-ink-3)', letterSpacing: '.01em' }}>
            Empty canvas
          </div>
        </div>
      )}
    </div>
  )
}
