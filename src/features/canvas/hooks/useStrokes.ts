import { useEffect, useCallback, useRef, useState } from 'react'
import { ref, onValue, push, remove, off } from 'firebase/database'
import { rtdb } from '../../../lib/firebase'
import { STROKE_CAP } from '../../../lib/types'
import type { Stroke } from '../../../lib/types'

export function useStrokes(canvasId: string) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [strokesLoaded, setStrokesLoaded] = useState(false)
  const basePath = `canvases/${canvasId}/strokes`
  // Stable object cache — reuses the same JS reference for unchanged strokes so
  // react-konva's reconciler sees no prop change and skips setAttrs (which would
  // otherwise reset wiggle-mutated node positions back to their original values).
  const cacheRef = useRef<Map<string, Stroke>>(new Map())

  useEffect(() => {
    setStrokesLoaded(false)
    cacheRef.current.clear()
    const strokesRef = ref(rtdb, basePath)
    const handle = onValue(strokesRef, (snap) => {
      const result: Stroke[] = []
      const seen = new Set<string>()
      snap.forEach((child) => {
        const id = child.key!
        seen.add(id)
        const existing = cacheRef.current.get(id)
        if (existing) {
          result.push(existing)
        } else {
          const stroke = { id, ...child.val() } as Stroke
          cacheRef.current.set(id, stroke)
          result.push(stroke)
        }
      })
      // Evict deleted strokes from cache
      for (const id of cacheRef.current.keys()) {
        if (!seen.has(id)) cacheRef.current.delete(id)
      }
      result.sort((a, b) => a.timestamp - b.timestamp)
      setStrokes(result)
      setStrokesLoaded(true)
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

  return { strokes, strokesLoaded, atCap, addStroke, deleteStroke, clearAllStrokes }
}
