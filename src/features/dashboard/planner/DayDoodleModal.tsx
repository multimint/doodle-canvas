import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../../../lib/icons'
import type { Stroke, StrokeData, ToolType } from '../../../lib/types'
import { CanvasStage } from '../../canvas/components/CanvasStage'
import { Toolbar } from '../../canvas/components/Toolbar'
import { toolbarTools } from '../../canvas/tools/registry'
import { stepStrokeWidth } from '../../canvas/utils/strokeSize'
import { DateBadge } from './DateBadge'
import {
  DAY_FRAME,
  MAX_DOODLE_POINTS,
  doodlePointCount,
  loadDoodle,
  saveDoodle,
} from './dayDoodle'

// The doodle toolbar: the full draw-tools row minus the shape tools (line/rect/circle), per the
// chosen toolset. The horizontal Toolbar variant already omits the hand/pan tool.
const DOODLE_TOOLS = toolbarTools().filter(
  (t) => t.id !== 'line' && t.id !== 'rect' && t.id !== 'circle',
)

const ERASER_SCALE = 4
const SAVE_DEBOUNCE_MS = 800

const fmtShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const fmtFull = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

interface Props {
  uid: string
  date: Date
  isoDate: string
  onClose: () => void
}

// Pops a date card into a small drawing surface: a fixed 120×90 "limitation frame" (CanvasStage in
// lockView) plus the doodle toolbar and a placeholder for the day's documents. The drawing is the
// day's Day Doodle, loaded from / saved to users/{uid}/dayDoodles/{isoDate}. The date label is not
// drawable. Reuses the whole canvas drawing surface — only the stroke store is local.
export function DayDoodleModal({ uid, date, isoDate, onClose }: Props) {
  const [closing, setClosing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [strokes, setStrokes] = useState<Stroke[]>([])

  const [tool, setTool] = useState<ToolType>('pen')
  const [color, setColor] = useState('#14151c')
  const [strokeWidth, setStrokeWidth] = useState(6)
  const [selectedSticker, setSelectedSticker] = useState('flower')
  // Set once load resolves: a fresh (empty) card opens with an editing text box ready to type.
  const [seedText, setSeedText] = useState<{
    x: number; y: number; width: number; height: number; fontSize: number; color: string
  } | null>(null)

  // Mirror of strokes for synchronous reads inside event handlers (avoids stale closures and
  // render-phase side effects from functional setState updaters).
  const strokesRef = useRef<Stroke[]>([])
  const undoStack = useRef<string[]>([])
  const dirtyRef = useRef<Stroke[] | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  const effectiveStrokeWidth = tool === 'eraser' ? strokeWidth * ERASER_SCALE : strokeWidth

  // Load this day's doodle once.
  useEffect(() => {
    let alive = true
    loadDoodle(uid, isoDate)
      .then((s) => {
        if (!alive) return
        strokesRef.current = s
        setStrokes(s)
        // Fresh card: start with an empty text box (centred, ~1/2 width) in edit mode, and leave
        // the canvas idle (select) so typing isn't interrupted by a stray stroke.
        if (s.length === 0) {
          const w = DAY_FRAME.width * 0.6
          const h = DAY_FRAME.height * 0.3
          setSeedText({
            x: (DAY_FRAME.width - w) / 2,
            y: (DAY_FRAME.height - h) / 2,
            width: w,
            height: h,
            fontSize: 64, // 2× the stroke-width-derived default, so the note text reads large
            color: '#14151c',
          })
          setTool('select')
        }
        setLoaded(true)
      })
      .catch(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [uid, isoDate])

  const flush = useCallback(() => {
    if (saveTimer.current !== undefined) {
      clearTimeout(saveTimer.current)
      saveTimer.current = undefined
    }
    if (dirtyRef.current) {
      const pending = dirtyRef.current
      dirtyRef.current = null
      saveDoodle(uid, isoDate, pending).catch((e) => console.error('Failed to save doodle', e))
    }
  }, [uid, isoDate])

  // Persist the current drawing. Debounced to bound write amplification (see ADR 0003); the
  // close path flushes synchronously.
  const commit = useCallback(
    (next: Stroke[]) => {
      strokesRef.current = next
      setStrokes(next)
      dirtyRef.current = next
      if (saveTimer.current !== undefined) clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS)
    },
    [flush],
  )

  // Flush any pending save when the modal unmounts.
  useEffect(() => () => flush(), [flush])

  const handleClose = useCallback(() => {
    flush()
    setClosing(true)
    setTimeout(onClose, 200)
  }, [flush, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't steal Escape while typing into a text box.
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement)) handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  const handleStrokeComplete = useCallback(
    (stroke: Omit<Stroke, 'id'>) => {
      const full: Stroke = { ...stroke, id: crypto.randomUUID(), authorId: uid }
      const next = [...strokesRef.current, full]
      // Size-aware cap against Firestore's 1 MiB inline-doc limit.
      if (doodlePointCount(next) > MAX_DOODLE_POINTS) return
      undoStack.current.push(full.id)
      commit(next)
    },
    [commit, uid],
  )

  const handleDeleteStroke = useCallback(
    (id: string) => {
      commit(strokesRef.current.filter((s) => s.id !== id))
    },
    [commit],
  )

  const handleUpdateStroke = useCallback(
    (id: string, patch: Partial<StrokeData>) => {
      commit(
        strokesRef.current.map((s) =>
          s.id === id ? { ...s, data: { ...s.data, ...patch } } : s,
        ),
      )
    },
    [commit],
  )

  const handleUndo = useCallback(() => {
    const id = undoStack.current.pop()
    if (!id) return
    commit(strokesRef.current.filter((s) => s.id !== id))
  }, [commit])

  const handleResizeStroke = useCallback((dir: 1 | -1) => {
    setStrokeWidth((w) => stepStrokeWidth(w, dir))
  }, [])

  const handleClear = useCallback(() => {
    undoStack.current = []
    commit([])
  }, [commit])

  const noop = useCallback(() => {}, [])

  return (
    <div
      className={closing ? 'm-modal-overlay m-modal-overlay-out' : 'm-modal-overlay'}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        className={`m-modal ${closing ? 'm-pop-out' : 'm-pop-in'}`}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ width: 'min(92vw, 460px)', overflow: 'visible' }}
      >
        {/* Header — the date (not drawable) + undo / close. */}
        <div className="m-row m-between" style={{ alignItems: 'flex-start', gap: 8 }}>
          <div className="m-col" style={{ gap: 2 }}>
            <div className="m-h3">{fmtShort.format(date)}</div>
            <span className="m-tiny m-faint">{fmtFull.format(date)}</span>
          </div>
          <div className="m-row m-g8" style={{ alignItems: 'center' }}>
            <button className="m-tool" title="Undo" onClick={handleUndo}>
              <Icon name="undo" size={16} />
            </button>
            <button
              className="m-tool"
              title="Close"
              onClick={handleClose}
              style={{ fontSize: 16, lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* The limitation frame — fixed-ratio, scaled to fill, no pan/zoom. A size container so the
            date preview matches the calendar card exactly. */}
        <div
          className="m-canvas-surface"
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: `${DAY_FRAME.width} / ${DAY_FRAME.height}`,
            containerType: 'inline-size',
            marginTop: 12,
            borderRadius: 14,
            overflow: 'hidden',
            border: '1.5px solid var(--m-line-2)',
            background: 'var(--m-surface)',
            touchAction: 'none',
          }}
        >
          {loaded && (
            <CanvasStage
              strokes={strokes}
              tool={tool}
              color={color}
              strokeWidth={effectiveStrokeWidth}
              disabled={false}
              lockView
              worldWidth={DAY_FRAME.width}
              worldHeight={DAY_FRAME.height}
              initialTextBox={seedText}
              keepEmptyTextBox
              onStrokeComplete={handleStrokeComplete}
              onMouseMove={noop}
              onMouseLeave={noop}
              onDeleteStroke={handleDeleteStroke}
              onUpdateStroke={handleUpdateStroke}
              onToolChange={setTool}
              onResizeStroke={handleResizeStroke}
              selectedSticker={selectedSticker}
            />
          )}
          {/* The date, previewed exactly as it sits on the calendar card (not drawable). */}
          <DateBadge day={date.getDate()} />
        </div>

        {/* Doodle toolbar (no shapes; horizontal variant omits hand/pan). */}
        <div style={{ marginTop: 10, borderRadius: 12, overflow: 'visible' }}>
          <Toolbar
            tool={tool}
            color={color}
            strokeWidth={strokeWidth}
            selectedSticker={selectedSticker}
            onToolChange={setTool}
            onColorChange={setColor}
            onStrokeWidthChange={setStrokeWidth}
            onStickerChange={setSelectedSticker}
            onClear={handleClear}
            drawTools={DOODLE_TOOLS}
            showHand={false}
            horizontal
            noScroll
          />
        </div>

        {/* Save: flush the drawing and close. (Auto-save still runs as a safety net.) */}
        <div className="m-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="m-btn m-btn-primary" onClick={handleClose}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
