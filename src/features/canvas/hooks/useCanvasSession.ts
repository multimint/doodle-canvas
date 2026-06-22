import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { subscribeCanvas } from '../../../data/canvases'
import { grantMemberAccess, ensureOwnerAccess } from '../../../data/access'
import type { CanvasDoc, Stroke, ToolType } from '../../../lib/types'
import { useStrokes } from './useStrokes'
import { useCursors } from './useCursors'
import { useTextPresence } from './useTextPresence'
import { usePresence } from './usePresence'
import { useUndoStack } from './useUndoStack'
import { useLiveStrokes, type LiveStroke } from './useLiveStrokes'

interface Options {
  canvasId: string
  uid: string
  user: User
  userColor: string
  tool: ToolType
  effectiveStrokeWidth: number
}

// Owns a canvas editing session's data plane: the canvas-doc subscription + access mirroring, the
// realtime sync hooks (strokes, cursors, text presence, live strokes, presence), the local undo
// stack, and the stroke action handlers wired across them. CanvasPage consumes this and is left
// with tool/UI state and rendering. Membership/redirect logic stays here because it's pure data.
export function useCanvasSession({
  canvasId,
  uid,
  user,
  userColor,
  tool,
  effectiveStrokeWidth,
}: Options) {
  const navigate = useNavigate()
  const [canvasDoc, setCanvasDoc] = useState<CanvasDoc | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(true)

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

  const { strokes, atCap, addStroke, updateStroke, deleteStroke, clearAllStrokes } = useStrokes(canvasId)
  const { cursors, emitCursor, updateSelection, clearCursor } = useCursors(canvasId, uid, userColor, tool, effectiveStrokeWidth)
  const { remoteFocus: remoteTextFocus, setTextFocus } = useTextPresence(canvasId, uid, userColor)
  const { remoteStrokes, emitLiveStroke, clearLiveStroke } = useLiveStrokes(canvasId, uid)
  const { presence } = usePresence({
    canvasId,
    uid,
    displayName: user.displayName ?? 'Anonymous',
    photoURL: user.photoURL ?? '',
    color: userColor,
  })
  const { push, pop: popUndo, pushRedo, popRedo } = useUndoStack()

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

  const handleLiveUpdate = useCallback((data: LiveStroke | null) => {
    if (data) emitLiveStroke(data); else clearLiveStroke()
  }, [emitLiveStroke, clearLiveStroke])

  return {
    canvasDoc,
    loadingDoc,
    strokes,
    atCap,
    updateStroke,
    clearAllStrokes,
    cursors,
    emitCursor,
    updateSelection,
    clearCursor,
    remoteTextFocus,
    setTextFocus,
    remoteStrokes,
    presence,
    handleStrokeComplete,
    handleUndo,
    handleRedo,
    handleDeleteStroke,
    handleLiveUpdate,
  }
}
