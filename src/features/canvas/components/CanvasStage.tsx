import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
} from 'react'
import type {
  Stroke,
  StrokeData,
  ToolType,
  TextFocus,
  CursorPos,
} from '../../../lib/types'
import {
  buildStrokeData,
  MIN_TEXT_WIDTH,
  MIN_TEXT_HEIGHT,
  MIN_STICKER_SIZE,
} from '../utils/strokeSerializer'
import {
  textAABB,
  aabbOverlap,
  type Box,
  type AABB,
  type RotBox,
} from '../utils/textBoxGeometry'
import {
  descriptorFromLive,
  type SimpleStrokeType,
} from '../render/strokeDescriptor'
import { hashStr } from '../utils/wiggleUtils'
import { screenToWorld, viewportBounds } from '../engine/camera'
import {
  applyCamera,
  clearLayer,
  isVisible,
  drawCommitted,
} from '../engine/scene'
import { drawSimpleStroke, drawStickerStroke } from '../engine/drawStroke'
import { drawTextStroke } from '../engine/textLayout'
import { useCamera, type NavHandle } from '../hooks/useCamera'
import { useBoil } from '../engine/useBoil'
import { strokeAt } from '../engine/hitTest'
import { cursorForTool } from '../utils/cursorForTool'
import { usesToolCursor } from '../utils/toolCursor'
import { ToolCursor } from './ToolCursor'
import { BoxControls } from './BoxControls'
import { MultiSelectOverlay } from './MultiSelectOverlay'
import { RemoteTextFocus } from './RemoteTextFocus'
import { RemoteTextCaret } from './RemoteTextCaret'
import { TextBoxEditor } from './TextBoxEditor'
import { WiggleFilters } from './WiggleFilters'
import type { ActiveBox, XformBox, ActiveSticker } from './textBoxTypes'
import type { LiveStroke } from '../hooks/useLiveStrokes'

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
  onUpdateStroke?: (id: string, patch: Partial<StrokeData>) => void
  onToolChange?: (tool: ToolType) => void
  onResizeStroke?: (dir: 1 | -1) => void
  onViewportChange?: (zoom: number, pan: { x: number; y: number }) => void
  navRef?: React.MutableRefObject<NavHandle | null>
  overlay?: React.ReactNode
  remoteStrokes?: Record<string, LiveStroke>
  onLiveUpdate?: (stroke: LiveStroke | null) => void
  wiggle?: boolean
  selectedSticker?: string
  remoteTextFocus?: Record<string, TextFocus>
  onTextFocus?: (
    boxId: string | null,
    editing: boolean,
    text?: string,
    caret?: number,
  ) => void
  displayNames?: Record<string, string>
  friendCursors?: Record<string, CursorPos>
  onSelectionChange?: (sel: {
    marquee?: { x0: number; y0: number; x1: number; y1: number } | null
    selectedIds?: string[] | null
  }) => void
}

