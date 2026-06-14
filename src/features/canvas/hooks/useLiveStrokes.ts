import { useEffect, useCallback, useState, useRef, useMemo } from 'react'
import { ref, onValue, set, remove, off, onDisconnect } from 'firebase/database'
import { rtdb } from '../../../lib/firebase'
import type { Stroke } from '../../../lib/types'

const THROTTLE_MS = 50
// Cap for real-time preview — full stroke is committed to strokes/ on mouseup
const LIVE_POINTS_CAP = 200

export interface LiveStroke {
  type: Stroke['type']
  points: number[]
  color: string
  strokeWidth: number
}

export function useLiveStrokes(canvasId: string, uid: string) {
  const [remoteStrokes, setRemoteStrokes] = useState<Record<string, LiveStroke>>({})
  const lastEmitRef = useRef(0)

  const myLiveRef = useMemo(() => ref(rtdb, `canvases/${canvasId}/live/${uid}`), [canvasId, uid])
  const allLiveRef = useMemo(() => ref(rtdb, `canvases/${canvasId}/live`), [canvasId])

  useEffect(() => {
    // Remove our live stroke on server if the client disconnects unexpectedly
    onDisconnect(myLiveRef).remove()

    const handle = onValue(allLiveRef, (snap) => {
      const data: Record<string, LiveStroke> = {}
      snap.forEach((child) => {
        if (child.key !== uid && child.val()) {
          data[child.key!] = child.val() as LiveStroke
        }
      })
      setRemoteStrokes(data)
    })
    return () => {
      off(allLiveRef, 'value', handle)
      remove(myLiveRef)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId, uid])

  const emitLiveStroke = useCallback((stroke: LiveStroke) => {
    const now = Date.now()
    if (now - lastEmitRef.current < THROTTLE_MS) return
    lastEmitRef.current = now

    // For growing paths, only send the tail so the payload stays bounded
    const points = stroke.points.length > LIVE_POINTS_CAP * 2
      ? stroke.points.slice(-LIVE_POINTS_CAP * 2)
      : stroke.points

    set(myLiveRef, { ...stroke, points })
  }, [myLiveRef])

  const clearLiveStroke = useCallback(() => {
    remove(myLiveRef)
  }, [myLiveRef])

  return { remoteStrokes, emitLiveStroke, clearLiveStroke }
}
