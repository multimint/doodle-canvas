import { Line, Rect } from 'react-konva'
import type Konva from 'konva'
import {
  handleAnchor,
  resizeFromPointer,
  RESIZE_HANDLES,
  type RotBox,
} from '../utils/textBoxGeometry'

// Selection chrome (dashed border + rotate knob + 8 resize handles, plus an optional
// edit catcher) for the active Text Box. Rendered as CHILDREN of a Group that is
// already positioned at the box centre and rotated, so local coords (0,0)..(w,h)
// trace the box. Because it lives in the same Group as the box's <Text>, a move-drag
// of that Group carries the border with the text — no React-state lag / desync.
// Handle drags compute geometry in world space (via the box's fixed start frame) and
// report it through onChange; onCommit persists on release.
export function BoxControls({
  w,
  h,
  zoom,
  editing,
  stageRef,
  handleStartRef,
  geom,
  onChange,
  onCommit,
}: {
  w: number
  h: number
  zoom: number
  editing: boolean
  stageRef: React.RefObject<Konva.Stage>
  handleStartRef: React.MutableRefObject<RotBox | null>
  geom: RotBox
  onChange: (p: Partial<RotBox>) => void
  onCommit: () => void
}) {
  const hs = 11 / zoom
  const rotGap = 26 / zoom
  const st0: RotBox = {
    x: geom.x,
    y: geom.y,
    width: geom.width,
    height: geom.height,
    rotation: geom.rotation,
  }
  return (
    <>
      {/* Full-box catcher (edit only): mousedown preventDefault keeps the textarea
          focused, so clicking the empty box area never commits. */}
      {editing && (
        <Rect
          x={0}
          y={0}
          width={w}
          height={h}
          fill='transparent'
          onMouseDown={(e) => {
            e.evt.preventDefault()
          }}
        />
      )}
      <Rect
        x={0}
        y={0}
        width={w}
        height={h}
        stroke='#3d5afe'
        strokeWidth={1.5 / zoom}
        dash={[6 / zoom, 4 / zoom]}
        listening={false}
      />
      {/* Rotate knob above the top edge */}
      <Line
        points={[w / 2, 0, w / 2, -rotGap]}
        stroke='#3d5afe'
        strokeWidth={1.5 / zoom}
        listening={false}
      />
      <Rect
        x={w / 2 - hs / 2}
        y={-rotGap - hs / 2}
        width={hs}
        height={hs}
        cornerRadius={hs / 2}
        fill='#ffffff'
        stroke='#3d5afe'
        strokeWidth={1.5 / zoom}
        hitStrokeWidth={22 / zoom}
        draggable
        onMouseDown={(e) => {
          e.evt.preventDefault()
        }}
        onMouseEnter={(e) => {
          const c = e.target.getStage()?.container()
          if (c) c.style.cursor = 'grab'
        }}
        onMouseLeave={(e) => {
          const c = e.target.getStage()?.container()
          if (c) c.style.cursor = 'default'
        }}
        onDragStart={() => {
          handleStartRef.current = st0
        }}
        onDragMove={(e) => {
          const st = handleStartRef.current
          const wp = stageRef.current?.getRelativePointerPosition()
          if (!st || !wp) return
          const cx = st.x + st.width / 2,
            cy = st.y + st.height / 2
          const ang = (Math.atan2(wp.y - cy, wp.x - cx) * 180) / Math.PI + 90
          onChange({ rotation: ang })
          e.target.position({ x: st.width / 2 - hs / 2, y: -rotGap - hs / 2 })
        }}
        onDragEnd={onCommit}
      />
      {/* 8 resize handles, math done in the box's fixed start frame */}
      {RESIZE_HANDLES.map(({ role, cursor: hCursor }) => {
        const a = handleAnchor(role, { x: 0, y: 0, width: w, height: h })
        return (
          <Rect
            key={role}
            x={a.x - hs / 2}
            y={a.y - hs / 2}
            width={hs}
            height={hs}
            fill='#ffffff'
            stroke='#3d5afe'
            strokeWidth={1.5 / zoom}
            hitStrokeWidth={22 / zoom}
            draggable
            onMouseDown={(e) => {
              e.evt.preventDefault()
            }}
            onMouseEnter={(e) => {
              const c = e.target.getStage()?.container()
              if (c) c.style.cursor = hCursor
            }}
            onMouseLeave={(e) => {
              const c = e.target.getStage()?.container()
              if (c) c.style.cursor = 'default'
            }}
            onDragStart={() => {
              handleStartRef.current = st0
            }}
            onDragMove={(e) => {
              const st = handleStartRef.current
              const wp = stageRef.current?.getRelativePointerPosition()
              if (!st || !wp) return
              const nb = resizeFromPointer(role, st, wp)
              onChange({
                x: nb.x,
                y: nb.y,
                width: nb.width,
                height: nb.height,
                rotation: nb.rotation,
              })
              const la = handleAnchor(role, {
                x: 0,
                y: 0,
                width: nb.width,
                height: nb.height,
              })
              e.target.position({ x: la.x - hs / 2, y: la.y - hs / 2 })
            }}
            onDragEnd={onCommit}
          />
        )
      })}
    </>
  )
}
