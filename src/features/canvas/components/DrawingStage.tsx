import { useRef, useState, useCallback, useEffect } from 'react'
import { Stage, Layer, Line, Rect, Ellipse, Text } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Stroke, ToolType } from '../../../lib/types'
import { buildStrokeData } from '../utils/strokeSerializer'

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
  onScaleChange: (scale: number) => void
  stageRef: React.RefObject<Konva.Stage>
}

const CANVAS_WIDTH = 1920
const CANVAS_HEIGHT = 1080

export function DrawingStage({
  strokes, tool, color, strokeWidth, disabled,
  onStrokeComplete, onMouseMove, onMouseLeave, onDeleteStroke, onScaleChange, stageRef,
}: Props) {
  const isDrawing = useRef(false)
  const [livePoints, setLivePoints] = useState<number[]>([])
  const [liveStart, setLiveStart] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [textPrompt, setTextPrompt] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return
      const { width, height } = containerRef.current.getBoundingClientRect()
      const s = Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT)
      setScale(s)
      onScaleChange(s)
    }
    updateScale()
    const ro = new ResizeObserver(updateScale)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  // onScaleChange is stable (setScale from parent)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getPos = (_e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const pos = stage.getPointerPosition()
    if (!pos) return { x: 0, y: 0 }
    return { x: pos.x / scale, y: pos.y / scale }
  }

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (disabled) return

    if (tool === 'text') {
      const { x, y } = getPos(e)
      setTextPrompt({ x, y })
      return
    }

    isDrawing.current = true
    const { x, y } = getPos(e)
    setLivePoints([x, y, x, y])
    setLiveStart({ x, y })
  }

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const { x, y } = getPos(e)
    onMouseMove(x, y)

    if (!isDrawing.current) return

    if (tool === 'pen' || tool === 'eraser') {
      setLivePoints((prev) => [...prev, x, y])
    } else if (liveStart) {
      setLivePoints([liveStart.x, liveStart.y, x, y])
    }
  }

  const handleMouseUp = useCallback(() => {
    if (!isDrawing.current || livePoints.length < 4) {
      isDrawing.current = false
      setLivePoints([])
      setLiveStart(null)
      return
    }
    isDrawing.current = false

    const rtool = tool === 'pen' ? 'path' : tool
    const data = buildStrokeData(tool, livePoints, color, strokeWidth)
    onStrokeComplete({
      type: rtool as Stroke['type'],
      authorId: '',
      data,
      timestamp: Date.now(),
    })

    setLivePoints([])
    setLiveStart(null)
  }, [tool, livePoints, color, strokeWidth, onStrokeComplete])

  const handleTextSubmit = useCallback((text: string) => {
    if (!textPrompt || !text.trim()) {
      setTextPrompt(null)
      return
    }
    const data = buildStrokeData('text', [textPrompt.x, textPrompt.y], color, strokeWidth, { text })
    onStrokeComplete({
      type: 'text',
      authorId: '',
      data,
      timestamp: Date.now(),
    })
    setTextPrompt(null)
  }, [textPrompt, color, strokeWidth, onStrokeComplete])

  const renderStroke = (stroke: Stroke) => {
    const { data } = stroke
    const commonProps = {
      key: stroke.id,
      id: stroke.id,
      listening: true,
      onDblClick: () => onDeleteStroke(stroke.id),
    }

    switch (stroke.type) {
      case 'path':
        return (
          <Line
            {...commonProps}
            points={data.points ?? []}
            stroke={data.stroke}
            strokeWidth={data.strokeWidth}
            lineCap="round"
            lineJoin="round"
            tension={0.5}
          />
        )
      case 'eraser':
        return (
          <Line
            {...commonProps}
            points={data.points ?? []}
            stroke="rgba(0,0,0,1)"
            strokeWidth={data.strokeWidth}
            lineCap="round"
            lineJoin="round"
            tension={0.5}
            globalCompositeOperation="destination-out"
          />
        )
      case 'rect':
        return (
          <Rect
            {...commonProps}
            x={data.x}
            y={data.y}
            width={data.width}
            height={data.height}
            stroke={data.stroke}
            strokeWidth={data.strokeWidth}
            fill="transparent"
          />
        )
      case 'circle':
        return (
          <Ellipse
            {...commonProps}
            x={data.x}
            y={data.y}
            radiusX={data.radiusX ?? 0}
            radiusY={data.radiusY ?? 0}
            stroke={data.stroke}
            strokeWidth={data.strokeWidth}
            fill="transparent"
          />
        )
      case 'line':
        return (
          <Line
            {...commonProps}
            points={data.points ?? []}
            stroke={data.stroke}
            strokeWidth={data.strokeWidth}
            lineCap="round"
          />
        )
      case 'text':
        return (
          <Text
            {...commonProps}
            x={data.x}
            y={data.y}
            text={data.text}
            fontSize={data.fontSize}
            fill={data.stroke}
            fontFamily="sans-serif"
          />
        )
      default:
        return null
    }
  }

  const renderLiveStroke = () => {
    if (livePoints.length < 4) return null

    switch (tool) {
      case 'pen':
        return (
          <Line
            points={livePoints}
            stroke={color}
            strokeWidth={strokeWidth}
            lineCap="round"
            lineJoin="round"
            tension={0.5}
            listening={false}
          />
        )
      case 'eraser':
        return (
          <Line
            points={livePoints}
            stroke="rgba(0,0,0,1)"
            strokeWidth={strokeWidth}
            lineCap="round"
            lineJoin="round"
            tension={0.5}
            globalCompositeOperation="destination-out"
            listening={false}
          />
        )
      case 'rect': {
        const [x1, y1, x2, y2] = livePoints
        return (
          <Rect
            x={Math.min(x1, x2)}
            y={Math.min(y1, y2)}
            width={Math.abs(x2 - x1)}
            height={Math.abs(y2 - y1)}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            listening={false}
          />
        )
      }
      case 'circle': {
        const [x1, y1, x2, y2] = livePoints
        return (
          <Ellipse
            x={(x1 + x2) / 2}
            y={(y1 + y2) / 2}
            radiusX={Math.abs(x2 - x1) / 2}
            radiusY={Math.abs(y2 - y1) / 2}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            listening={false}
          />
        )
      }
      case 'line':
        return (
          <Line
            points={livePoints}
            stroke={color}
            strokeWidth={strokeWidth}
            lineCap="round"
            listening={false}
          />
        )
      default:
        return null
    }
  }

  const cursor = disabled ? 'not-allowed' : tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair'

  return (
    <div className="stage-container" ref={containerRef}>
      <Stage
        ref={stageRef}
        width={CANVAS_WIDTH * scale}
        height={CANVAS_HEIGHT * scale}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); onMouseLeave() }}
        style={{ cursor }}
      >
        <Layer>
          {strokes.map(renderStroke)}
          {!disabled && renderLiveStroke()}
        </Layer>
      </Stage>

      {textPrompt && !disabled && (
        <TextInput
          x={textPrompt.x * scale}
          y={textPrompt.y * scale}
          onSubmit={handleTextSubmit}
        />
      )}
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
