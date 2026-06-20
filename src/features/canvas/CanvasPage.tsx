import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, updateDoc, deleteField } from 'firebase/firestore'
import { ref, get, set } from 'firebase/database'
import { linkWithPopup, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import type Konva from 'konva'
import { auth, db, rtdb } from '../../lib/firebase'
import { useAuth } from '../auth/useAuth'
import { useStrokes } from './hooks/useStrokes'
import { useCursors } from './hooks/useCursors'
import { useTextPresence } from './hooks/useTextPresence'
import { usePresence } from './hooks/usePresence'
import { useUndoStack } from './hooks/useUndoStack'
import { useLiveStrokes } from './hooks/useLiveStrokes'
import type { LiveStroke } from './hooks/useLiveStrokes'
import { DrawingStage } from './components/DrawingStage'
import { stepStrokeWidth } from './utils/strokeSize'
import type { NavHandle } from './components/DrawingStage'
import { CanvasTopBar } from './components/CanvasTopBar'
import { useCanvasKeyboard } from './hooks/useCanvasKeyboard'
import { Toolbar } from './components/Toolbar'
import { CursorOverlay } from './components/CursorOverlay'
import { Minimap } from './components/Minimap'
import type { MinimapHandle } from './components/Minimap'
import { ZoomControls } from './components/ZoomControls'
import { InviteModal } from '../sharing/InviteModal'
import { ConfirmModal } from '../../lib/ConfirmModal'
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
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [modal, setModal] = useState<{
    title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void
  } | null>(null)

  const stageRef      = useRef<Konva.Stage>(null)
  const navRef        = useRef<NavHandle | null>(null)
  const minimapHandle = useRef<MinimapHandle | null>(null)
  const toolRef = useRef<ToolType>('pen')

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [tool, setTool] = useState<ToolType>('pen')
  const [color, setColor] = useState('#14151c')
  const [strokeWidth, setStrokeWidth] = useState(6)
  const [wiggle] = useState(true)

  // The eraser paints (and its cursor ring shows) at a multiple of the chosen size. This
  // flows to the committed eraser stroke, its follower cursor, AND the cursor broadcast to
  // friends, so everyone sees the same footprint.
  const ERASER_SCALE = 4
  const effectiveStrokeWidth =
    tool === 'eraser' ? strokeWidth * ERASER_SCALE : strokeWidth

  useEffect(() => { toolRef.current = tool }, [tool])

  useEffect(() => {
    if (!canvasId) return
    const unsub = onSnapshot(doc(db, 'canvases', canvasId), (snap) => {
      if (!snap.exists()) { navigate('/'); return }
      const data = { id: snap.id, ...snap.data() } as CanvasDoc
      if (data.ownerId !== uid && !data.members.includes(uid)) { navigate('/'); return }
      setCanvasDoc(data)
      setLoadingDoc(false)
    }, () => navigate('/'))
    return unsub
  }, [canvasId, uid, navigate])

  useEffect(() => {
    if (!canvasId) return
    set(ref(rtdb, `canvases/${canvasId}/access/members/${uid}`), true).catch(console.error)
  }, [canvasId, uid])

  useEffect(() => {
    if (!canvasId || !canvasDoc || canvasDoc.ownerId !== uid) return
    const ownerRef = ref(rtdb, `canvases/${canvasId}/access/ownerId`)
    get(ownerRef).then(snap => { if (!snap.exists()) return set(ownerRef, uid) }).catch(console.error)
  }, [canvasId, canvasDoc?.ownerId, uid])

  const { strokes, atCap, addStroke, updateStroke, deleteStroke, clearAllStrokes } = useStrokes(canvasId!)
  const { cursors, emitCursor, clearCursor } = useCursors(canvasId!, uid, userColor, tool, effectiveStrokeWidth)
  const { remoteFocus: remoteTextFocus, setTextFocus } = useTextPresence(canvasId!, uid, userColor)
  const { remoteStrokes, emitLiveStroke, clearLiveStroke } = useLiveStrokes(canvasId!, uid)
  const { presence } = usePresence({
    canvasId: canvasId!,
    uid,
    displayName: user!.displayName ?? 'Anonymous',
    photoURL: user!.photoURL ?? '',
    color: userColor,
  })
  const { push, pop: popUndo, pushRedo, popRedo } = useUndoStack()

  const handleTitleSave = useCallback(async () => {
    const trimmed = titleDraft.trim()
    setEditingTitle(false)
    if (!trimmed || trimmed === canvasDoc?.title) return
    try {
      await updateDoc(doc(db, 'canvases', canvasId!), { title: trimmed })
    } catch (err) {
      console.error('Failed to rename canvas:', err)
    }
  }, [titleDraft, canvasDoc?.title, canvasId])

  const handleGuestSignIn = useCallback(async () => {
    try {
      await linkWithPopup(user!, new GoogleAuthProvider())
      await updateDoc(doc(db, 'canvases', canvasId!), { deleteAt: deleteField() })
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === 'auth/credential-already-in-use') {
        setModal({
          title: 'Account already exists',
          message: 'This Google account already has an account. Your guest canvas will be lost if you sign in.',
          confirmLabel: 'Sign in anyway',
          danger: true,
          onConfirm: async () => {
            setModal(null)
            try {
              await signInWithPopup(auth, new GoogleAuthProvider())
            } catch { /* stay as guest */ }
          },
        })
      }
    }
  }, [canvasId])

  // Mouse-wheel resize from DrawingStage: step the base size (never the eraser-scaled
  // value) so the eraser keeps its 4x footprint relative to the chosen size.
  const handleResizeStroke = useCallback((dir: 1 | -1) => {
    setStrokeWidth((w) => stepStrokeWidth(w, dir))
  }, [])

  const handleStrokeComplete = useCallback(async (stroke: Omit<Stroke, 'id'>) => {
    if (atCap) return
    const strokeId = await addStroke({ ...stroke, authorId: uid })
    push(strokeId)
  }, [atCap, uid, addStroke, push])

  const handleUndo = useCallback(async () => {
    const strokeId = popUndo()
    if (!strokeId) return
    const stroke = strokes.find(s => s.id === strokeId)
    if (stroke) {
      const { id: _id, ...strokeData } = stroke
      pushRedo(strokeData)
    }
    try { await deleteStroke(strokeId) } catch { /* already deleted */ }
  }, [popUndo, deleteStroke, strokes, pushRedo])

  const handleRedo = useCallback(async () => {
    const stroke = popRedo()
    if (!stroke) return
    const strokeId = await addStroke(stroke)
    push(strokeId)
  }, [popRedo, addStroke, push])

  const handleDeleteStroke = useCallback(async (strokeId: string) => {
    await deleteStroke(strokeId)
  }, [deleteStroke])

  const handleClearCanvas = useCallback(() => {
    setModal({
      title: 'Clear canvas?',
      message: 'All strokes will be permanently erased. This cannot be undone.',
      confirmLabel: 'Clear all',
      danger: true,
      onConfirm: async () => {
        setModal(null)
        await clearAllStrokes()
      },
    })
  }, [clearAllStrokes])

  const handleViewportChange = useCallback((zoom: number, pan: { x: number; y: number }) => {
    setViewport({ zoom, pan })
  }, [])

  const handleLiveUpdate = useCallback((data: LiveStroke | null) => {
    if (data) emitLiveStroke(data); else clearLiveStroke()
  }, [emitLiveStroke, clearLiveStroke])

  useCanvasKeyboard({ toolRef, setTool, onUndo: handleUndo, onRedo: handleRedo })

  const displayNames: Record<string, string> = {}
  Object.entries(presence).forEach(([id, entry]) => { displayNames[id] = entry.displayName })

  const presenceEntries = Object.entries(presence)

  if (loadingDoc) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--m-bg)' }}>
      <div className="spinner" />
    </div>
  )
  if (!canvasDoc) return null

  const isOwner = canvasDoc.ownerId === uid

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--m-bg)' }}>
      <CanvasTopBar
        title={canvasDoc.title}
        isOwner={isOwner}
        editingTitle={editingTitle}
        titleDraft={titleDraft}
        setTitleDraft={setTitleDraft}
        onTitleSave={handleTitleSave}
        onTitleEditStart={() => { setTitleDraft(canvasDoc.title); setEditingTitle(true) }}
        onTitleEditCancel={() => setEditingTitle(false)}
        presenceEntries={presenceEntries}
        uid={uid}
        onBack={() => navigate('/')}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onShare={() => setShowInvite(true)}
      />

      {/* Guest banner */}
      {user!.isAnonymous && (
        <div
          className="m-row"
          style={{
            justifyContent: 'center', gap: 12, padding: '9px 16px',
            background: 'color-mix(in oklab, var(--m-primary) 8%, transparent)',
            borderBottom: '1px solid color-mix(in oklab, var(--m-primary) 20%, transparent)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 13.5, color: 'var(--m-ink-2)' }}>
            Your canvas will be deleted in 7 days —
          </span>
          <button
            className="m-btn m-btn-primary m-btn-sm"
            onClick={handleGuestSignIn}
            style={{ padding: '7px 14px' }}
          >
            Sign in with Google to keep it
          </button>
        </div>
      )}

      {/* Cap banner */}
      {atCap && (
        <div
          className="m-row"
          style={{
            justifyContent: 'center', gap: 8, padding: '9px 16px',
            background: 'var(--m-coral)', color: '#fff', fontSize: 13.5, flexShrink: 0,
          }}
        >
          Canvas is full ({STROKE_CAP} strokes). Double-click any stroke to delete it, or{' '}
          <button
            onClick={handleClearCanvas}
            style={{ textDecoration: 'underline', fontWeight: 700, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
          >
            clear all
          </button>
        </div>
      )}

      {/* Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
        {!isMobile && (
          <Toolbar
            tool={tool}
            color={color}
            strokeWidth={strokeWidth}
            onToolChange={setTool}
            onColorChange={setColor}
            onStrokeWidthChange={setStrokeWidth}
            onClear={handleClearCanvas}
          />
        )}

        {/* The dot grid pans WITH the canvas (background-position follows the pan offset) but
            keeps a fixed 26px spacing — background-size is not scaled by zoom, so the gap
            between dots stays constant as you zoom in/out. */}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            position: 'relative',
            backgroundPosition: `${viewport.pan.x}px ${viewport.pan.y}px`,
          }}
          className="m-canvas-surface"
        >
          <DrawingStage
            strokes={strokes}
            tool={tool}
            color={color}
            strokeWidth={effectiveStrokeWidth}
            disabled={atCap}
            onStrokeComplete={handleStrokeComplete}
            onMouseMove={emitCursor}
            onMouseLeave={clearCursor}
            onDeleteStroke={handleDeleteStroke}
            onUpdateStroke={updateStroke}
            onToolChange={setTool}
            onResizeStroke={handleResizeStroke}
            onViewportChange={handleViewportChange}
            stageRef={stageRef}
            navRef={navRef}
            overlay={<CursorOverlay cursors={cursors} zoom={viewport.zoom} pan={viewport.pan} displayNames={displayNames} />}
            remoteStrokes={remoteStrokes}
            onLiveUpdate={handleLiveUpdate}
            wiggle={wiggle}
            remoteTextFocus={remoteTextFocus}
            onTextFocus={setTextFocus}
            displayNames={displayNames}
          />
          {!isMobile && (
            <>
              <ZoomControls navHandle={navRef} stageRef={stageRef} viewport={viewport} minimapHandle={minimapHandle} />
              <Minimap navHandle={navRef} stageRef={stageRef} viewport={viewport} strokes={strokes} minimapHandle={minimapHandle} />
            </>
          )}
        </div>

        {isMobile && (
          <Toolbar
            tool={tool}
            color={color}
            strokeWidth={strokeWidth}
            onToolChange={setTool}
            onColorChange={setColor}
            onStrokeWidthChange={setStrokeWidth}
            onClear={handleClearCanvas}
            horizontal
          />
        )}
      </div>

      {showInvite && (
        <InviteModal canvas={canvasDoc} presenceUids={Object.keys(presence)} onClose={() => setShowInvite(false)} />
      )}

      {modal && (
        <ConfirmModal
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          danger={modal.danger}
          onConfirm={modal.onConfirm}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  )
}
