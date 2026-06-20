import { useEffect, useRef, useState } from 'react'
import { ref, get } from 'firebase/database'
import { Stage, Layer, Line, Rect, Ellipse, Text, Shape } from 'react-konva'
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

export function CanvasPreview({ canvasId, accentColor = '#3d5afe' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      setSize({ w, h: Math.round(w * CANVAS_H / CANVAS_W) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
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
  }, [canvasId])

  const scale = size.w / CANVAS_W

  const renderStroke = (stroke: Stroke) => {
    const { data } = stroke
    const k = stroke.id
    switch (stroke.type) {
      case 'path':
      case 'brush':
        return <Line key={k} points={data.points ?? []} stroke={data.stroke} strokeWidth={data.strokeWidth} lineCap="round" lineJoin="round" tension={0.5} listening={false} />
      case 'marker':
        return <Line key={k} points={data.points ?? []} stroke={data.stroke} strokeWidth={(data.strokeWidth ?? 6) * 3} lineCap="round" lineJoin="round" tension={0.4} listening={false} />
      case 'eraser':
        return <Line key={k} points={data.points ?? []} stroke="rgba(0,0,0,1)" strokeWidth={data.strokeWidth} lineCap="round" lineJoin="round" tension={0.5} globalCompositeOperation="destination-out" listening={false} />
      case 'rect':
        return <Rect key={k} x={data.x} y={data.y} width={data.width} height={data.height} stroke={data.stroke} strokeWidth={data.strokeWidth} fill="transparent" listening={false} />
      case 'circle':
        return <Ellipse key={k} x={data.x} y={data.y} radiusX={data.radiusX ?? 0} radiusY={data.radiusY ?? 0} stroke={data.stroke} strokeWidth={data.strokeWidth} fill="transparent" listening={false} />
      case 'line':
        return <Line key={k} points={data.points ?? []} stroke={data.stroke} strokeWidth={data.strokeWidth} lineCap="round" listening={false} />
      case 'text':
        return <Text key={k} x={data.x} y={data.y} text={data.text} fontSize={data.fontSize} fill={data.stroke} fontFamily={DOODLE_FONT} listening={false} />
      case 'sticker': {
        const { x = 0, y = 0, width = 120, height = 120, rotation = 0, stickerId = 'flower', stroke = '#000000' } = data
        return (
          <Shape
            key={k}
            x={x + width / 2}
            y={y + height / 2}
            offsetX={width / 2}
            offsetY={height / 2}
            rotation={rotation}
            listening={false}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sceneFunc={(ctx) => { const c2d: CanvasRenderingContext2D = (ctx as any)._context; c2d.save(); drawSticker(c2d, stickerId, Math.min(width, height) / 2, stroke); c2d.restore() }}
          />
        )
      }
      default:
        return null
    }
  }

  const isEmpty = loaded && strokes.length === 0

  const markerFirst = [
    ...strokes.filter((s) => s.type === 'marker'),
    ...strokes.filter((s) => s.type !== 'marker'),
  ]

  return (
    <div ref={containerRef} style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', background: 'transparent', position: 'relative' }}>
      {size.w > 0 && (
        <Stage width={size.w} height={size.h} scaleX={scale} scaleY={scale} listening={false}>
          <Layer>{markerFirst.map(renderStroke)}</Layer>
        </Stage>
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
