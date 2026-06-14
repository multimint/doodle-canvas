import { useRef, useState, useCallback, useEffect } from 'react'
import { Stage, Layer, Line, Rect, Ellipse, Text } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Stroke, ToolType } from '../../../lib/types'
import { buildStrokeData } from '../utils/strokeSerializer'
import type { LiveStroke } from '../hooks/useLiveStrokes'

interface Props {
  strokes: Stroke[]
  tool: ToolType
  color: string
  strokeWidth: number
  disabled: boolean
  onStrokeComplete: (stroke: Omit<Stroke, 'id'>) => void
  onMouseMove: (x: number, y: number) => void
  onMouseLeave: () => void
  onDeleteStroke: (id: string) => void
  onViewportChange?: (zoom: number, pan: { x: number; y: number }) => void
  stageRef: React.RefObject<Konva.Stage>
  overlay?: React.ReactNode
  remoteStrokes?: Record<string, LiveStroke>
  onLiveUpdate?: (stroke: LiveStroke | null) => void
}

const CANVAS_WIDTH = 1920
const CANVAS_HEIGHT = 1080
const MIN_ZOOM = 0.05
const MAX_ZOOM = 8

export function DrawingStage({
  strokes, tool, color, strokeWidth, disabled,
  onStrokeComplete, onMouseMove, onMouseLeave, onDeleteStroke,
  onViewportChange, stageRef, overlay, remoteStrokes, onLiveUpdate,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  // Viewport — refs for synchronous access in handlers, state for rendering
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const initializedRef = useRef(false)

  // Drawing state
  const isDrawing = useRef(false)
  const livePointsRef = useRef<number[]>([])
  const liveStartRef = useRef<{ x: number; y: number } | null>(null)
  const [livePoints, setLivePoints] = useState<number[]>([])
  const [textPrompt, setTextPrompt] = useState<{ x: number; y: number } | null>(null)

  // Pan state
  const isPanning = useRef(false)
  const lastClientPos = useRef({ x: 0, y: 0 })

  const applyViewport = useCallback((newZoom: number, newPan: { x: number; y: number }) => {
    zoomRef.current = newZoom
    panRef.current = newPan
    setZoom(newZoom)
    setPan(newPan)
    onViewportChange?.(newZoom, newPan)
  }, [onViewportChange])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Prevent browser scroll when wheeling over canvas
    const preventScroll = (e: WheelEvent) => e.preventDefault()
    el.addEventListener('wheel', preventScroll, { passive: false })

    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect()
      if (width === 0 || height === 0) return
      setContainerSize({ w: width, h: height })

      if (!initializedRef.current) {
        initializedRef.current = true
        const fitZoom = Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT)
        const fitPan = {
          x: (width - CANVAS_WIDTH * fitZoom) / 2,
          y: (height - CANVAS_HEIGHT * fitZoom) / 2,
        }
        applyViewport(fitZoom, fitPan)
      }
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      el.removeEventListener('wheel', preventScroll)
    }
  }, [applyViewport])

  // Canvas coords from Konva (accounts for stage x/y/scale automatically)
  const getPos = () => stageRef.current?.getRelativePointerPosition() ?? { x: 0, y: 0 }

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (tool === 'hand') {
      isPanning.current = true
      if (containerRef.current) containerRef.current.style.cursor = 'grabbing'
      lastClientPos.current = { x: e.evt.clientX, y: e.evt.clientY }
      return
    }
    if (disabled) return
    if (tool === 'text') {
      setTextPrompt(getPos())
      return
    }
    isDrawing.current = true
    const { x, y } = getPos()
    const pts = [x, y, x, y]
    livePointsRef.current = pts
    liveStartRef.current = { x, y }
    setLivePoints(pts)
  }

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (tool === 'hand') {
      if (!isPanning.current) return
      const dx = e.evt.clientX - lastClientPos.current.x
      const dy = e.evt.clientY - lastClientPos.current.y
      lastClientPos.current = { x: e.evt.clientX, y: e.evt.clientY }
      const newPan = { x: panRef.current.x + dx, y: panRef.current.y + dy }
      applyViewport(zoomRef.current, newPan)
      return
    }

    const { x, y } = getPos()
    onMouseMove(x, y)

    if (!isDrawing.current) return

    let newPoints: number[]
    if (tool === 'pen' || tool === 'eraser') {
      newPoints = [...livePointsRef.current, x, y]
    } else if (liveStartRef.current) {
      newPoints = [liveStartRef.current.x, liveStartRef.current.y, x, y]
    } else {
      return
    }

    livePointsRef.current = newPoints
    setLivePoints(newPoints)

    const strokeType = (tool === 'pen' ? 'path' : tool) as Stroke['type']
    onLiveUpdate?.({ type: strokeType, points: newPoints, color, strokeWidth })
  }

  const handleMouseUp = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false
      if (containerRef.current) containerRef.current.style.cursor = 'grab'
      return
    }
    // Tool switched to 'hand' mid-stroke — abandon without committing
    if (tool === 'hand') {
      isDrawing.current = false
      livePointsRef.current = []
      liveStartRef.current = null
      setLivePoints([])
      onLiveUpdate?.(null)
      return
    }

    const points = livePointsRef.current
    if (!isDrawing.current || points.length < 4) {
      isDrawing.current = false
      livePointsRef.current = []
      liveStartRef.current = null
      setLivePoints([])
      onLiveUpdate?.(null)
      return
    }
    isDrawing.current = false

    const rtool = tool === 'pen' ? 'path' : tool
    const data = buildStrokeData(tool, points, color, strokeWidth)
    onStrokeComplete({ type: rtool as Stroke['type'], authorId: '', data, timestamp: Date.now() })

    livePointsRef.current = []
    liveStartRef.current = null
    setLivePoints([])
    onLiveUpdate?.(null)
  }, [tool, color, strokeWidth, onStrokeComplete, onLiveUpdate])

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return

    const factor = e.evt.deltaY < 0 ? 1.08 : 1 / 1.08
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * factor))
    const ratio = newZoom / zoomRef.current
    const newPan = {
      x: pointer.x - (pointer.x - panRef.current.x) * ratio,
      y: pointer.y - (pointer.y - panRef.current.y) * ratio,
    }
    applyViewport(newZoom, newPan)
  }

  const handleTextSubmit = useCallback((text: string) => {
    if (!textPrompt || !text.trim()) { setTextPrompt(null); return }
    const data = buildStrokeData('text', [textPrompt.x, textPrompt.y], color, strokeWidth, { text })
    onStrokeComplete({ type: 'text', authorId: '', data, timestamp: Date.now() })
    setTextPrompt(null)
  }, [textPrompt, color, strokeWidth, onStrokeComplete])

  const renderStroke = (stroke: Stroke) => {
    const { data } = stroke
    const common = { key: stroke.id, id: stroke.id, listening: true, onDblClick: () => onDeleteStroke(stroke.id) }
    switch (stroke.type) {
      case 'path':   return <Line {...common} points={data.points ?? []} stroke={data.stroke} strokeWidth={data.strokeWidth} lineCap="round" lineJoin="round" tension={0.5} />
      case 'eraser': return <Line {...common} points={data.points ?? []} stroke="rgba(0,0,0,1)" strokeWidth={data.strokeWidth} lineCap="round" lineJoin="round" tension={0.5} globalCompositeOperation="destination-out" />
      case 'rect':   return <Rect {...common} x={data.x} y={data.y} width={data.width} height={data.height} stroke={data.stroke} strokeWidth={data.strokeWidth} fill="transparent" />
      case 'circle': return <Ellipse {...common} x={data.x} y={data.y} radiusX={data.radiusX ?? 0} radiusY={data.radiusY ?? 0} stroke={data.stroke} strokeWidth={data.strokeWidth} fill="transparent" />
      case 'line':   return <Line {...common} points={data.points ?? []} stroke={data.stroke} strokeWidth={data.strokeWidth} lineCap="round" />
      case 'text':   return <Text {...common} x={data.x} y={data.y} text={data.text} fontSize={data.fontSize} fill={data.stroke} fontFamily="sans-serif" />
      default: return null
    }
  }

  const renderRemoteLiveStroke = (uid: string, s: LiveStroke) => {
    if (s.points.length < 4) return null
    const [x1, y1, x2, y2] = s.points
    const k = `live-${uid}`
    switch (s.type) {
      case 'path':   return <Line key={k} points={s.points} stroke={s.color} strokeWidth={s.strokeWidth} lineCap="round" lineJoin="round" tension={0.5} listening={false} />
      case 'eraser': return <Line key={k} points={s.points} stroke="rgba(0,0,0,1)" strokeWidth={s.strokeWidth} lineCap="round" lineJoin="round" tension={0.5} globalCompositeOperation="destination-out" listening={false} />
      case 'rect':   return <Rect key={k} x={Math.min(x1,x2)} y={Math.min(y1,y2)} width={Math.abs(x2-x1)} height={Math.abs(y2-y1)} stroke={s.color} strokeWidth={s.strokeWidth} fill="transparent" listening={false} />
      case 'circle': return <Ellipse key={k} x={(x1+x2)/2} y={(y1+y2)/2} radiusX={Math.abs(x2-x1)/2} radiusY={Math.abs(y2-y1)/2} stroke={s.color} strokeWidth={s.strokeWidth} fill="transparent" listening={false} />
      case 'line':   return <Line key={k} points={[x1,y1,x2,y2]} stroke={s.color} strokeWidth={s.strokeWidth} lineCap="round" listening={false} />
      default: return null
    }
  }

  const renderLiveStroke = () => {
    if (livePoints.length < 4) return null
    const [x1, y1, x2, y2] = livePoints
    switch (tool) {
      case 'pen':    return <Line points={livePoints} stroke={color} strokeWidth={strokeWidth} lineCap="round" lineJoin="round" tension={0.5} listening={false} />
      case 'eraser': return <Line points={livePoints} stroke="rgba(0,0,0,1)" strokeWidth={strokeWidth} lineCap="round" lineJoin="round" tension={0.5} globalCompositeOperation="destination-out" listening={false} />
      case 'rect':   return <Rect x={Math.min(x1,x2)} y={Math.min(y1,y2)} width={Math.abs(x2-x1)} height={Math.abs(y2-y1)} stroke={color} strokeWidth={strokeWidth} fill="transparent" listening={false} />
      case 'circle': return <Ellipse x={(x1+x2)/2} y={(y1+y2)/2} radiusX={Math.abs(x2-x1)/2} radiusY={Math.abs(y2-y1)/2} stroke={color} strokeWidth={strokeWidth} fill="transparent" listening={false} />
      case 'line':   return <Line points={livePoints} stroke={color} strokeWidth={strokeWidth} lineCap="round" listening={false} />
      default: return null
    }
  }

  const cursor =
    tool === 'hand' ? 'grab' :
    disabled ? 'not-allowed' :
    tool === 'eraser' ? 'cell' :
    tool === 'text' ? 'text' :
    'crosshair'

  return (
    <div className="stage-container" ref={containerRef} style={{ position: 'relative' }}>
      {containerSize.w > 0 && (
        <Stage
          ref={stageRef}
          width={containerSize.w}
          height={containerSize.h}
          scaleX={zoom}
          scaleY={zoom}
          x={pan.x}
          y={pan.y}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { handleMouseUp(); onMouseLeave() }}
          onWheel={handleWheel}
          style={{ cursor }}
        >
          <Layer>
            {strokes.map(renderStroke)}
            {remoteStrokes && Object.entries(remoteStrokes).map(([uid, s]) => renderRemoteLiveStroke(uid, s))}
            {!disabled && renderLiveStroke()}
          </Layer>
        </Stage>
      )}

      {textPrompt && !disabled && (
        <TextInput
          x={textPrompt.x * zoom + pan.x}
          y={textPrompt.y * zoom + pan.y}
          onSubmit={handleTextSubmit}
        />
      )}

      {overlay}
    </div>
  )
}

function TextInput({ x, y, onSubmit }: { x: number; y: number; onSubmit: (t: string) => void }) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  return (
    <input
      ref={inputRef}
      className="text-tool-input"
      style={{ left: x, top: y }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit(value)
        if (e.key === 'Escape') onSubmit('')
      }}
      onBlur={() => onSubmit(value)}
      placeholder="Type here…"
    />
  )
}
