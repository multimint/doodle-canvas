import { useEffect, useState } from 'react'
import type { CanvasDoc } from '../../lib/types'
import { subscribeOwnedCanvases, subscribeSharedCanvases } from '../../data/canvases'

export function useCanvasList(uid: string) {
  const [owned, setOwned] = useState<CanvasDoc[]>([])
  const [shared, setShared] = useState<CanvasDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) return

    let ownedLoaded = false
    let sharedLoaded = false
    const check = () => {
      if (ownedLoaded && sharedLoaded) setLoading(false)
    }

    const unsubOwned = subscribeOwnedCanvases(uid, setOwned, () => { ownedLoaded = true; check() })
    const unsubShared = subscribeSharedCanvases(uid, setShared, () => { sharedLoaded = true; check() })

    return () => {
      unsubOwned()
      unsubShared()
    }
  }, [uid])

  return { owned, shared, loading }
}
