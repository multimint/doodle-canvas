import { useRef } from 'react'
import {
  handleAnchor,
  resizeFromPointer,
  RESIZE_HANDLES,
  type HandleRole,
  type RotBox,
} from '../utils/textBoxGeometry'
import { beginPointerDrag } from '../utils/pointerDrag'
import { HANDLE_SIZE as HS, ROTATE_GAP as ROT_GAP, SELECTION_ACCENT as ACCENT, SELECTION_Z } from '../constants'

// Selection chrome (dashed border + rotate knob + 8 resize handles) for the active Text Box /
// sticker, as a DOM overlay. The old version rendered these as Konva nodes inside a rotated
// group; here we position a single rotated <div> at the box's screen rectangle and lay the
// handles out in its local frame, so a constant on-screen handle size needs no per-zoom scaling.
// Handle drags reuse the exact same world-space resize/rotate math (textBoxGeometry), driven by
// a toWorld() converter the stage supplies. onChange streams live geometry; onCommit persists.

interface Props {
  box: RotBox // world geometry
  zoom: number
  pan: { x: number; y: number }
  // Convert a client (page) point to world coords (stage-supplied; accounts for camera + rect).
  toWorld: (clientX: number, clientY: number) => { x: number; y: number }
  handleStartRef: React.MutableRefObject<RotBox | null>
  onChange: (p: Partial<RotBox>) => void
  // Receives the FINAL geometry so the parent persists what the drag actually ended on
  // (passing it through avoids a stale closure over the parent's pre-drag state).
  onCommit: (box: RotBox) => void
  lockAspect?: boolean | number
  minSize?: number
}

export function BoxControls({
  box,
  zoom,
  pan,
  toWorld,
  handleStartRef,
  onChange,
  onCommit,
  lockAspect = false,
  minSize,
}: Props) {
  const cw = box.width * zoom
  const ch = box.height * zoom
  const left = box.x * zoom + pan.x
  const top = box.y * zoom + pan.y
  const st0: RotBox = {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rotation: box.rotation,
  }

  // Latest geometry during a drag, so onCommit persists the FINAL value (the pointerup
  // listener is attached once at drag-start, so it can't read the parent's updated state).
  const latest = useRef<RotBox>(st0)

  // Start a handle drag: capture the pointer so move/up fire on the handle even as the cursor
  // leaves it, and freeze the box's start frame for stable resize math.
  const startDrag = (
    e: React.PointerEvent,
    compute: (wp: { x: number; y: number }) => Partial<RotBox>,
  ) => {
    handleStartRef.current = st0
    latest.current = st0
    beginPointerDrag(e, toWorld, {
      onMove: (wp) => {
        const patch = compute(wp)
        latest.current = { ...latest.current, ...patch }
        onChange(patch)
      },
      onEnd: () => onCommit(latest.current),
    })
  }

  const handleStyle = (lx: number, ly: number, cursor: string): React.CSSProperties => ({
    position: 'absolute',
    left: lx - HS / 2,
    top: ly - HS / 2,
    width: HS,
    height: HS,
    background: '#fff',
    border: `1.5px solid ${ACCENT}`,
    borderRadius: 2,
    boxSizing: 'border-box',
    cursor,
    pointerEvents: 'auto',
    touchAction: 'none',
  })

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: cw,
        height: ch,
        transform: `rotate(${box.rotation}deg)`,
        transformOrigin: 'center center',
        pointerEvents: 'none',
        zIndex: SELECTION_Z,
      }}
    >
      {/* Dashed border */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: `1.5px dashed ${ACCENT}`,
          boxSizing: 'border-box',
        }}
      />
      {/* Rotate stem + knob */}
      <div
        style={{
          position: 'absolute',
          left: cw / 2,
          top: -ROT_GAP,
          width: 1.5,
          height: ROT_GAP,
          background: ACCENT,
          transform: 'translateX(-50%)',
        }}
      />
      <div
        style={{ ...handleStyle(cw / 2, -ROT_GAP, 'grab'), borderRadius: HS / 2 }}
        onPointerDown={(e) =>
          startDrag(e, (wp) => {
            const st = handleStartRef.current
            if (!st) return {}
            const cx = st.x + st.width / 2
            const cy = st.y + st.height / 2
            const ang = (Math.atan2(wp.y - cy, wp.x - cx) * 180) / Math.PI + 90
            return { rotation: ang }
          })
        }
      />
      {/* 8 resize handles, anchored in the box-local (screen-scaled) frame */}
      {RESIZE_HANDLES.map(({ role, cursor }) => {
        const a = handleAnchor(role as HandleRole, { x: 0, y: 0, width: cw, height: ch })
        return (
          <div
            key={role}
            style={handleStyle(a.x, a.y, cursor)}
            onPointerDown={(e) =>
              startDrag(e, (wp) => {
                const st = handleStartRef.current
                if (!st) return {}
                const nb = resizeFromPointer(role, st, wp, lockAspect, minSize, minSize)
                return {
                  x: nb.x,
                  y: nb.y,
                  width: nb.width,
                  height: nb.height,
                  rotation: nb.rotation,
                }
              })
            }
          />
        )
      })}
    </div>
  )
}
