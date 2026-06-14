import { useEffect, useState } from 'react'
import {
  collection, query, where, onSnapshot, orderBy,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import type { CanvasDoc } from '../../lib/types'

export function useCanvasList(uid: string) {
  const [owned, setOwned] = useState<CanvasDoc[]>([])
  const [shared, setShared] = useState<CanvasDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) return

    const ownedQ = query(
      collection(db, 'canvases'),
      where('ownerId', '==', uid),
      orderBy('updatedAt', 'desc'),
    )

    const sharedQ = query(
      collection(db, 'canvases'),
      where('members', 'array-contains', uid),
      orderBy('updatedAt', 'desc'),
    )

    let ownedLoaded = false
    let sharedLoaded = false

    const check = () => {
      if (ownedLoaded && sharedLoaded) setLoading(false)
    }

    const unsubOwned = onSnapshot(ownedQ, (snap) => {
      setOwned(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CanvasDoc)))
      ownedLoaded = true
      check()
    }, () => { ownedLoaded = true; check() })

    const unsubShared = onSnapshot(sharedQ, (snap) => {
      setShared(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CanvasDoc)))
      sharedLoaded = true
      check()
    }, () => { sharedLoaded = true; check() })

    return () => {
      unsubOwned()
      unsubShared()
    }
  }, [uid])

  return { owned, shared, loading }
}
