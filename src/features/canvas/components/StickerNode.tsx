import { Group, Shape, Rect } from 'react-konva'
import type Konva from 'konva'
import type { Stroke, StrokeData, ToolType } from '../../../lib/types'
import { drawSticker } from '../render/stickerLibrary'
import { MIN_STICKER_SIZE } from '../utils/strokeSerializer'
import type { RotBox } from '../utils/textBoxGeometry'
import { BoxControls } from './BoxControls'
import type { ActiveSticker } from './textBoxTypes'

interface StickerNodeProps {
  stroke: Stroke
  tool: ToolType
  zoom: number
  activeSticker: ActiveSticker | null
  stageRef: React.RefObject<Konva.Stage>
  handleStartRef: React.MutableRefObject<RotBox | null>
  // Called on first click — also clears text-box selection in DrawingStage.
  onSelect: (s: ActiveSticker) => void
  // Raw dispatch used during drag updates (doesn't need to clear text selection).
  setActiveSticker: React.Dispatch<React.SetStateAction<ActiveSticker | null>>
  onUpdateStroke?: (id: string, patch: Partial<StrokeData>) => void
}

// Normalize stored (possibly non-square) data to a square, preserving the stored center.
function squareGeom(x: number, y: number, w: number, h: number) {
  const s = Math.max(w, h)
  const cx = x + w / 2
  const cy = y + h / 2
  return { x: cx - s / 2, y: cy - s / 2, size: s }
}

export function StickerNode({
  stroke,
  tool,
  zoom,
  activeSticker,
  stageRef,
  handleStartRef,
  onSelect,
  setActiveSticker,
  onUpdateStroke,
}: StickerNodeProps) {
  const { data } = stroke
  const isActive = activeSticker?.id === stroke.id

  // When active, activeSticker is always square (normalized on selection + lockAspect=1).
  // When inactive, normalize from stored data preserving the center.
  const geo = isActive ? activeSticker! : (() => {
    const { x: sx, y: sy, size: s } = squareGeom(
      data.x ?? 0, data.y ?? 0, data.width ?? 120, data.height ?? 120,
    )
    return { x: sx, y: sy, width: s, height: s, rotation: data.rotation ?? 0 }
  })()

  const w = geo.width
  const h = geo.height  // always equal to w
  const rot = geo.rotation
  const gx = geo.x
  const gy = geo.y
  const stickerId = data.stickerId ?? 'flower'
  const strokeColor = data.stroke ?? '#000000'
  const movable = tool === 'select'

  const selectThis = () => {
    // Normalize to square preserving the stored center so st0 in BoxControls
    // matches the visual center exactly — prevents border shift on first resize.
    const { x: nx, y: ny, size: s } = squareGeom(
      data.x ?? 0, data.y ?? 0, data.width ?? 120, data.height ?? 120,
    )
    onSelect({ id: stroke.id, x: nx, y: ny, width: s, height: s, rotation: data.rotation ?? 0 })
  }

  return (
    <Group
      key={stroke.id}
      x={gx + w / 2}
      y={gy + h / 2}
      offsetX={w / 2}
      offsetY={h / 2}
      rotation={rot}
      draggable={movable}
      onClick={() => { if (tool === 'select') selectThis() }}
      onTap={() => { if (tool === 'select') selectThis() }}
      onDragStart={(e) => {
        if (e.target !== e.currentTarget) return
        if (!isActive) selectThis()
      }}
      onDragMove={(e) => {
        if (e.target !== e.currentTarget) return
        const nx = e.target.x() - w / 2
        const ny = e.target.y() - h / 2
        setActiveSticker((prev) =>
          prev && prev.id === stroke.id ? { ...prev, x: nx, y: ny } : prev,
        )
      }}
      onDragEnd={(e) => {
        if (e.target !== e.currentTarget) return
        const nx = e.target.x() - w / 2
        const ny = e.target.y() - h / 2
        onUpdateStroke?.(stroke.id, { x: nx, y: ny })
        setActiveSticker((prev) =>
          prev && prev.id === stroke.id ? { ...prev, x: nx, y: ny } : prev,
        )
      }}
    >
      {/* Transparent hit rect so the whole bounding box is clickable */}
      <Rect x={0} y={0} width={w} height={h} fill="transparent" listening={movable} />
      <Shape
        x={0}
        y={0}
        width={w}
        height={h}
        listening={false}
        sceneFunc={(ctx) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c2d: CanvasRenderingContext2D = (ctx as any)._context
          c2d.save()
          c2d.translate(w / 2, h / 2)
          drawSticker(c2d, stickerId, w / 2, strokeColor)
          c2d.restore()
        }}
      />
      {isActive && (
        <BoxControls
          w={w}
          h={h}
          zoom={zoom}
          editing={false}
          lockAspect={1}
          minSize={MIN_STICKER_SIZE}
          stageRef={stageRef}
          handleStartRef={handleStartRef}
          geom={activeSticker!}
          onChange={(p) =>
            setActiveSticker((prev) => (prev ? { ...prev, ...p } : prev))
          }
          onCommit={() => {
            if (activeSticker!.id) {
              onUpdateStroke?.(activeSticker!.id, {
                x: activeSticker!.x,
                y: activeSticker!.y,
                width: activeSticker!.width,
                height: activeSticker!.height,
                rotation: activeSticker!.rotation,
              })
            }
          }}
        />
      )}
    </Group>
  )
}
