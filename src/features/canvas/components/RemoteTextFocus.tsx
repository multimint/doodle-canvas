import type { Stroke, TextFocus } from '../../../lib/types'
import { MIN_TEXT_WIDTH, MIN_TEXT_HEIGHT } from '../utils/strokeSerializer'
import type { Camera } from '../engine/camera'

interface Props {
  focuses: { uid: string; focus: TextFocus }[]
  strokes: Stroke[]
  displayNames: Record<string, string>
  cam: Camera
}

// For each friend focused on a Text Box: a coloured outline + name tag — dashed while merely
// selected, solid + thicker while editing. A DOM overlay (was a Konva group): the box is
// positioned in screen space via the camera and rotated about its centre, so outline weight and
// label stay a constant on-screen size (no per-zoom division needed).
export function RemoteTextFocus({ focuses, strokes, displayNames, cam }: Props) {
  return (
    <>
      {focuses.map(({ uid, focus }) => {
        const s = strokes.find((st) => st.id === focus.boxId && st.type === 'text')
        if (!s) return null
        const d = s.data
        const w = (d.width ?? MIN_TEXT_WIDTH) * cam.zoom
        const h = (d.height ?? MIN_TEXT_HEIGHT) * cam.zoom
        const left = (d.x ?? 0) * cam.zoom + cam.panX
        const top = (d.y ?? 0) * cam.zoom + cam.panY
        const rot = d.rotation ?? 0
        const name = displayNames[uid] ?? uid.slice(0, 6)
        return (
          <div
            key={uid}
            style={{
              position: 'absolute',
              left,
              top,
              width: w,
              height: h,
              transform: `rotate(${rot}deg)`,
              transformOrigin: 'center center',
              pointerEvents: 'none',
              zIndex: 4,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                border: `${focus.editing ? 2.5 : 2}px ${focus.editing ? 'solid' : 'dashed'} ${focus.color}`,
                borderRadius: 4,
                boxSizing: 'border-box',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: -22,
                left: 0,
                background: focus.color,
                color: '#fff',
                fontSize: 12,
                fontFamily: 'Quicksand, system-ui, sans-serif',
                padding: '3px 5px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </div>
          </div>
        )
      })}
    </>
  )
}
