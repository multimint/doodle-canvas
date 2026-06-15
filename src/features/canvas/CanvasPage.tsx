import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import type Konva from 'konva'
import { db } from '../../lib/firebase'
import { useAuth } from '../auth/useAuth'
import { useStrokes } from './hooks/useStrokes'
import { useCursors } from './hooks/useCursors'
import { usePresence } from './hooks/usePresence'
import { useUndoStack } from './hooks/useUndoStack'
import { useLiveStrokes } from './hooks/useLiveStrokes'
import type { LiveStroke } from './hooks/useLiveStrokes'
import { useSnapshot } from './hooks/useSnapshot'
import { useRestore } from './hooks/useRestore'
import { DrawingStage } from './components/DrawingStage'
import { Toolbar } from './components/Toolbar'
import { CursorOverlay } from './components/CursorOverlay'
import { PresenceBar } from './components/PresenceBar'
import { InviteModal } from '../sharing/InviteModal'
import { pickUserColor, STROKE_CAP } from '../../lib/types'
import type { CanvasDoc, Stroke, ToolType } from '../../lib/types'

export function CanvasPage() {
  const { canvasId } = useParams<{ canvasId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const uid = user!.uid
  const userColor = pickUserColor(uid)

  const [canvasDoc, setCanvasDoc] = useState<CanvasDoc | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [viewport, setViewport] = useState({ zoom: 1, pan: { x: 0, y: 0 } })

  const stageRef = useRef<Konva.Stage>(null)
  const prevToolRef = useRef<ToolType>('pen')
  const toolRef = useRef<ToolType>('pen')
  const spaceActivatedHandRef = useRef(false)

  const [tool, setTool] = useState<ToolType>('pen')
  const [color, setColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(4)

  // Keep toolRef current for use in key handlers
  useEffect(() => { toolRef.current = tool }, [tool])

  useEffect(() => {
    if (!canvasId) return
    const unsub = onSnapshot(doc(db, 'canvases', canvasId), (snap) => {
      if (!snap.exists()) { navigate('/'); return }
      const data = { id: snap.id, ...snap.data() } as CanvasDoc
      if (data.ownerId !== uid && !data.members.includes(uid)) { navigate('/'); return }
      setCanvasDoc(data)
      setLoadingDoc(false)
    })
    return unsub
  }, [canvasId, uid, navigate])

  const { strokes, strokesLoaded, atCap, addStroke, deleteStroke, clearAllStrokes } = useStrokes(canvasId!)
  const { cursors, emitCursor, clearCursor } = useCursors(canvasId!, uid, userColor)
  const { remoteStrokes, emitLiveStroke, clearLiveStroke } = useLiveStrokes(canvasId!, uid)
  const { presence, isLeader } = usePresence({
    canvasId: canvasId!,
    uid,
    displayName: user!.displayName ?? 'Anonymous',
    photoURL: user!.photoURL ?? '',
    color: userColor,
  })
  useSnapshot({ canvasId: canvasId!, isLeader, strokes })
  useRestore({
    canvasId: canvasId!,
    isLeader,
    strokesLoaded,
    strokeCount: strokes.length,
    snapshotStrokeIds: canvasDoc?.snapshotStrokeIds,
    snapshotAt: canvasDoc?.snapshotAt,
  })

  const { push: pushUndo, pop: popUndo } = useUndoStack()

  const handleStrokeComplete = useCallback(async (stroke: Omit<Stroke, 'id'>) => {
    if (atCap) return
    const strokeId = await addStroke({ ...stroke, authorId: uid })
    pushUndo(strokeId)
  }, [atCap, uid, addStroke, pushUndo])

  const handleUndo = useCallback(async () => {
    const strokeId = popUndo()
    if (!strokeId) return
    try { await deleteStroke(strokeId) } catch { /* already deleted */ }
  }, [popUndo, deleteStroke])

  const handleDeleteStroke = useCallback(async (strokeId: string) => {
    await deleteStroke(strokeId)
  }, [deleteStroke])

  const handleClearCanvas = useCallback(async () => {
    if (!confirm('Clear all strokes on this canvas? This cannot be undone.')) return
    await clearAllStrokes()
  }, [clearAllStrokes])

  const handleViewportChange = useCallback((zoom: number, pan: { x: number; y: number }) => {
    setViewport({ zoom, pan })
  }, [])

  const handleLiveUpdate = useCallback((data: LiveStroke | null) => {
    if (data) emitLiveStroke(data); else clearLiveStroke()
  }, [emitLiveStroke, clearLiveStroke])

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        handleUndo()
        return
      }
      if (e.code === 'Space' && !isTyping(e)) {
        e.preventDefault()
        if (toolRef.current !== 'hand') {
          prevToolRef.current = toolRef.current
          spaceActivatedHandRef.current = true
          setTool('hand')
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        if (spaceActivatedHandRef.current) {
          spaceActivatedHandRef.current = false
          // Only restore if the user hasn't manually switched tool while Space was held
          if (toolRef.current === 'hand') {
            setTool(prevToolRef.current)
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [handleUndo])

  const displayNames: Record<string, string> = {}
  Object.entries(presence).forEach(([id, entry]) => { displayNames[id] = entry.displayName })

  if (loadingDoc) return (
    <div className="flex items-center justify-center h-dvh paper-dots">
      <div className="spinner" />
    </div>
  )
  if (!canvasDoc) return null

  const isOwner = canvasDoc.ownerId === uid

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      {/* Topbar */}
      <div className="flex items-center gap-2 px-4 h-14 bg-white border-b-[3px] border-ink shadow-hard-sm shrink-0">
        <button
          className="font-body text-sm px-3 py-1 border-2 border-ink transition-all duration-100 hover:bg-muted shrink-0"
          style={{ borderRadius: '55px 15px 55px 15px / 15px 55px 15px 55px' }}
          onClick={() => navigate('/')}
        >
          ← Dashboard
        </button>

        <span className="font-hand text-lg text-ink flex-1 text-center truncate px-2">
          {canvasDoc.title}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <PresenceBar presence={presence} currentUid={uid} />

          {isOwner && (
            <button
              className="font-body text-sm px-3 py-1 bg-blue-pen text-white border-[3px] border-ink shadow-hard-sm transition-all duration-100 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}
              onClick={() => setShowInvite(true)}
            >
              Share
            </button>
          )}

          <button
            className="font-body text-sm px-3 py-1 border-2 border-ink transition-all duration-100 hover:bg-muted"
            style={{ borderRadius: '55px 15px 55px 15px / 15px 55px 15px 55px' }}
            onClick={handleUndo}
            title="Undo (Ctrl+Z)"
          >
            ↩ Undo
          </button>

          <button
            className="font-body text-sm px-3 py-1 border-2 border-ink text-accent transition-all duration-100 hover:bg-accent hover:text-white"
            style={{ borderRadius: '55px 15px 55px 15px / 15px 55px 15px 55px' }}
            onClick={handleClearCanvas}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Cap banner */}
      {atCap && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white font-body text-sm shrink-0 border-b-2 border-ink">
          Canvas is full ({STROKE_CAP} strokes). Double-click any stroke to delete it, or{' '}
          <button className="underline font-bold" onClick={handleClearCanvas}>clear all</button>.
        </div>
      )}

      {/* Workspace */}
      <div className="flex flex-1 overflow-hidden">
        <Toolbar
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          onToolChange={setTool}
          onColorChange={setColor}
          onStrokeWidthChange={setStrokeWidth}
        />

        <div className="flex-1 overflow-hidden paper-dots">
          <DrawingStage
            strokes={strokes}
            tool={tool}
            color={color}
            strokeWidth={strokeWidth}
            disabled={atCap}
            onStrokeComplete={handleStrokeComplete}
            onMouseMove={emitCursor}
            onMouseLeave={clearCursor}
            onDeleteStroke={handleDeleteStroke}
            onViewportChange={handleViewportChange}
            stageRef={stageRef}
            overlay={<CursorOverlay cursors={cursors} zoom={viewport.zoom} pan={viewport.pan} displayNames={displayNames} />}
            remoteStrokes={remoteStrokes}
            onLiveUpdate={handleLiveUpdate}
          />
        </div>
      </div>

      {showInvite && (
        <InviteModal canvas={canvasDoc} onClose={() => setShowInvite(false)} />
      )}
    </div>
  )
}
