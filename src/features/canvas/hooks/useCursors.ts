import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { ref, onValue, set, remove, off } from 'firebase/database'
import { rtdb } from '../../../lib/firebase'
import type { CursorPos } from '../../../lib/types'

const THROTTLE_MS = 50

export function useCursors(canvasId: string, uid: string, color: string) {
  const [cursors, setCursors] = useState<Record<string, CursorPos>>({})
  const lastEmitRef = useRef(0)
  const cursorRef = useMemo(() => ref(rtdb, `canvases/${canvasId}/cursors/${uid}`), [canvasId, uid])
  const cursorsRef = useMemo(() => ref(rtdb, `canvases/${canvasId}/cursors`), [canvasId])

  useEffect(() => {
    const handle = onValue(cursorsRef, (snap) => {
      const data: Record<string, CursorPos> = {}
      snap.forEach((child) => {
        if (child.key !== uid) {
          data[child.key!] = child.val() as CursorPos
        }
      })
      setCursors(data)
    })
    return () => {
      off(cursorsRef, 'value', handle)
      remove(cursorRef)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId, uid])

  const emitCursor = useCallback((x: number, y: number) => {
    const now = Date.now()
    if (now - lastEmitRef.current < THROTTLE_MS) return
    lastEmitRef.current = now
    set(cursorRef, { x, y, color })
  }, [cursorRef, color])

  const clearCursor = useCallback(() => {
    remove(cursorRef)
  }, [cursorRef])

  return { cursors, emitCursor, clearCursor }
}