const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
// Highlighter translucency. Markers paint *opaquely* onto their own layer (so per-pixel the
// latest/topmost stroke wins and same-color overlaps never darken), and the whole layer is
// then shown at this alpha — one flat, uniform translucency regardless of how strokes nest.
const MARKER_LAYER_OPACITY = 0.82
const SIMPLE_TYPES: ToolType[] = [
  'pen',
  'marker',
  'eraser',
  'rect',
  'circle',
  'line',
]

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// The immediate-mode drawing surface. A stack of two transparent canvases (markers behind,
// everything else in front — so eraser destination-out can't reach markers) plus DOM overlays.
// One boil loop repaints the canvases ~12fps; pointer events drive the same interaction FSM the
// old Konva DrawingStage had, but world coords come from the camera and hit-testing from the
// pure hitTest module. The CSS dot grid lives behind the canvases (CanvasPage), so they stay
// transparent. Public props/callbacks match the old DrawingStage so CanvasPage is unchanged
// except for the renamed component + NavHandle.
export function CanvasStage({
  strokes,
  tool,
  color,
  strokeWidth,
  disabled,
  onStrokeComplete,
  onMouseMove,
  onMouseLeave,
  onDeleteStroke,
  onUpdateStroke,
  onToolChange,
  onResizeStroke,
  onViewportChange,
  navRef,
  overlay,
  remoteStrokes,
  onLiveUpdate,
  wiggle = true,
  selectedSticker = 'flower',
  remoteTextFocus,
  onTextFocus,
  displayNames,
  friendCursors,
  onSelectionChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const markerCanvasRef = useRef<HTMLCanvasElement>(null)
  const mainCanvasRef = useRef<HTMLCanvasElement>(null)

  const onSelectionChangeRef = useRef(onSelectionChange)
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange
  }, [onSelectionChange])

  // ── Selection / editing state (same shapes as the old DrawingStage) ──────────────────
  const [active, setActive] = useState<ActiveBox | null>(null)
  const [activeSticker, setActiveSticker] = useState<ActiveSticker | null>(null)
  const [xform, setXform] = useState<XformBox | null>(null)
  const [multiIds, setMultiIds] = useState<string[]>([])
  const [multiRect, setMultiRect] = useState<Box | null>(null)
  const [multiOffset, setMultiOffset] = useState<{ dx: number; dy: number } | null>(null)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const handleStartRef = useRef<RotBox | null>(null)

  // ── Drawing state ───────────────────────────────────────────────────────────────────
  const isDrawing = useRef(false)
  const livePointsRef = useRef<number[]>([])
  const liveStartRef = useRef<{ x: number; y: number } | null>(null)
  const [livePoints, setLivePoints] = useState<number[]>([])
  const pendingCommitRef = useRef(false)
  const strokesAtCommitRef = useRef(0)
  const strokesLenRef = useRef(strokes.length)
  strokesLenRef.current = strokes.length

  // ── Marquee / pan / body-drag transient refs ────────────────────────────────────────
  const isMarquee = useRef(false)
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const isPanning = useRef(false)
  const lastClientPos = useRef({ x: 0, y: 0 })
  // Dragging a selected text/sticker body (replaces Konva's draggable Group).
  const bodyDrag = useRef<{
    kind: 'text' | 'sticker'
    startWX: number
    startWY: number
    origX: number
    origY: number
  } | null>(null)
  // Dragging the multi-select group (replaces the draggable union Rect).
  const groupDrag = useRef<{ startWX: number; startWY: number } | null>(null)

  // ── Tool-follower cursor ─────────────────────────────────────────────────────────────
  const toolCursorRef = useRef<HTMLDivElement>(null)
  const [cursorVisible, setCursorVisible] = useState(false)
  const [isFinePointer] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: fine)').matches,
  )

  const cancelStroke = useCallback(() => {
    if (!isDrawing.current) return
    isDrawing.current = false
    livePointsRef.current = []
    liveStartRef.current = null
    setLivePoints([])
    onLiveUpdate?.(null)
  }, [onLiveUpdate])

  const getSceneCanvas = useCallback(() => mainCanvasRef.current, [])
  const {
    cam,
    camRef,
    containerSize,
    panBy,
    handleWheelZoom,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useCamera({
    containerRef,
    navRef,
    getSceneCanvas,
    onViewportChange,
    onPinchStart: cancelStroke,
  })

  // Convert a client (page) point to world coords via the live camera + container rect.
  const toWorldClient = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      const sx = clientX - (rect?.left ?? 0)
      const sy = clientY - (rect?.top ?? 0)
      return screenToWorld(camRef.current, sx, sy)
    },
    [camRef],
  )

  const clearSelection = useCallback(() => {
    setActive(null)
    setActiveSticker(null)
    setXform(null)
    setMultiIds([])
    setMultiRect(null)
    setMultiOffset(null)
    onSelectionChangeRef.current?.({ marquee: null, selectedIds: null })
  }, [])

  // Boxes whose boil pauses while selected/edited (so handles + textarea stay aligned).
  const frozenTextIds = useMemo(() => {
    const s = new Set<string>()
    if (active?.id) s.add(active.id)
    multiIds.forEach((id) => s.add(id))
    return s
  }, [active?.id, multiIds])

  // Friends' in-progress text keyed by box id (live mirror) + the focus list to outline.
  const remoteEditText = useMemo(() => {
    const m: Record<string, string> = {}
    for (const f of Object.values(remoteTextFocus ?? {})) {
      if (f.editing && f.text != null) m[f.boxId] = f.text
    }
    return m
  }, [remoteTextFocus])
  const remoteFocusList = useMemo(
    () =>
      Object.entries(remoteTextFocus ?? {}).map(([uid, focus]) => ({ uid, focus })),
    [remoteTextFocus],
  )

  // ── Render: paint both canvas layers for boil frame `frame` ──────────────────────────
  const redraw = useCallback(
    (frame: number) => {
      const mainC = mainCanvasRef.current
      const markC = markerCanvasRef.current
      if (!mainC || !markC) return
      const mctx = mainC.getContext('2d')
      const kctx = markC.getContext('2d')
      if (!mctx || !kctx) return
      const c = camRef.current
      const { w, h } = containerSize

      clearLayer(kctx, w, h, DPR)
      clearLayer(mctx, w, h, DPR)
      applyCamera(kctx, c, DPR)
      applyCamera(mctx, c, DPR)
      const bounds = viewportBounds(c, w, h)

      // Marker layer: markers + eraser masks, in timestamp order.
      for (const s of strokes) {
        if ((s.type === 'marker' || s.type === 'eraser') && isVisible(s, bounds))
          drawCommitted(kctx, s, frame, wiggle)
      }
      // Live marker / eraser mask on the marker layer.
      if (livePoints.length >= 4 && (tool === 'marker' || tool === 'eraser')) {
        const desc = descriptorFromLive({ type: tool, points: livePoints, color, strokeWidth })
        drawSimpleStroke(kctx, tool as SimpleStrokeType, desc, {
          frame,
          salt: 0,
          wiggle,
        })
      }

      // Main layer: simple shapes (pen/eraser/rect/circle/line) in order.
      for (const s of strokes) {
        if (
          s.type !== 'marker' &&
          s.type !== 'text' &&
          s.type !== 'sticker' &&
          isVisible(s, bounds)
        )
          drawCommitted(mctx, s, frame, wiggle)
      }
      // Remote live strokes (never text).
      for (const s of Object.values(remoteStrokes ?? {})) {
        if (s.points.length < 4 || s.type === 'text') continue
        const type = (s.type === 'path' ? 'path' : s.type) as SimpleStrokeType
        drawSimpleStroke(mctx, type, descriptorFromLive(s), {
          frame,
          salt: 0,
          wiggle,
        })
      }
      // This client's live simple stroke (non-marker tools draw on the main layer).
      if (livePoints.length >= 4 && SIMPLE_TYPES.includes(tool) && tool !== 'marker') {
        const type = (tool === 'pen' ? 'path' : tool) as SimpleStrokeType
        const desc = descriptorFromLive({
          type: type === 'path' ? 'path' : (tool as Stroke['type']),
          points: livePoints,
          color,
          strokeWidth,
        })
        drawSimpleStroke(mctx, type, desc, { frame, salt: 0, wiggle })
      }
      // Live text sizing rectangle (dashed) while dragging out a new box.
      if (livePoints.length >= 4 && tool === 'text') {
        const [x1, y1, x2, y2] = livePoints
        mctx.save()
        mctx.strokeStyle = color
        mctx.lineWidth = 1 / c.zoom
        mctx.setLineDash([6 / c.zoom, 4 / c.zoom])
        mctx.strokeRect(
          Math.min(x1, x2),
          Math.min(y1, y2),
          Math.abs(x2 - x1),
          Math.abs(y2 - y1),
        )
        mctx.restore()
      }

      // Live geometry overrides while a box is being moved/resized/rotated (the immediate-mode
      // stand-in for the old node-state overrides): active (single text), activeSticker, or
      // xform/multiOffset (group). Returns the data to actually draw.
      const off = multiOffset ?? { dx: 0, dy: 0 }
      const effData = (s: Stroke): StrokeData => {
        const d = s.data ?? {}
        if (s.type === 'text' && active?.id === s.id)
          return {
            ...d,
            x: active.x,
            y: active.y,
            width: active.width,
            height: active.height,
            rotation: active.rotation,
          }
        if (s.type === 'sticker' && activeSticker?.id === s.id)
          return {
            ...d,
            x: activeSticker.x,
            y: activeSticker.y,
            width: activeSticker.width,
            height: activeSticker.height,
            rotation: activeSticker.rotation,
          }
        if (multiIds.includes(s.id)) {
          if (xform?.id === s.id)
            return {
              ...d,
              x: xform.x + off.dx,
              y: xform.y + off.dy,
              width: xform.width,
              height: xform.height,
              rotation: xform.rotation,
            }
          return { ...d, x: (d.x ?? 0) + off.dx, y: (d.y ?? 0) + off.dy }
        }
        return d
      }

      // Text + stickers last (immune to the eraser, which already ran above).
      for (const s of strokes) {
        if (s.type !== 'text' && s.type !== 'sticker') continue
        if (!isVisible(s, bounds)) continue
        if (s.type === 'sticker') {
          // Freeze the boil while this sticker is selected/grouped so its handles stay aligned.
          const frozen = activeSticker?.id === s.id || multiIds.includes(s.id)
          drawStickerStroke(mctx, effData(s), frame, wiggle && !frozen, hashStr(s.id))
          continue
        }
        // text
        if (active?.id === s.id && active.editing) continue // hidden; textarea shows it
        const live = remoteEditText[s.id]
        const data = effData(s)
        const merged = live != null ? { ...data, text: live } : data
        const boxWiggle = wiggle && !frozenTextIds.has(s.id)
        drawTextStroke(mctx, merged, frame, boxWiggle)
      }
    },
    [
      strokes,
      cam,
      containerSize,
      wiggle,
      livePoints,
      tool,
      color,
      strokeWidth,
      remoteStrokes,
      remoteEditText,
      frozenTextIds,
      active,
      activeSticker,
      multiIds,
      multiOffset,
      xform,
      camRef,
    ],
  )

  const { frameRef } = useBoil(wiggle, redraw)

  // Size the canvas backing stores (DPR-aware) when the container resizes.
  useLayoutEffect(() => {
    const { w, h } = containerSize
    for (const cv of [markerCanvasRef.current, mainCanvasRef.current]) {
      if (!cv) continue
      cv.width = Math.round(w * DPR)
      cv.height = Math.round(h * DPR)
      cv.style.width = w + 'px'
      cv.style.height = h + 'px'
    }
  }, [containerSize])

  // Repaint on any render (strokes/camera/selection/live changes) at the current boil frame.
  useLayoutEffect(() => {
    redraw(frameRef.current)
  }, [redraw, frameRef])

  // Clear the live line once the Firebase-confirmed stroke arrives.
  useEffect(() => {
    if (pendingCommitRef.current && strokes.length > strokesAtCommitRef.current) {
      pendingCommitRef.current = false
      livePointsRef.current = []
      setLivePoints([])
    }
  }, [strokes])

  // Leave idle mode → clear selection (but keep an open editor for box creation).
  useEffect(() => {
    if (tool === 'select') return
    setActive((prev) => (prev && prev.editing ? prev : null))
    setActiveSticker(null)
    setXform(null)
    setMultiIds([])
    setMultiRect(null)
    setMultiOffset(null)
    onSelectionChangeRef.current?.({ marquee: null, selectedIds: null })
  }, [tool])

  useEffect(() => {
    setCursorVisible(false)
  }, [tool])

  // Broadcast our text-box focus so friends see the outline.
  useEffect(() => {
    onTextFocus?.(active?.id ?? null, !!active?.editing)
  }, [active?.id, active?.editing, onTextFocus])

  // While editing, our caret + outline stand in for the pointer — clear our cursor for friends.
  useEffect(() => {
    if (!active?.editing) return
    onMouseLeave()
  }, [active?.editing, onMouseLeave])

  // Drop the transient transform once the persisted stroke matches it.
  useEffect(() => {
    if (!xform) return
    const s = strokes.find((x) => x.id === xform.id)
    const d = s?.data
    if (
      d &&
      d.x === xform.x &&
      d.y === xform.y &&
      d.width === xform.width &&
      d.height === xform.height &&
      (d.rotation ?? 0) === xform.rotation
    )
      setXform(null)
  }, [strokes, xform])

  // Delete/Backspace removes selected box(es)/sticker (not while typing in a field).
  useEffect(() => {
    const single = active && !active.editing && active.id ? active.id : null
    const singleSticker = activeSticker?.id ?? null
    if (!single && !singleSticker && multiIds.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      e.preventDefault()
      if (multiIds.length) {
        multiIds.forEach((id) => onDeleteStroke(id))
        setMultiIds([])
        setMultiRect(null)
        setMultiOffset(null)
      } else if (singleSticker) {
        onDeleteStroke(singleSticker)
        setActiveSticker(null)
      } else if (single) {
        onDeleteStroke(single)
        setActive(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, activeSticker, multiIds, onDeleteStroke])

  // ── Selection helpers ────────────────────────────────────────────────────────────────
  const selectTextStroke = useCallback(
    (s: Stroke) => {
      setActiveSticker(null)
      setMultiIds([])
      setMultiRect(null)
      setMultiOffset(null)
      const d = s.data
      setActive({
        id: s.id,
        editing: false,
        x: d.x ?? 0,
        y: d.y ?? 0,
        width: d.width ?? MIN_TEXT_WIDTH,
        height: d.height ?? MIN_TEXT_HEIGHT,
        rotation: d.rotation ?? 0,
        fontSize: d.fontSize ?? 24,
        color: d.fill ?? d.stroke ?? '#14151c',
        strokeWidth,
        initial: d.text ?? '',
      })
    },
    [strokeWidth],
  )

  const openEditExisting = useCallback(
    (s: Stroke) => {
      const d = s.data
      setMultiIds([])
      setMultiRect(null)
      setMultiOffset(null)
      setActive({
        id: s.id,
        editing: true,
        x: d.x ?? 0,
        y: d.y ?? 0,
        width: d.width ?? MIN_TEXT_WIDTH,
        height: d.height ?? MIN_TEXT_HEIGHT,
        rotation: d.rotation ?? 0,
        fontSize: d.fontSize ?? 24,
        color: d.fill ?? d.stroke ?? '#14151c',
        strokeWidth,
        initial: d.text ?? '',
      })
    },
    [strokeWidth],
  )

  const selectStickerStroke = useCallback((s: Stroke) => {
    setActive(null)
    setXform(null)
    setMultiIds([])
    setMultiRect(null)
    setMultiOffset(null)
    const d = s.data
    const w = d.width ?? 120
    const h = d.height ?? 120
    const sz = Math.max(w, h)
    const cx = (d.x ?? 0) + w / 2
    const cy = (d.y ?? 0) + h / 2
    setActiveSticker({
      id: s.id,
      x: cx - sz / 2,
      y: cy - sz / 2,
      width: sz,
      height: sz,
      rotation: d.rotation ?? 0,
    })
  }, [])

  // ── Pointer FSM ──────────────────────────────────────────────────────────────────────
  const pointerDown = useCallback(
    (clientX: number, clientY: number, button: number) => {
      if (button !== 0) return
      const wp = toWorldClient(clientX, clientY)

      if (tool === 'hand') {
        isPanning.current = true
        if (containerRef.current) containerRef.current.style.cursor = 'grabbing'
        lastClientPos.current = { x: clientX, y: clientY }
        return
      }

      if (tool === 'select') {
        // Multi-select group: drag inside the union moves all (unless on a handle, which the
        // overlay captures first).
        if (multiIds.length > 1 && multiRect) {
          const r = multiRect
          if (
            wp.x >= r.x &&
            wp.x <= r.x + r.width &&
            wp.y >= r.y &&
            wp.y <= r.y + r.height
          ) {
            const onBox = multiIds.some((id) => {
              const s = strokes.find((k) => k.id === id)
              if (!s) return false
              const a = textAABB(s.data)
              return wp.x >= a.minX && wp.x <= a.maxX && wp.y >= a.minY && wp.y <= a.maxY
            })
            if (onBox) {
              groupDrag.current = { startWX: wp.x, startWY: wp.y }
              return
            }
            clearSelection()
            return
          }
        }

        // Hit a text or sticker → select it and begin a body drag.
        const hit = strokeAt(
          strokes,
          wp.x,
          wp.y,
          (s) => s.type === 'text' || s.type === 'sticker',
        )
        if (hit) {
          if (active?.editing) return
          if (hit.type === 'text') {
            selectTextStroke(hit)
            bodyDrag.current = {
              kind: 'text',
              startWX: wp.x,
              startWY: wp.y,
              origX: hit.data.x ?? 0,
              origY: hit.data.y ?? 0,
            }
          } else {
            selectStickerStroke(hit)
            bodyDrag.current = {
              kind: 'sticker',
              startWX: wp.x,
              startWY: wp.y,
              origX: hit.data.x ?? 0,
              origY: hit.data.y ?? 0,
            }
          }
          return
        }

        // Empty canvas → start a marquee.
        if (active?.editing) return
        clearSelection()
        isMarquee.current = true
        marqueeRef.current = { x0: wp.x, y0: wp.y, x1: wp.x, y1: wp.y }
        setMarquee(marqueeRef.current)
        return
      }

      if (disabled) return

      if (tool === 'text') {
        if (active?.editing) return
        isDrawing.current = true
        const pts = [wp.x, wp.y, wp.x, wp.y]
        livePointsRef.current = pts
        liveStartRef.current = { x: wp.x, y: wp.y }
        setLivePoints(pts)
        return
      }

      if (tool === 'sticker') {
        const data = buildStrokeData('sticker', [wp.x, wp.y], color, strokeWidth, {
          stickerId: selectedSticker,
        })
        onStrokeComplete({ type: 'sticker', authorId: '', data, timestamp: Date.now() })
        onToolChange?.('select')
        return
      }

      // Drawing tools.
      pendingCommitRef.current = false
      isDrawing.current = true
      const pts = [wp.x, wp.y, wp.x, wp.y]
      livePointsRef.current = pts
      liveStartRef.current = { x: wp.x, y: wp.y }
      setLivePoints(pts)
    },
    [
      tool,
      disabled,
      active?.editing,
      multiIds,
      multiRect,
      strokes,
      color,
      strokeWidth,
      selectedSticker,
      toWorldClient,
      clearSelection,
      selectTextStroke,
      selectStickerStroke,
      onStrokeComplete,
      onToolChange,
    ],
  )

  const pointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (active?.editing) return
      const wp = toWorldClient(clientX, clientY)

      if (tool === 'hand') {
        onMouseMove(wp.x, wp.y)
        if (!isPanning.current) return
        panBy(clientX - lastClientPos.current.x, clientY - lastClientPos.current.y)
        lastClientPos.current = { x: clientX, y: clientY }
        return
      }

      onMouseMove(wp.x, wp.y)

      // Tool follower cursor.
      if (isFinePointer && !disabled && usesToolCursor(tool)) {
        const el = toolCursorRef.current
        if (el) {
          el.style.transform = `translate(${wp.x * cam.zoom + cam.panX}px, ${
            wp.y * cam.zoom + cam.panY
          }px)`
          if (!cursorVisible) setCursorVisible(true)
        }
      }

      // Group drag.
      if (groupDrag.current) {
        setMultiOffset({
          dx: wp.x - groupDrag.current.startWX,
          dy: wp.y - groupDrag.current.startWY,
        })
        return
      }

      // Body drag of a selected text / sticker.
      if (bodyDrag.current) {
        const b = bodyDrag.current
        const nx = b.origX + (wp.x - b.startWX)
        const ny = b.origY + (wp.y - b.startWY)
        if (b.kind === 'text')
          setActive((prev) => (prev ? { ...prev, x: nx, y: ny } : prev))
        else setActiveSticker((prev) => (prev ? { ...prev, x: nx, y: ny } : prev))
        return
      }

      // Marquee.
      if (isMarquee.current && marqueeRef.current) {
        marqueeRef.current = { ...marqueeRef.current, x1: wp.x, y1: wp.y }
        setMarquee(marqueeRef.current)
        onSelectionChangeRef.current?.({ marquee: marqueeRef.current })
        return
      }

      if (!isDrawing.current) return

      let newPoints: number[]
      if (tool === 'pen' || tool === 'marker' || tool === 'eraser') {
        newPoints = [...livePointsRef.current, wp.x, wp.y]
      } else if (liveStartRef.current) {
        newPoints = [liveStartRef.current.x, liveStartRef.current.y, wp.x, wp.y]
      } else return
      livePointsRef.current = newPoints
      setLivePoints(newPoints)

      if (tool === 'text') return
      const strokeType = (tool === 'pen' ? 'path' : tool) as Stroke['type']
      onLiveUpdate?.({ type: strokeType, points: newPoints, color, strokeWidth })
    },
    [
      tool,
      active?.editing,
      disabled,
      isFinePointer,
      cursorVisible,
      cam,
      panBy,
      onMouseMove,
      onLiveUpdate,
      color,
      strokeWidth,
      toWorldClient,
    ],
  )

  const commitBodyDrag = useCallback(() => {
    if (groupDrag.current) {
      const off = multiOffset
      groupDrag.current = null
      if (off && (off.dx || off.dy)) {
        multiIds.forEach((id) => {
          const s = strokes.find((k) => k.id === id)
          if (s)
            onUpdateStroke?.(id, {
              x: (s.data.x ?? 0) + off.dx,
              y: (s.data.y ?? 0) + off.dy,
            })
        })
        if (multiRect)
          setMultiRect({ ...multiRect, x: multiRect.x + off.dx, y: multiRect.y + off.dy })
      }
      setMultiOffset(null)
      return true
    }
    if (bodyDrag.current) {
      const b = bodyDrag.current
      bodyDrag.current = null
      if (b.kind === 'text' && active?.id)
        onUpdateStroke?.(active.id, { x: active.x, y: active.y })
      else if (b.kind === 'sticker' && activeSticker?.id)
        onUpdateStroke?.(activeSticker.id, { x: activeSticker.x, y: activeSticker.y })
      return true
    }
    return false
  }, [multiOffset, multiIds, multiRect, strokes, active, activeSticker, onUpdateStroke])

  const pointerUp = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false
      if (containerRef.current) containerRef.current.style.cursor = 'grab'
      return
    }
    if (commitBodyDrag()) return

    if (isMarquee.current) {
      isMarquee.current = false
      const m = marqueeRef.current
      marqueeRef.current = null
      setMarquee(null)
      if (!m) return
      const box: AABB = {
        minX: Math.min(m.x0, m.x1),
        minY: Math.min(m.y0, m.y1),
        maxX: Math.max(m.x0, m.x1),
        maxY: Math.max(m.y0, m.y1),
      }
      const clickEps = 3 / camRef.current.zoom
      if (box.maxX - box.minX < clickEps && box.maxY - box.minY < clickEps) {
        clearSelection()
        return
      }
      const hits = strokes.filter(
        (s) =>
          (s.type === 'text' || s.type === 'sticker') &&
          aabbOverlap(box, textAABB(s.data)),
      )
      if (hits.length === 0) {
        clearSelection()
        return
      }
      if (hits.length === 1) {
        if (hits[0].type === 'text') selectTextStroke(hits[0])
        else selectStickerStroke(hits[0])
        onSelectionChangeRef.current?.({ marquee: null, selectedIds: null })
        return
      }
      const u = hits.reduce<AABB>(
        (acc, s) => {
          const a = textAABB(s.data)
          return {
            minX: Math.min(acc.minX, a.minX),
            minY: Math.min(acc.minY, a.minY),
            maxX: Math.max(acc.maxX, a.maxX),
            maxY: Math.max(acc.maxY, a.maxY),
          }
        },
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      )
      setActive(null)
      setActiveSticker(null)
      setXform(null)
      setMultiIds(hits.map((s) => s.id))
      setMultiRect({ x: u.minX, y: u.minY, width: u.maxX - u.minX, height: u.maxY - u.minY })
      setMultiOffset(null)
      onSelectionChangeRef.current?.({ marquee: null, selectedIds: hits.map((s) => s.id) })
      return
    }

    if (tool === 'hand') {
      cancelStroke()
      return
    }

    // Text: open the editor instead of committing.
    if (tool === 'text') {
      const pts = livePointsRef.current
      const start = liveStartRef.current
      isDrawing.current = false
      livePointsRef.current = []
      liveStartRef.current = null
      setLivePoints([])
      if (!start) return
      const x1 = start.x,
        y1 = start.y
      const x2 = pts[2] ?? x1,
        y2 = pts[3] ?? y1
      setActive({
        id: null,
        editing: true,
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.max(MIN_TEXT_WIDTH, Math.abs(x2 - x1)),
        height: Math.max(MIN_TEXT_HEIGHT, Math.abs(y2 - y1)),
        rotation: 0,
        fontSize: strokeWidth * 4 + 8,
        color,
        strokeWidth,
        initial: 'Text',
      })
      return
    }

    const points = livePointsRef.current
    const isDrawingTool = SIMPLE_TYPES.includes(tool)
    if (!isDrawing.current || points.length < 4 || !isDrawingTool) {
      isDrawing.current = false
      livePointsRef.current = []
      liveStartRef.current = null
      setLivePoints([])
      onLiveUpdate?.(null)
      return
    }
    isDrawing.current = false
    const rtool = tool === 'pen' ? 'path' : tool
    const data = buildStrokeData(tool, points, color, strokeWidth)
    onStrokeComplete({ type: rtool as Stroke['type'], authorId: '', data, timestamp: Date.now() })
    liveStartRef.current = null
    pendingCommitRef.current = true
    strokesAtCommitRef.current = strokesLenRef.current
    onLiveUpdate?.(null)
  }, [
    tool,
    strokes,
    color,
    strokeWidth,
    camRef,
    commitBodyDrag,
    clearSelection,
    selectTextStroke,
    selectStickerStroke,
    cancelStroke,
    onStrokeComplete,
    onLiveUpdate,
  ])

  const handleDoubleClick = useCallback(
    (clientX: number, clientY: number) => {
      if (tool !== 'select') return
      const wp = toWorldClient(clientX, clientY)
      const textHit = strokeAt(strokes, wp.x, wp.y, (s) => s.type === 'text')
      if (textHit) {
        openEditExisting(textHit)
        return
      }
      // Double-click a simple stroke to delete it (matches the old onDblClick).
      const hit = strokeAt(
        strokes,
        wp.x,
        wp.y,
        (s) => s.type !== 'text' && s.type !== 'sticker',
      )
      if (hit) onDeleteStroke(hit.id)
    },
    [tool, strokes, toWorldClient, openEditExisting, onDeleteStroke],
  )

  // Right-click drops to Select (idle).
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      if (tool !== 'select') {
        cancelStroke()
        onToolChange?.('select')
      }
    },
    [tool, cancelStroke, onToolChange],
  )

  // Wheel: zoom when idle/hand, else resize the stroke.
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (tool === 'hand' || tool === 'select') {
        const rect = containerRef.current?.getBoundingClientRect()
        handleWheelZoom(e.deltaY, e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0))
        return
      }
      onResizeStroke?.(e.deltaY < 0 ? 1 : -1)
    },
    [tool, handleWheelZoom, onResizeStroke],
  )

  // Text editor commit (create / update / clear-to-empty).
  const handleEditingCommit = useCallback(
    (text: string) => {
      if (!active) return
      const trimmed = text.trim()
      if (active.id === null) {
        if (trimmed) {
          const data = buildStrokeData(
            'text',
            [active.x, active.y, active.x + active.width, active.y + active.height],
            active.color,
            active.strokeWidth,
            { text: trimmed },
          )
          data.width = active.width
          data.height = active.height
          data.rotation = active.rotation
          onStrokeComplete({ type: 'text', authorId: '', data, timestamp: Date.now() })
        }
        onToolChange?.('select')
        setActive(null)
      } else if (trimmed) {
        onUpdateStroke?.(active.id, { text: trimmed })
        setActive(null)
      } else {
        onUpdateStroke?.(active.id, { text: '' })
        setActive(null)
      }
    },
    [active, onStrokeComplete, onUpdateStroke, onToolChange],
  )

  const showToolCursor = isFinePointer && !disabled && usesToolCursor(tool)
  const cursor = showToolCursor && cursorVisible ? 'none' : cursorForTool(tool, disabled)

  // Touch helpers (pinch on 2 fingers, otherwise draw).
  const touchPoints = (e: React.TouchEvent) =>
    Array.from(e.touches).map((t) => ({ clientX: t.clientX, clientY: t.clientY }))

  return (
    <div className='stage-container' ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      {/* Hidden SVG displacement filters the text boil warps glyph outlines through. */}
      <WiggleFilters />
      {[markerCanvasRef, mainCanvasRef].map((ref, i) => (
        <canvas
          key={i}
          ref={ref}
          style={{
            position: 'absolute',
            inset: 0,
            // Only the top canvas takes pointer input; both share the same coordinate space.
            pointerEvents: i === 1 ? 'auto' : 'none',
            // The marker layer (i === 0) is the highlighter: shown translucent as a whole.
            opacity: i === 0 ? MARKER_LAYER_OPACITY : 1,
            cursor,
            touchAction: 'none',
          }}
          onMouseDown={i === 1 ? (e) => pointerDown(e.clientX, e.clientY, e.button) : undefined}
          onMouseMove={i === 1 ? (e) => pointerMove(e.clientX, e.clientY) : undefined}
          onMouseUp={i === 1 ? pointerUp : undefined}
          onDoubleClick={i === 1 ? (e) => handleDoubleClick(e.clientX, e.clientY) : undefined}
          onContextMenu={i === 1 ? handleContextMenu : undefined}
          onWheel={i === 1 ? handleWheel : undefined}
          onMouseLeave={
            i === 1
              ? () => {
                  pointerUp()
                  onMouseLeave()
                  setCursorVisible(false)
                }
              : undefined
          }
          onTouchStart={
            i === 1
              ? (e) => {
                  if (e.touches.length === 2) handleTouchStart(touchPoints(e))
                  else pointerDown(e.touches[0].clientX, e.touches[0].clientY, 0)
                }
              : undefined
          }
          onTouchMove={
            i === 1
              ? (e) => {
                  if (e.touches.length === 2) handleTouchMove(touchPoints(e))
                  else pointerMove(e.touches[0].clientX, e.touches[0].clientY)
                }
              : undefined
          }
          onTouchEnd={
            i === 1
              ? () => {
                  handleTouchEnd()
                  pointerUp()
                }
              : undefined
          }
        />
      ))}

      {/* Remote friends' text outlines + carets. */}
      <RemoteTextFocus
        focuses={remoteFocusList}
        strokes={strokes}
        displayNames={displayNames ?? {}}
        cam={cam}
      />
      <RemoteTextCaret focuses={remoteFocusList} strokes={strokes} cam={cam} />

      {/* Marquee rubber-band. */}
      {marquee &&
        (() => {
          const mx = Math.min(marquee.x0, marquee.x1)
          const my = Math.min(marquee.y0, marquee.y1)
          const mw = Math.abs(marquee.x1 - marquee.x0)
          const mh = Math.abs(marquee.y1 - marquee.y0)
          return (
            <div
              style={{
                position: 'absolute',
                left: mx * cam.zoom + cam.panX,
                top: my * cam.zoom + cam.panY,
                width: mw * cam.zoom,
                height: mh * cam.zoom,
                border: '1px solid #3d5afe',
                background: 'rgba(61,90,254,0.12)',
                pointerEvents: 'none',
                zIndex: 4,
              }}
            />
          )
        })()}

      {/* Friends' marquees + multi-select outlines. */}
      {friendCursors &&
        Object.entries(friendCursors).map(([fuid, c]) => {
          const els: React.ReactNode[] = []
          if (c.marquee) {
            const { x0, y0, x1, y1 } = c.marquee
            els.push(
              <div
                key={`fm-${fuid}`}
                style={{
                  position: 'absolute',
                  left: Math.min(x0, x1) * cam.zoom + cam.panX,
                  top: Math.min(y0, y1) * cam.zoom + cam.panY,
                  width: Math.abs(x1 - x0) * cam.zoom,
                  height: Math.abs(y1 - y0) * cam.zoom,
                  border: `1.5px dashed ${c.color}`,
                  background: hexToRgba(c.color, 0.1),
                  pointerEvents: 'none',
                  zIndex: 4,
                }}
              />,
            )
          }
          if (c.selectedIds && c.selectedIds.length >= 2) {
            c.selectedIds.forEach((id) => {
              const s = strokes.find((k) => k.id === id)
              if (!s) return
              const a = textAABB(s.data)
              els.push(
                <div
                  key={`fs-${fuid}-${id}`}
                  style={{
                    position: 'absolute',
                    left: a.minX * cam.zoom + cam.panX,
                    top: a.minY * cam.zoom + cam.panY,
                    width: (a.maxX - a.minX) * cam.zoom,
                    height: (a.maxY - a.minY) * cam.zoom,
                    border: `1.5px dashed ${c.color}`,
                    pointerEvents: 'none',
                    zIndex: 4,
                  }}
                />,
              )
            })
          }
          return els
        })}

      {/* Single-selection handles (text or sticker). Also shown while creating a brand-new box
          (active.id === null) under the text tool, so it can be sized/rotated before committing. */}
      {active && (tool === 'select' || active.id === null) && (
        <BoxControls
          box={{
            x: active.x,
            y: active.y,
            width: active.width,
            height: active.height,
            rotation: active.rotation,
          }}
          zoom={cam.zoom}
          pan={{ x: cam.panX, y: cam.panY }}
          toWorld={toWorldClient}
          handleStartRef={handleStartRef}
          onChange={(p) => setActive((prev) => (prev ? { ...prev, ...p } : prev))}
          onCommit={(b) => {
            setActive((prev) => (prev ? { ...prev, ...b } : prev))
            if (active.id)
              onUpdateStroke?.(active.id, {
                x: b.x,
                y: b.y,
                width: b.width,
                height: b.height,
                rotation: b.rotation,
              })
          }}
        />
      )}
      {activeSticker && tool === 'select' && (
        <BoxControls
          box={{
            x: activeSticker.x,
            y: activeSticker.y,
            width: activeSticker.width,
            height: activeSticker.height,
            rotation: activeSticker.rotation,
          }}
          zoom={cam.zoom}
          pan={{ x: cam.panX, y: cam.panY }}
          toWorld={toWorldClient}
          handleStartRef={handleStartRef}
          lockAspect={1}
          minSize={MIN_STICKER_SIZE}
          onChange={(p) => setActiveSticker((prev) => (prev ? { ...prev, ...p } : prev))}
          onCommit={(b) => {
            setActiveSticker((prev) => (prev ? { ...prev, ...b } : prev))
            if (activeSticker.id)
              onUpdateStroke?.(activeSticker.id, {
                x: b.x,
                y: b.y,
                width: b.width,
                height: b.height,
                rotation: b.rotation,
              })
          }}
        />
      )}

      {/* Multi-select group chrome. */}
      {multiIds.length > 1 && multiRect && (
        <MultiSelectOverlay
          multiIds={multiIds}
          multiRect={multiRect}
          multiOffset={multiOffset}
          xform={xform}
          strokes={strokes}
          cam={cam}
          toWorld={toWorldClient}
          handleStartRef={handleStartRef}
          setXform={setXform}
          setMultiRect={setMultiRect}
          onUpdateStroke={onUpdateStroke}
        />
      )}

      {/* Text editor overlay. */}
      {active?.editing && (active.id !== null || !disabled) && (
        <TextBoxEditor
          key={active.id ?? 'new'}
          x={active.x * cam.zoom + cam.panX}
          y={active.y * cam.zoom + cam.panY}
          width={active.width * cam.zoom}
          height={active.height * cam.zoom}
          fontSize={active.fontSize * cam.zoom}
          rotation={active.rotation}
          color={active.color}
          initial={active.initial}
          selectAllOnFocus={active.id === null}
          onCommit={handleEditingCommit}
          onCancel={() => setActive(null)}
          onChange={(t, caret) => {
            if (active.id) onTextFocus?.(active.id, true, t, caret)
          }}
        />
      )}

      {showToolCursor && (
        <ToolCursor
          ref={toolCursorRef}
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          zoom={cam.zoom}
          visible={cursorVisible}
          stickerId={selectedSticker}
        />
      )}

      {overlay}
    </div>
  )
}
