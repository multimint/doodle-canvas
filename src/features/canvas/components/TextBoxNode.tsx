import { Text, Group } from 'react-konva'
import type Konva from 'konva'
import type { Stroke, StrokeData, ToolType } from '../../../lib/types'
import { MIN_TEXT_WIDTH, MIN_TEXT_HEIGHT } from '../utils/strokeSerializer'
import type { RotBox } from '../utils/textBoxGeometry'
import { BoxControls } from './BoxControls'
import type { ActiveBox, XformBox } from './textBoxTypes'

interface TextBoxNodeProps {
  stroke: Stroke
  tool: ToolType
  zoom: number
  active: ActiveBox | null
  xform: XformBox | null
  multiIds: string[]
  multiOffset: { dx: number; dy: number } | null
  stageRef: React.RefObject<Konva.Stage>
  handleStartRef: React.MutableRefObject<RotBox | null>
  getRefCb: (stroke: Stroke) => (node: Konva.Node | null) => void
  setActive: React.Dispatch<React.SetStateAction<ActiveBox | null>>
  selectStroke: (s: Stroke) => void
  openEditExisting: (s: Stroke) => void
  onUpdateStroke?: (id: string, patch: Partial<StrokeData>) => void
}

// A single committed Text Box: a draggable Group at the box centre (rotated) whose
// <Text> and — when active — its BoxControls live as CHILDREN, so a move drags them
// together with no React-state lag. This is the only mutable Stroke type, which is why
// it renders here rather than through the stroke-shape registry.
export function TextBoxNode({
  stroke,
  tool,
  zoom,
  active,
  xform,
  multiIds,
  multiOffset,
  stageRef,
  handleStartRef,
  getRefCb,
  setActive,
  selectStroke,
  openEditExisting,
  onUpdateStroke,
}: TextBoxNodeProps) {
  const { data } = stroke
  const isActive = active?.id === stroke.id
  // Single geometry source: `active` (this box being created/selected/edited) overrides
  // while it owns the box, else `xform` (multi-select live resize), else persisted data.
  const geo = isActive ? active! : xform?.id === stroke.id ? xform : data
  // Legacy text strokes (pre-Text-Box feature) have no width/height; fall back to the
  // minimums so they still render as a sized box instead of collapsing.
  const w = geo.width ?? MIN_TEXT_WIDTH,
    h = geo.height ?? MIN_TEXT_HEIGHT
  const rot = geo.rotation ?? 0
  // In a group selection, follow the live group-drag offset; the group box owns the
  // drag, so the node itself isn't individually draggable.
  const inMulti = multiIds.includes(stroke.id)
  const off = inMulti && multiOffset ? multiOffset : { dx: 0, dy: 0 }
  const gx = (geo.x ?? 0) + off.dx,
    gy = (geo.y ?? 0) + off.dy
  // While this box is being edited, hide the Konva text and let the textarea render it,
  // so the caret sits on the very text it's editing.
  const editingThis = isActive && active!.editing
  const movable = tool === 'select' && !inMulti && !editingThis
  return (
    <Group
      key={stroke.id}
      x={gx + w / 2}
      y={gy + h / 2}
      offsetX={w / 2}
      offsetY={h / 2}
      rotation={rot}
      draggable={movable}
      onClick={() => {
        if (tool === 'select') selectStroke(stroke)
      }}
      onTap={() => {
        if (tool === 'select') selectStroke(stroke)
      }}
      onDblClick={() => {
        if (tool === 'select') openEditExisting(stroke)
      }}
      onDblTap={() => {
        if (tool === 'select') openEditExisting(stroke)
      }}
      onDragStart={(e) => {
        // Konva drag events bubble: dragging a child handle (rotate knob / resize
        // handle) fires this too, with e.target as the handle. Only treat it as a box
        // move when the Group itself is the drag target.
        if (e.target !== e.currentTarget) return
        if (!isActive) selectStroke(stroke)
      }}
      onDragMove={(e) => {
        if (e.target !== e.currentTarget) return
        const nx = e.target.x() - w / 2,
          ny = e.target.y() - h / 2
        setActive((prev) =>
          prev && prev.id === stroke.id ? { ...prev, x: nx, y: ny } : prev,
        )
      }}
      onDragEnd={(e) => {
        if (e.target !== e.currentTarget) return
        const nx = e.target.x() - w / 2,
          ny = e.target.y() - h / 2
        onUpdateStroke?.(stroke.id, { x: nx, y: ny })
        setActive((prev) =>
          prev && prev.id === stroke.id ? { ...prev, x: nx, y: ny } : prev,
        )
      }}
    >
      <Text
        id={stroke.id}
        ref={getRefCb(stroke)}
        listening
        x={0}
        y={0}
        text={data.text}
        fontSize={data.fontSize}
        fill={data.fill ?? data.stroke}
        fontFamily='sans-serif'
        width={w}
        height={h}
        wrap='word'
        align='center'
        verticalAlign='middle'
        visible={!editingThis}
      />
      {isActive && (
        <BoxControls
          w={w}
          h={h}
          zoom={zoom}
          editing={active!.editing}
          stageRef={stageRef}
          handleStartRef={handleStartRef}
          geom={active!}
          onChange={(p) =>
            setActive((prev) => (prev ? { ...prev, ...p } : prev))
          }
          onCommit={() => {
            if (active!.id)
              onUpdateStroke?.(active!.id, {
                x: active!.x,
                y: active!.y,
                width: active!.width,
                height: active!.height,
                rotation: active!.rotation,
              })
          }}
        />
      )}
    </Group>
  )
}
