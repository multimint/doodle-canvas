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
  const [cursorScale, setCursorScale] = useState(1)

  const stageRef = useRef<Konva.Stage>(null)

  const [tool, setTool] = useState<ToolType>('pen')
  const [color, setColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(4)

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

  const { strokes, atCap, addStroke, deleteStroke, clearAllStrokes } = useStrokes(canvasId!)
  const { cursors, emitCursor, clearCursor } = useCursors(canvasId!, uid, userColor)
  const presence = usePresence({
    canvasId: canvasId!,
    uid,
    displayName: user!.displayName ?? 'Anonymous',
    photoURL: user!.photoURL ?? '',
    color: userColor,
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
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

        <div className="flex-1 overflow-hidden paper-dots flex items-center justify-center">
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
            onScaleChange={setCursorScale}
            stageRef={stageRef}
            overlay={<CursorOverlay cursors={cursors} scale={cursorScale} displayNames={displayNames} />}
          />
        </div>
      </div>

      {showInvite && (
        <InviteModal canvas={canvasDoc} onClose={() => setShowInvite(false)} />
      )}
    </div>
  )
}
