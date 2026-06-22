import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { linkWithPopup, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { subscribeCanvas, setCanvasTitle, cancelCanvasDeletion } from '../../data/canvases'
import { grantMemberAccess, ensureOwnerAccess } from '../../data/access'
import { useAuth } from '../auth/useAuth'
import { useStrokes } from './hooks/useStrokes'
import { useCursors } from './hooks/useCursors'
import { useTextPresence } from './hooks/useTextPresence'
import { usePresence } from './hooks/usePresence'
import { useUndoStack } from './hooks/useUndoStack'
import { useLiveStrokes } from './hooks/useLiveStrokes'
import type { LiveStroke } from './hooks/useLiveStrokes'
import { CanvasStage } from './components/CanvasStage'
import { stepStrokeWidth, effectiveStrokeWidth as computeEffectiveStrokeWidth } from './utils/strokeSize'
import type { NavHandle } from './hooks/useCamera'
import { CanvasTopBar } from './components/CanvasTopBar'
import { useCanvasKeyboard } from './hooks/useCanvasKeyboard'
import { Toolbar } from './components/Toolbar'
import { CursorOverlay } from './components/CursorOverlay'
import { Minimap } from './components/Minimap'
import type { MinimapHandle } from './components/Minimap'
import { ZoomControls } from './components/ZoomControls'
import { useIsMobile } from '../dashboard/useIsMobile'
import { InviteModal } from '../sharing/InviteModal'
import { ConfirmModal } from '../../lib/ConfirmModal'
import { pickUserColor, STROKE_CAP } from '../../lib/types'
import type { CanvasDoc, Stroke, ToolType } from '../../lib/types'
import { documentKind } from './documents/registry'

export function CanvasPage() {
  const { canvasId } = useParams<{ canvasId: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  // Back goes to wherever the user came from (the dashboard tab they opened the canvas from, or a
  // previous canvas), not always Home. `location.key === 'default'` means there is no in-app history
  // to pop — e.g. the canvas was opened via a deep link or a page refresh — so fall back to Home.
  const goBack = useCallback(() => {
    if (location.key !== 'default') navigate(-1)
    else navigate('/')
  }, [location.key, navigate])
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

  const navRef        = useRef<NavHandle | null>(null)
  const minimapHandle = useRef<MinimapHandle | null>(null)
  const toolRef = useRef<ToolType>('pen')

  // Share the dashboard's mobile breakpoint (760px) so the canvas and dashboard agree on layout —
  // no more 640–760 band where the dashboard is mobile but the canvas is still desktop.
  const isMobile = useIsMobile()

  const [tool, setTool] = useState<ToolType>('pen')
  const [color, setColor] = useState('#14151c')
  const [strokeWidth, setStrokeWidth] = useState(6)
  const [wiggle, setWiggle] = useState(true)
  const [selectedSticker, setSelectedSticker] = useState('flower')

  const effectiveStrokeWidth = computeEffectiveStrokeWidth(tool, strokeWidth)

  useEffect(() => { toolRef.current = tool }, [tool])

  useEffect(() => {
    if (!canvasId) return
    return subscribeCanvas(canvasId, {
      onDoc: (data) => {
        if (data.ownerId !== uid && !data.members.includes(uid)) { navigate('/'); return }
        setCanvasDoc(data)
        setLoadingDoc(false)
      },
      onGone: () => navigate('/'),
    })
  }, [canvasId, uid, navigate])

  useEffect(() => {
    if (!canvasId) return
    grantMemberAccess(canvasId, uid).catch(console.error)
  }, [canvasId, uid])

  useEffect(() => {
    if (!canvasId || !canvasDoc || canvasDoc.ownerId !== uid) return
    ensureOwnerAccess(canvasId, uid).catch(console.error)
  }, [canvasId, canvasDoc?.ownerId, uid])

  const { strokes, atCap, addStroke, updateStroke, deleteStroke, clearAllStrokes } = useStrokes(canvasId!)
  const { cursors, emitCursor, updateSelection, clearCursor } = useCursors(canvasId!, uid, userColor, tool, effectiveStrokeWidth)
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
      await setCanvasTitle(canvasId!, trimmed)
    } catch (err) {
      console.error('Failed to rename canvas:', err)
    }
  }, [titleDraft, canvasDoc?.title, canvasId])

  const handleGuestSignIn = useCallback(async () => {
    try {
      await linkWithPopup(user!, new GoogleAuthProvider())
      await cancelCanvasDeletion(canvasId!)
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
  // The canvas's template: its background style comes from the document kind (see
  // features/canvas/documents) rather than being hardcoded, so a new template can change it.
  const docKind = documentKind(canvasDoc.kind)
  const surfaceClass = docKind.background === 'dot-grid' ? 'm-canvas-surface' : ''
  // A bounded, image-backed kind (the Daily Planner) renders its template pinned to the document
  // extent and clamps the camera to the sheet (see documents/registry, ADR 0004).
  const isBounded = docKind.view === 'bounded'
  const hasTemplate = docKind.background === 'image' && !!docKind.backgroundImage

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
        onBack={goBack}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onShare={() => setShowInvite(true)}
        wiggle={wiggle}
        onWiggleToggle={() => setWiggle(w => !w)}
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
            selectedSticker={selectedSticker}
            onToolChange={setTool}
            onColorChange={setColor}
            onStrokeWidthChange={setStrokeWidth}
            onStickerChange={setSelectedSticker}
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
          className={surfaceClass}
        >
          {/* Template sheet (Daily Planner): pinned to the document extent in world space, so it
              scales with zoom and pans with the camera — it *is* the sheet, behind the strokes. */}
          {hasTemplate && (
            <img
              src={docKind.backgroundImage}
              alt=""
              aria-hidden
              draggable={false}
              style={{
                position: 'absolute',
                left: viewport.pan.x,
                top: viewport.pan.y,
                width: docKind.width * viewport.zoom,
                height: docKind.height * viewport.zoom,
                pointerEvents: 'none',
                userSelect: 'none',
                zIndex: 0,
              }}
            />
          )}
          <CanvasStage
            strokes={strokes}
            tool={tool}
            color={color}
            strokeWidth={effectiveStrokeWidth}
            disabled={atCap}
            boundedView={isBounded}
            worldWidth={docKind.width}
            worldHeight={docKind.height}
            onStrokeComplete={handleStrokeComplete}
            onMouseMove={emitCursor}
            onMouseLeave={clearCursor}
            onDeleteStroke={handleDeleteStroke}
            onUpdateStroke={updateStroke}
            onToolChange={setTool}
            onResizeStroke={handleResizeStroke}
            onViewportChange={handleViewportChange}
            navRef={navRef}
            overlay={<CursorOverlay cursors={cursors} zoom={viewport.zoom} pan={viewport.pan} displayNames={displayNames} />}
            remoteStrokes={remoteStrokes}
            onLiveUpdate={handleLiveUpdate}
            wiggle={wiggle}
            selectedSticker={selectedSticker}
            remoteTextFocus={remoteTextFocus}
            onTextFocus={setTextFocus}
            displayNames={displayNames}
            friendCursors={cursors}
            onSelectionChange={updateSelection}
          />
          {/* Zoom/fit controls show on every viewport (mobile keeps a compact reset/fit affordance);
              the minimap is a desktop-only hover/drag aid, redundant with pinch on touch. */}
          <ZoomControls navHandle={navRef} viewport={viewport} minimapHandle={minimapHandle} mobile={isMobile} />
          {!isMobile && !isBounded && (
            // The bounded sheet always shows in full, so a minimap is redundant.
            <Minimap navHandle={navRef} viewport={viewport} strokes={strokes} minimapHandle={minimapHandle} />
          )}
        </div>

        {isMobile && (
          <Toolbar
            tool={tool}
            color={color}
            strokeWidth={strokeWidth}
            selectedSticker={selectedSticker}
            onToolChange={setTool}
            onColorChange={setColor}
            onStrokeWidthChange={setStrokeWidth}
            onStickerChange={setSelectedSticker}
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
