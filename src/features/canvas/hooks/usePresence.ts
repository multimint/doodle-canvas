import { useEffect, useState } from 'react'
import { z } from 'zod'
import {
  subscribeChannel,
  publishOwn,
  clearOwn,
  clearOwnOnDisconnect,
  channelServerTimestamp,
} from '../../../data/collab'
import { parseOrNull } from '../../../lib/schemas'
import type { PresenceEntry } from '../../../lib/types'

interface Options {
  canvasId: string
  uid: string
  displayName: string
  photoURL: string
  color: string
}

// `joinedAt` is written as a serverTimestamp sentinel, so a freshly-published entry can be read back
// before the server resolves it to a number. We keep such entries in the presence map (matching the
// original behaviour — they still show the peer as present) and the leader calc filters them out.
const PresenceReadSchema = z.object({
  displayName: z.string(),
  photoURL: z.string(),
  color: z.string(),
  joinedAt: z.number().nullable().optional(),
})

export function usePresence({ canvasId, uid, displayName, photoURL, color }: Options) {
  const [presence, setPresence] = useState<Record<string, PresenceEntry>>({})
  const [isLeader, setIsLeader] = useState(false)

  useEffect(() => {
    publishOwn(canvasId, 'presence', uid, {
      displayName,
      photoURL,
      color,
      joinedAt: channelServerTimestamp(),
    })
    clearOwnOnDisconnect(canvasId, 'presence', uid)

    const unsubscribe = subscribeChannel<PresenceEntry>(
      canvasId,
      'presence',
      (_key, raw) => parseOrNull(PresenceReadSchema, raw, 'presence') as PresenceEntry | null,
      (data) => {
        setPresence(data)

        // Leader = earliest joinedAt; uid string comparison breaks ties.
        // Filter out entries where joinedAt hasn't resolved yet (null/0).
        const candidates = Object.entries(data)
          .filter(([, e]) => !!e.joinedAt)
          .sort(([aUid, a], [bUid, b]) =>
            a.joinedAt !== b.joinedAt ? a.joinedAt - b.joinedAt : aUid < bUid ? -1 : 1,
          )
        setIsLeader(candidates.length > 0 && candidates[0][0] === uid)
      },
    )

    return () => {
      unsubscribe()
      clearOwn(canvasId, 'presence', uid)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId, uid])

  return { presence, isLeader }
}
