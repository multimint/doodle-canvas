import { useEffect, useRef, useState } from 'react'
import { ref, get } from 'firebase/database'
import { rtdb } from '../../lib/firebase'
import { Icon } from '../../lib/icons'
import { DOODLE_FONT } from '../../lib/fonts'
import type { Stroke } from '../../lib/types'
import { drawSticker } from '../canvas/render/stickerLibrary'

const CANVAS_W = 1920
const CANVAS_H = 1080

interface Props {
  canvasId: string
  accentColor?: string
}

function drawSmoothLine(ctx: CanvasRenderingContext2D, points: number[]) {
  if (points.length < 2) return
  ctx.beginPath()
  ctx.moveTo(points[0], points[1])
  if (points.length === 2) {
    ctx.lineTo(points[0], points[1])
  } else {
    for (let i = 2; i < points.length - 2; i += 2) {
      const cx = points[i], cy = points[i + 1]
      const nx = points[i + 2], ny = points[i + 3]
      ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2)
    }
    ctx.lineTo(points[points.length - 2], points[points.length - 1])
  }
  ctx.stroke()
}

function renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { data } = stroke
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (stroke.type) {
    case 'path':
      ctx.strokeStyle = data.stroke ?? '#000'
      ctx.lineWidth = data.strokeWidth ?? 2
      drawSmoothLine(ctx, data.points ?? [])
      break

    case 'marker':
      ctx.strokeStyle = data.stroke ?? '#000'
      ctx.lineWidth = (data.strokeWidth ?? 6) * 3
      drawSmoothLine(ctx, data.points ?? [])
      break

    case 'eraser':
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth = data.strokeWidth ?? 2
      drawSmoothLine(ctx, data.points ?? [])
      break

    case 'rect':
      ctx.strokeStyle = data.stroke ?? '#000'
      ctx.lineWidth = data.strokeWidth ?? 2
      ctx.strokeRect(data.x ?? 0, data.y ?? 0, data.width ?? 0, data.height ?? 0)
      break

    case 'circle':
      ctx.strokeStyle = data.stroke ?? '#000'
      ctx.lineWidth = data.strokeWidth ?? 2
      ctx.beginPath()
      ctx.ellipse(data.x ?? 0, data.y ?? 0, data.radiusX ?? 0, data.radiusY ?? 0, 0, 0, Math.PI * 2)
      ctx.stroke()
      break

    case 'line': {
      ctx.strokeStyle = data.stroke ?? '#000'
      ctx.lineWidth = data.strokeWidth ?? 2
      const pts = data.points ?? []
      if (pts.length >= 4) {
        ctx.beginPath()
        ctx.moveTo(pts[0], pts[1])
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
        ctx.stroke()
      }
      break
    }

    case 'text': {
      const { x = 0, y = 0, text = '', fontSize = 20, stroke = '#000' } = data
      ctx.fillStyle = stroke
      ctx.font = `${fontSize}px ${DOODLE_FONT}`
      ctx.textBaseline = 'top'
      text.split('\n').forEach((line, i) => {
        ctx.fillText(line, x, y + i * fontSize * 1.2)
      })
      break
    }

    case 'sticker': {
      const { x = 0, y = 0, width = 120, height = 120, rotation = 0, stickerId = 'flower', stroke = '#000000' } = data
      ctx.translate(x + width / 2, y + height / 2)
      ctx.rotate(rotation * Math.PI / 180)
      drawSticker(ctx, stickerId, Math.min(width, height) / 2, stroke)
      break
    }
  }

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
