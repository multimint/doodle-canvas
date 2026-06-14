import { useEffect, useRef, useState } from 'react'
import { ref, get } from 'firebase/database'
import { Stage, Layer, Line, Rect, Ellipse, Text } from 'react-konva'
import { rtdb } from '../../lib/firebase'
import type { Stroke } from '../../lib/types'

const CANVAS_W = 1920
const CANVAS_H = 1080

interface Props {
  canvasId: string
}

export function CanvasPreview({ canvasId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [strokes, setStrokes] = useState<Stroke[]>([])

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
    get(ref(rtdb, `canvases/${canvasId}/strokes`))
      .then((snap) => {
        const result: Stroke[] = []
        snap.forEach((child) => {
          result.push({ id: child.key!, ...child.val() } as Stroke)
        })
        result.sort((a, b) => a.timestamp - b.timestamp)
        setStrokes(result)
      })
      .catch(() => {})
  }, [canvasId])

  const scale = size.w / CANVAS_W

  const renderStroke = (stroke: Stroke) => {
    const { data } = stroke
    const k = stroke.id
    switch (stroke.type) {
      case 'path':
        return <Line key={k} points={data.points ?? []} stroke={data.stroke} strokeWidth={data.strokeWidth} lineCap="round" lineJoin="round" tension={0.5} listening={false} />
      case 'eraser':
        return <Line key={k} points={data.points ?? []} stroke="rgba(0,0,0,1)" strokeWidth={data.strokeWidth} lineCap="round" lineJoin="round" tension={0.5} globalCompositeOperation="destination-out" listening={false} />
      case 'rect':
        return <Rect key={k} x={data.x} y={data.y} width={data.width} height={data.height} stroke={data.stroke} strokeWidth={data.strokeWidth} fill="transparent" listening={false} />
      case 'circle':
        return <Ellipse key={k} x={data.x} y={data.y} radiusX={data.radiusX ?? 0} radiusY={data.radiusY ?? 0} stroke={data.stroke} strokeWidth={data.strokeWidth} fill="transparent" listening={false} />
      case 'line':
        return <Line key={k} points={data.points ?? []} stroke={data.stroke} strokeWidth={data.strokeWidth} lineCap="round" listening={false} />
      case 'text':
        return <Text key={k} x={data.x} y={data.y} text={data.text} fontSize={data.fontSize} fill={data.stroke} fontFamily="sans-serif" listening={false} />
      default:
        return null
    }
  }

  return (
    <div ref={containerRef} className="w-full aspect-video border-b-2 border-ink overflow-hidden bg-white">
      {size.w > 0 && (
        <Stage width={size.w} height={size.h} scaleX={scale} scaleY={scale} listening={false}>
          <Layer>{strokes.map(renderStroke)}</Layer>
        </Stage>
      )}
    </div>
  )
}
