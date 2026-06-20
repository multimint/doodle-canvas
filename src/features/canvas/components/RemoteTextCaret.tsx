import { useState, useLayoutEffect, useEffect } from 'react'
import { Group, Rect } from 'react-konva'
import type Konva from 'konva'
import type { Stroke, TextFocus } from '../../../lib/types'
import { MIN_TEXT_WIDTH, MIN_TEXT_HEIGHT } from '../utils/strokeSerializer'

interface Props {
  focuses: { uid: string; focus: TextFocus }[]
  strokes: Stroke[]
  zoom: number
  stageRef: React.RefObject<Konva.Stage>
}

// One blinking caret per friend, in box-local coords, ready to drop into a Group transformed
// like the box (so it pans/zooms/rotates with it).
interface CaretPos {
  uid: string
  color: string
  // box geometry, for the wrapping Group
  bx: number
  by: number
  bw: number
  bh: number
  rot: number
  // caret rectangle, relative to the box top-left
  x: number
  y: number
  h: number
}

// Konva.Text lays out the (wrapped, centered) text into `textArr`; we reuse THAT layout
// rather than re-implementing word-wrap, so the caret always lands on the same line/column
// Konva actually drew. Reading these internals mirrors how wigglyText.ts already does.
type KText = Konva.Text & {
  textArr: { text: string; width: number }[]
  _getTextWidth: (s: string) => number
}

const BLINK_MS = 530

export function RemoteTextCaret({ focuses, strokes, zoom, stageRef }: Props) {
  const [carets, setCarets] = useState<CaretPos[]>([])
  const [on, setOn] = useState(true)

  // Blink. Reset to visible whenever the set/positions change so a moving caret is never
  // caught mid-blink-off.
  useEffect(() => {
    setOn(true)
    const id = setInterval(() => setOn((v) => !v), BLINK_MS)
    return () => clearInterval(id)
  }, [carets])

  // Recompute after commit (useLayoutEffect → react-konva has already applied the live text
  // to the Konva node, so textArr reflects the current text) and before paint, to avoid lag.
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      setCarets([])
      return
    }
    const next: CaretPos[] = []
    for (const { uid, focus } of focuses) {
      if (!focus.editing || focus.caret == null) continue
      const s = strokes.find((st) => st.id === focus.boxId && st.type === 'text')
      if (!s) continue
      const node = stage.findOne<KText>('#' + focus.boxId)
      if (!node) continue

      const d = s.data
      const bw = d.width ?? MIN_TEXT_WIDTH
      const bh = d.height ?? MIN_TEXT_HEIGHT
      const bx = d.x ?? 0
      const by = d.y ?? 0
      const rot = d.rotation ?? 0

      const fontSize = node.fontSize()
      const lineH = fontSize * node.lineHeight()
      const pad = node.padding()
      const innerW = bw - pad * 2
      const innerH = bh - pad * 2
      const align = node.align()
      const vAlign = node.verticalAlign()
      const measure = (str: string) => node._getTextWidth(str)

      const text = focus.text ?? ''
      const caret = Math.max(0, Math.min(focus.caret, text.length))
      // Empty box shows a faint "Text" placeholder; the caret belongs at the centred start.
      const lines = text.length === 0 ? [{ text: '', width: 0 }] : node.textArr
      if (!lines || lines.length === 0) continue

      // Map the global caret offset to (lineIdx, col). Konva drops the single space at a
      // soft-wrap boundary and the '\n' at a hard break, so we re-find each line's text in
      // the original string starting just past the previous line to absorb that gap.
      let pos = 0
      let lineIdx = lines.length - 1
      let col = lines[lineIdx].text.length
      for (let i = 0; i < lines.length; i++) {
        const lt = lines[i].text
        let start = text.indexOf(lt, pos)
        if (start < 0) start = pos
        const end = start + lt.length
        if (caret <= end || i === lines.length - 1) {
          lineIdx = i
          col = caret < start ? 0 : Math.min(caret, end) - start
          break
        }
        pos = end
      }

      const lt = lines[lineIdx].text
      const lineW = lines[lineIdx].width
      let lineLeft = pad
      if (align === 'center') lineLeft = pad + (innerW - lineW) / 2
      else if (align === 'right') lineLeft = pad + innerW - lineW
      const caretX = lineLeft + measure(lt.slice(0, col))

      const totalH = lines.length * lineH
      let top = pad
      if (vAlign === 'middle') top = pad + (innerH - totalH) / 2
      else if (vAlign === 'bottom') top = pad + (innerH - totalH)
      const caretY = top + lineIdx * lineH

      next.push({
        uid,
        color: focus.color,
        bx,
        by,
        bw,
        bh,
        rot,
        x: caretX,
        y: caretY,
        h: lineH,
      })
    }
    setCarets(next)
  }, [focuses, strokes, zoom, stageRef])

  return (
    <>
      {carets.map((c) => (
        <Group
          key={c.uid}
          x={c.bx + c.bw / 2}
          y={c.by + c.bh / 2}
          offsetX={c.bw / 2}
          offsetY={c.bh / 2}
          rotation={c.rot}
          listening={false}
        >
          <Rect
            x={c.x}
            y={c.y}
            width={2 / zoom}
            height={c.h}
            fill={c.color}
            cornerRadius={1 / zoom}
            visible={on}
          />
        </Group>
      ))}
    </>
  )
}
