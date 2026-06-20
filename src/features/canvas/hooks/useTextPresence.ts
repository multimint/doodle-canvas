import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { ref, onValue, set, remove, off, onDisconnect } from 'firebase/database'
import { rtdb } from '../../../lib/firebase'
import type { TextFocus } from '../../../lib/types'

// Live typing is streamed on every keystroke; coalesce writes to ~16/sec. Selection/mode
// changes (boxId or editing flips) always go through immediately so the outline never lags.
const THROTTLE_MS = 60

export function useTextPresence(canvasId: string, uid: string, color: string) {
  const [remoteFocus, setRemoteFocus] = useState<Record<string, TextFocus>>({})
  const myRef = useMemo(
    () => ref(rtdb, `canvases/${canvasId}/textFocus/${uid}`),
    [canvasId, uid],
  )
  const allRef = useMemo(
    () => ref(rtdb, `canvases/${canvasId}/textFocus`),
    [canvasId],
  )
  const lastKeyRef = useRef('') // `${boxId}|${editing}` of the last write, to bypass throttle
  const lastEmitRef = useRef(0)

  useEffect(() => {
    const handle = onValue(allRef, (snap) => {
      const data: Record<string, TextFocus> = {}
      snap.forEach((child) => {
        if (child.key !== uid) data[child.key!] = child.val() as TextFocus
      })
      setRemoteFocus(data)
    })
    // Clear the focus if the tab closes mid-edit so a stale outline doesn't haunt the box.
    onDisconnect(myRef).remove()
    return () => {
      off(allRef, 'value', handle)
      remove(myRef)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId, uid])

  // boxId null → not on any box: clear our focus. Otherwise publish {boxId, editing, text, caret}.
  const setTextFocus = useCallback(
    (boxId: string | null, editing: boolean, text?: string, caret?: number) => {
      if (!boxId) {
        lastKeyRef.current = ''
        remove(myRef)
        return
      }
      const key = `${boxId}|${editing}`
      const changed = key !== lastKeyRef.current
      const now = Date.now()
      if (!changed && now - lastEmitRef.current < THROTTLE_MS) return
      lastKeyRef.current = key
      lastEmitRef.current = now
      const entry: TextFocus = { boxId, editing, color }
      if (text !== undefined) entry.text = text
      if (caret !== undefined) entry.caret = caret
      set(myRef, entry)
    },
    [myRef, color],
  )

  return { remoteFocus, setTextFocus }
}
