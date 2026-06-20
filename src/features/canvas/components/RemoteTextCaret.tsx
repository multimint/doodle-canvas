import { useState, useEffect, useMemo } from 'react'
import type { Stroke, TextFocus } from '../../../lib/types'
import type { Camera } from '../engine/camera'
import {
  optsFromData,
  makeMeasurer,
  layoutText,
  caretRect,
} from '../engine/textLayout'

interface Props {
  focuses: { uid: string; focus: TextFocus }[]
  strokes: Stroke[]
  cam: Camera
}

interface CaretPos {
  uid: string
  color: string
  left: number // screen px
  top: number
  bw: number // box screen size (for the rotated container)
  bh: number
  cx: number // caret box-local position (screen px)
  cy: number
  ch: number
  rot: number
}

const BLINK_MS = 530

// One blinking caret per editing friend, placed on their live text. Uses the shared textLayout
// (word-wrap + caret math) instead of Konva internals — a DOM overlay positioned via the camera.
export function RemoteTextCaret({ focuses, strokes, cam }: Props) {
  const carets = useMemo<CaretPos[]>(() => {
    const out: CaretPos[] = []
    for (const { uid, focus } of focuses) {
      if (!focus.editing || focus.caret == null) continue
      const s = strokes.find((st) => st.id === focus.boxId && st.type === 'text')
      if (!s) continue
      const d = s.data
      const opts = optsFromData(d)
      const text = focus.text ?? ''
      const measure = makeMeasurer(opts.fontSize, opts.fontFamily)
      const layout = layoutText(text, opts, measure)
      const cr = caretRect(layout, text, focus.caret, opts, measure)
      out.push({
        uid,
        color: focus.color,
        left: (d.x ?? 0) * cam.zoom + cam.panX,
        top: (d.y ?? 0) * cam.zoom + cam.panY,
        bw: opts.width * cam.zoom,
        bh: opts.height * cam.zoom,
        cx: cr.x * cam.zoom,
        cy: cr.y * cam.zoom,
        ch: cr.h * cam.zoom,
        rot: d.rotation ?? 0,
      })
    }
    return out
  }, [focuses, strokes, cam])

  const [on, setOn] = useState(true)
  useEffect(() => {
    setOn(true)
    const id = setInterval(() => setOn((v) => !v), BLINK_MS)
    return () => clearInterval(id)
  }, [carets])

  return (
    <>
      {carets.map((c) => (
        <div
          key={c.uid}
          style={{
            position: 'absolute',
            left: c.left,
            top: c.top,
            width: c.bw,
            height: c.bh,
            transform: `rotate(${c.rot}deg)`,
            transformOrigin: 'center center',
            pointerEvents: 'none',
            zIndex: 4,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: c.cx,
              top: c.cy,
              width: 2,
              height: c.ch,
              background: c.color,
              borderRadius: 1,
              visibility: on ? 'visible' : 'hidden',
            }}
          />
        </div>
      ))}
    </>
  )
}
