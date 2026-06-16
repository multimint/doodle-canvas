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
import { usePresence } from './hooks/usePresence'
import { useUndoStack } from './hooks/useUndoStack'
import { useLiveStrokes } from './hooks/useLiveStrokes'
import type { LiveStroke } from './hooks/useLiveStrokes'
import { DrawingStage } from './components/DrawingStage'
import { Toolbar } from './components/Toolbar'
import { CursorOverlay } from './components/CursorOverlay'
import { InviteModal } from '../sharing/InviteModal'
import { Icon } from '../../lib/icons'
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

  const stageRef = useRef<Konva.Stage>(null)
  const prevToolRef = useRef<ToolType>('pen')
  const toolRef = useRef<ToolType>('pen')
  const spaceActivatedHandRef = useRef(false)

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [tool, setTool] = useState<ToolType>('pen')
  const [color, setColor] = useState('#14151c')
  const [strokeWidth, setStrokeWidth] = useState(6)
  const [wiggle, setWiggle] = useState(true)

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

  const { strokes, atCap, addStroke, deleteStroke, clearAllStrokes } = useStrokes(canvasId!)
  const { cursors, emitCursor, clearCursor } = useCursors(canvasId!, uid, userColor)
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

  const effectiveStrokeWidth = strokeWidth

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

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        handleRedo()
        return
      }
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
  }, [handleUndo, handleRedo])

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
      {/* Topbar */}
      <div
        className="m-row m-between m-canvas-top"
        style={{ padding: '11px 18px', borderBottom: '1px solid var(--m-line)', background: 'var(--m-surface)', zIndex: 6, flexShrink: 0 }}
      >
        {/* Left: back + title */}
        <div className="m-row m-g12">
          <button
            className="m-btn m-btn-ghost m-btn-sm"
            onClick={() => navigate('/')}
            style={{ boxShadow: 'inset 0 0 0 1.5px var(--m-line)' }}
          >
            <Icon name="back" size={17} />
            <span className="m-canvas-back-label">Dashboard</span>
          </button>

          <div className="m-row m-g8">
            {isOwner && editingTitle ? (
              <input
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTitleSave()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
                autoFocus
                style={{
                  fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 17, color: 'var(--m-ink)',
                  border: 'none', outline: 'none', background: 'transparent',
                  borderBottom: '2px solid var(--m-primary)',
                  minWidth: 80, maxWidth: 260,
                }}
              />
            ) : (
              <span
                onClick={() => { if (!isOwner) return; setTitleDraft(canvasDoc.title); setEditingTitle(true) }}
                title={isOwner ? 'Click to rename' : undefined}
                style={{
                  fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 17, color: 'var(--m-ink)',
                  cursor: isOwner ? 'pointer' : 'default',
                  maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {canvasDoc.title}
              </span>
            )}

            {/* Saved chip */}
            <span
              className="m-tiny m-faint m-row m-g4"
              style={{ flexShrink: 0 }}
            >
              <Icon name="check" size={14} color="var(--m-green)" />
              Saved
            </span>
          </div>
        </div>

        {/* Right: collab avatars + undo/redo + share */}
        <div className="m-row m-g10">
          {/* Collab avatars */}
          {presenceEntries.length > 0 && (
            <div className="m-row m-collab" style={{ marginRight: 2 }}>
              {presenceEntries.map(([id, entry], i) => (
                <div
                  key={id}
                  className="m-ava"
                  title={entry.displayName + (id === uid ? ' (you)' : '')}
                  style={{ width: 28, height: 28, fontSize: 11, marginLeft: i ? -8 : 0, background: entry.color }}
                >
                  {entry.displayName.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          )}

          {/* Undo */}
          <button
            className="m-tool"
            onClick={handleUndo}
            title="Undo (Ctrl+Z)"
            style={{ width: 40, height: 40 }}
          >
            <Icon name="undo" size={19} />
          </button>

          {/* Redo */}
          <button
            className="m-tool"
            onClick={handleRedo}
            title="Redo (Ctrl+Shift+Z)"
            style={{ width: 40, height: 40 }}
          >
            <Icon name="redo" size={19} />
          </button>

          {/* Share */}
          {isOwner && (
            <button
              className="m-btn m-btn-primary m-btn-sm"
              onClick={() => setShowInvite(true)}
            >
              <Icon name="share" size={16} color="#fff" />
              Share
            </button>
          )}
        </div>
      </div>

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
            wiggle={wiggle}
            onWiggleChange={setWiggle}
          />
        )}

        <div style={{ flex: 1, overflow: 'hidden' }} className="m-canvas-surface">
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
            onViewportChange={handleViewportChange}
            stageRef={stageRef}
            overlay={<CursorOverlay cursors={cursors} zoom={viewport.zoom} pan={viewport.pan} displayNames={displayNames} />}
            remoteStrokes={remoteStrokes}
            onLiveUpdate={handleLiveUpdate}
            wiggle={wiggle}
          />
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
            wiggle={wiggle}
            onWiggleChange={setWiggle}
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
