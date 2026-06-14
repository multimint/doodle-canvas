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

  if (loadingDoc) return <div className="loading-screen"><div className="spinner" /></div>
  if (!canvasDoc) return null

  const isOwner = canvasDoc.ownerId === uid

  return (
    <div className="canvas-page">
      <div className="canvas-topbar">
        <button className="btn-ghost" onClick={() => navigate('/')}>← Dashboard</button>
        <span className="canvas-title">{canvasDoc.title}</span>
        <div className="canvas-topbar-right">
          <PresenceBar presence={presence} currentUid={uid} />
          {isOwner && (
            <button className="btn-secondary" onClick={() => setShowInvite(true)}>Share</button>
          )}
          <button className="btn-ghost" onClick={handleUndo} title="Undo (Ctrl+Z)">↩ Undo</button>
          <button className="btn-ghost btn-danger" onClick={handleClearCanvas}>Clear</button>
        </div>
      </div>

      {atCap && (
        <div className="cap-banner">
          Canvas is full ({STROKE_CAP} strokes). Double-click any stroke to delete it, or{' '}
          <button className="cap-banner-btn" onClick={handleClearCanvas}>clear all</button>.
        </div>
      )}

      <div className="canvas-workspace">
        <Toolbar
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          onToolChange={setTool}
          onColorChange={setColor}
          onStrokeWidthChange={setStrokeWidth}
        />

        <div className="canvas-area">
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
          />
          <CursorOverlay cursors={cursors} scale={cursorScale} displayNames={displayNames} />
        </div>
      </div>

      {showInvite && (
        <InviteModal canvas={canvasDoc} onClose={() => setShowInvite(false)} />
      )}
    </div>
  )
}
