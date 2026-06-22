import { useEffect, useCallback, useState, useRef } from 'react'
import { z } from 'zod'
import { subscribeChannel, publishOwn, clearOwn, clearOwnOnDisconnect } from '../../../data/collab'
import { parseOrNull } from '../../../lib/schemas'
import type { Stroke } from '../../../lib/types'

const THROTTLE_MS = 50
const LIVE_POINTS_CAP = 4000

export interface LiveStroke {
  type: Stroke['type']
  points: number[]
  color: string
  strokeWidth: number
}

const LiveStrokeSchema = z.object({
  type: z.enum(['path', 'marker', 'rect', 'circle', 'line', 'text', 'sticker', 'eraser']),
  points: z.array(z.number()),
  color: z.string(),
  strokeWidth: z.number(),
})

export function useLiveStrokes(canvasId: string, uid: string) {
  const [remoteStrokes, setRemoteStrokes] = useState<Record<string, LiveStroke>>({})
  const lastEmitRef = useRef(0)

  useEffect(() => {
    // Remove our live stroke on server if the client disconnects unexpectedly
    clearOwnOnDisconnect(canvasId, 'live', uid)

    const unsubscribe = subscribeChannel<LiveStroke>(
      canvasId,
      'live',
      (key, raw) => (key === uid ? null : parseOrNull(LiveStrokeSchema, raw, 'liveStroke')),
      setRemoteStrokes,
    )
    return () => {
      unsubscribe()
      clearOwn(canvasId, 'live', uid)
    }
  }, [canvasId, uid])

  const emitLiveStroke = useCallback((stroke: LiveStroke) => {
    const now = Date.now()
    if (now - lastEmitRef.current < THROTTLE_MS) return
    lastEmitRef.current = now

    const points = stroke.points.length > LIVE_POINTS_CAP * 2
      ? stroke.points.slice(-LIVE_POINTS_CAP * 2)
      : stroke.points
    publishOwn(canvasId, 'live', uid, { ...stroke, points })
  }, [canvasId, uid])

  const clearLiveStroke = useCallback(() => {
    clearOwn(canvasId, 'live', uid)
  }, [canvasId, uid])

  return { remoteStrokes, emitLiveStroke, clearLiveStroke }
}
