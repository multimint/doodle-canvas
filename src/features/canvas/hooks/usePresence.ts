import { useEffect, useState } from 'react'
import { ref, onValue, off, onDisconnect, set, serverTimestamp } from 'firebase/database'
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
  const [isLeader, setIsLeader] = useState(false)

  useEffect(() => {
    const presenceRef = ref(rtdb, `canvases/${canvasId}/presence/${uid}`)
    const allPresenceRef = ref(rtdb, `canvases/${canvasId}/presence`)

    // serverTimestamp() is a write-time sentinel resolved by RTDB server;
    // cast is safe because readers always see the resolved number via onValue.
    const myEntry = { displayName, photoURL, color, joinedAt: serverTimestamp() } as unknown as PresenceEntry
    set(presenceRef, myEntry)
    onDisconnect(presenceRef).remove()

    const handle = onValue(allPresenceRef, (snap) => {
      const data: Record<string, PresenceEntry> = {}
      snap.forEach((child) => {
        data[child.key!] = child.val() as PresenceEntry
      })
      setPresence(data)

      // Leader = earliest joinedAt; uid string comparison breaks ties.
      // Filter out entries where joinedAt hasn't resolved yet (null/0).
      const candidates = Object.entries(data)
        .filter(([, e]) => !!e.joinedAt)
        .sort(([aUid, a], [bUid, b]) =>
          a.joinedAt !== b.joinedAt ? a.joinedAt - b.joinedAt : aUid < bUid ? -1 : 1
        )
      setIsLeader(candidates.length > 0 && candidates[0][0] === uid)
    })

    return () => {
      off(allPresenceRef, 'value', handle)
      presenceRef.ref && set(presenceRef, null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId, uid])

  return { presence, isLeader }
}
