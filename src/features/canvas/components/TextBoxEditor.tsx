import { useState, useRef, useLayoutEffect } from 'react'

// Editor-only calibration, as a fraction of fontSize. The DOM textarea (edit state)
// and the Konva <Text> (committed) are both mathematically centered in the box, but
// canvas vs browser place glyphs on different baseline models, so the DOM text reads
// a few px down/right of the committed text. These shift ONLY the textarea to match
// the committed Konva text (the saved truth), so there's still no jump on commit.
// Positive = right / down; negative counters the observed down-right drift. Tune by eye.
const EDITOR_NUDGE_X = -0.03
const EDITOR_NUDGE_Y = -0.03

interface TextBoxEditorProps {
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  rotation: number
  color: string
  initial: string
  onCommit: (text: string) => void
  onCancel: () => void
}

// The DOM textarea that overlays a Text Box during editing. The caret must sit on the
// very text being edited, so the live text is rendered here (the Konva <Text> is hidden
// while editing) and this element is positioned/centered to match the committed text.
export function TextBoxEditor({
  x,
  y,
  width,
  height,
  fontSize,
  rotation,
  color,
  initial,
  onCommit,
  onCancel,
}: TextBoxEditorProps) {
  const [value, setValue] = useState(initial)
  // A textarea can't CSS-center its own text, so instead size the element to the
  // text (auto height) and CENTER THE ELEMENT inside the box. Its centre then
  // coincides with the box centre (same width/left, vertically centered), so the
  // text reads centered AND the rotate transform-origin stays on the box centre.
  const [top, setTop] = useState(y)
  const [taH, setTaH] = useState(height)
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)

  const recenter = () => {
    const el = ref.current
    if (!el) return
    // Collapse to 0 (NOT 'auto', which clamps to the rows attribute -> over-measures
    // short boxes) so scrollHeight is the true unclamped content height. With CSS
    // line-height:1 that equals lines × fontSize — same metric Konva verticalAlign
    // uses — so centering is accurate at any box height and matches the committed text.
    el.style.height = '0px'
    const contentH = el.scrollHeight
    // Restore height & top imperatively BEFORE calling setState. If contentH is
    // unchanged, React bails on the setState (same value → no re-render) and
    // never re-applies the inline style, leaving height stuck at 0px / text
    // invisible. Writing the correct values back to the DOM in the same
    // synchronous call guarantees the element is always sized correctly,
    // regardless of whether React re-renders. The browser won't paint between
    // synchronous JS statements, so there is no visual flash. setState still
    // runs to keep React state in sync for the next render.
    const newTop = y + (height - contentH) / 2 + fontSize * EDITOR_NUDGE_Y
    el.style.height = contentH + 'px'
    el.style.top = Math.round(newTop) + 'px'
    setTaH(contentH)
    setTop(newTop)
  }

  // useLayoutEffect (not useEffect): measure + center BEFORE the browser paints, so
  // the editor never flashes at the top-left/full-height initial position for a frame.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    recenter()
  }, [])

  // Recompute when the box moves/resizes via the handles (width reflows the text;
  // y/height move the vertical centre) so the editor tracks the outline live.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    recenter()
  }, [x, y, width, height, fontSize])

  const commit = () => {
    if (done.current) return
    done.current = true
    onCommit(value)
  }
  const cancel = () => {
    if (done.current) return
    done.current = true
    onCancel()
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      className='text-tool-textarea'
      style={{
        // Integer left/top: sub-pixel positions get resampled (blurry text). Round so
        // the glyphs land on the pixel grid.
        left: Math.round(x + fontSize * EDITOR_NUDGE_X),
        top: Math.round(top),
        width,
        height: taH,
        fontSize,
        color,
        caretColor: color,
        // Keep the transform unconditionally: it gives the textarea its own layer so it
        // paints above the Konva canvas (without it the edited text fell behind the
        // canvas and "disappeared"). rotate(0deg) is harmless for unrotated boxes.
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
      }}
      value={value}
      onChange={(e) => {
        setValue(e.target.value)
        recenter()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          commit()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          cancel()
        }
      }}
      onBlur={commit}
      placeholder='Type here…'
    />
  )
}
