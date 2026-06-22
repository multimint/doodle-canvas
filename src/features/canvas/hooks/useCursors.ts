import { useEffect, useRef, useCallback, useState } from 'react'
import { subscribeChannel, publishOwn, clearOwn } from '../../../data/collab'
import { CursorPosSchema, parseOrNull } from '../../../lib/schemas'
import type { CursorPos, ToolType } from '../../../lib/types'

const THROTTLE_MS = 50

export function useCursors(
  canvasId: string,
  uid: string,
  color: string,
  tool: ToolType,
  strokeWidth: number,
) {
  const [cursors, setCursors] = useState<Record<string, CursorPos>>({})
  const lastEmitRef = useRef(0)
  const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const selectedIdsRef = useRef<string[] | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeChannel<CursorPos>(
      canvasId,
      'cursors',
      (key, raw) => (key === uid ? null : parseOrNull(CursorPosSchema, raw, 'cursor')),
      setCursors,
    )
    return () => {
      unsubscribe()
      clearOwn(canvasId, 'cursors', uid)
    }
  }, [canvasId, uid])

  const buildPayload = (x: number, y: number): CursorPos => ({
    x, y, color, tool, strokeWidth,
    ...(marqueeRef.current ? { marquee: marqueeRef.current } : {}),
    ...(selectedIdsRef.current ? { selectedIds: selectedIdsRef.current } : {}),
  })

  const emitCursor = useCallback((x: number, y: number) => {
    posRef.current = { x, y }
    const now = Date.now()
    if (now - lastEmitRef.current < THROTTLE_MS) return
    lastEmitRef.current = now
    publishOwn(canvasId, 'cursors', uid, buildPayload(x, y))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId, uid, color, tool, strokeWidth])

  const updateSelection = useCallback((sel: {
    marquee?: { x0: number; y0: number; x1: number; y1: number } | null
    selectedIds?: string[] | null
  }) => {
    if ('marquee' in sel) marqueeRef.current = sel.marquee ?? null
    if ('selectedIds' in sel) selectedIdsRef.current = sel.selectedIds ?? null
    publishOwn(canvasId, 'cursors', uid, buildPayload(posRef.current.x, posRef.current.y))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId, uid, color, tool, strokeWidth])

  const clearCursor = useCallback(() => {
    marqueeRef.current = null
    selectedIdsRef.current = null
    clearOwn(canvasId, 'cursors', uid)
  }, [canvasId, uid])

  return { cursors, emitCursor, updateSelection, clearCursor }
}
