import { useEffect, useState } from 'react'
import { ref, onValue, off, onDisconnect, set } from 'firebase/database'
import { rtdb } from '../../../lib/firebase'
import type { PresenceEntry } from '../../../lib/types'

interface Options {
  canvasId: string
  uid: string
  displayName: string
  photoURL: string
  color: string
}

export function usePresence({ canvasId, uid, displayName, photoURL, color }: Options) {
  const [presence, setPresence] = useState<Record<string, PresenceEntry>>({})

  useEffect(() => {
    const presenceRef = ref(rtdb, `canvases/${canvasId}/presence/${uid}`)
    const allPresenceRef = ref(rtdb, `canvases/${canvasId}/presence`)

    const myEntry: PresenceEntry = { displayName, photoURL, color }
    set(presenceRef, myEntry)
    onDisconnect(presenceRef).remove()

    const handle = onValue(allPresenceRef, (snap) => {
      const data: Record<string, PresenceEntry> = {}
      snap.forEach((child) => {
        data[child.key!] = child.val() as PresenceEntry
      })
      setPresence(data)
    })

    return () => {
      off(allPresenceRef, 'value', handle)
      presenceRef.ref && set(presenceRef, null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId, uid])

  return presence
}
