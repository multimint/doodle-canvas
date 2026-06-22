import { useEffect, useRef, useCallback, useState } from 'react'
import { subscribeChannel, publishOwn, clearOwn, clearOwnOnDisconnect } from '../../../data/collab'
import { TextFocusSchema, parseOrNull } from '../../../lib/schemas'
import type { TextFocus } from '../../../lib/types'

// Live typing is streamed on every keystroke; coalesce writes to ~16/sec. Selection/mode
// changes (boxId or editing flips) always go through immediately so the outline never lags.
const THROTTLE_MS = 60

export function useTextPresence(canvasId: string, uid: string, color: string) {
  const [remoteFocus, setRemoteFocus] = useState<Record<string, TextFocus>>({})
  const lastKeyRef = useRef('') // `${boxId}|${editing}` of the last write, to bypass throttle
  const lastEmitRef = useRef(0)

  useEffect(() => {
    const unsubscribe = subscribeChannel<TextFocus>(
      canvasId,
      'textFocus',
      (key, raw) => (key === uid ? null : parseOrNull(TextFocusSchema, raw, 'textFocus')),
      setRemoteFocus,
    )
    // Clear the focus if the tab closes mid-edit so a stale outline doesn't haunt the box.
    clearOwnOnDisconnect(canvasId, 'textFocus', uid)
    return () => {
      unsubscribe()
      clearOwn(canvasId, 'textFocus', uid)
    }
  }, [canvasId, uid])

  // boxId null → not on any box: clear our focus. Otherwise publish {boxId, editing, text, caret}.
  const setTextFocus = useCallback(
    (boxId: string | null, editing: boolean, text?: string, caret?: number) => {
      if (!boxId) {
        lastKeyRef.current = ''
        clearOwn(canvasId, 'textFocus', uid)
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
      publishOwn(canvasId, 'textFocus', uid, entry)
    },
    [canvasId, uid, color],
  )

  return { remoteFocus, setTextFocus }
}
