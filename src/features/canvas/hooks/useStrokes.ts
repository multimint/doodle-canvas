import { useEffect, useCallback, useState } from 'react'
import { ref, onValue, push, remove, off } from 'firebase/database'
import { rtdb } from '../../../lib/firebase'
import { STROKE_CAP } from '../../../lib/types'
import type { Stroke } from '../../../lib/types'

export function useStrokes(canvasId: string) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const basePath = `canvases/${canvasId}/strokes`

  useEffect(() => {
    const strokesRef = ref(rtdb, basePath)
    const handle = onValue(strokesRef, (snap) => {
      const result: Stroke[] = []
      snap.forEach((child) => {
        result.push({ id: child.key!, ...child.val() } as Stroke)
      })
      result.sort((a, b) => a.timestamp - b.timestamp)
      setStrokes(result)
    })
    return () => off(strokesRef, 'value', handle)
  }, [canvasId, basePath])

  const atCap = strokes.length >= STROKE_CAP

  const addStroke = useCallback(async (stroke: Omit<Stroke, 'id'>): Promise<string> => {
    const newRef = await push(ref(rtdb, basePath), stroke)
    return newRef.key!
  }, [basePath])

  const deleteStroke = useCallback(async (strokeId: string) => {
    await remove(ref(rtdb, `${basePath}/${strokeId}`))
  }, [basePath])

  const clearAllStrokes = useCallback(async () => {
    await remove(ref(rtdb, basePath))
  }, [basePath])

  return { strokes, atCap, addStroke, deleteStroke, clearAllStrokes }
}
