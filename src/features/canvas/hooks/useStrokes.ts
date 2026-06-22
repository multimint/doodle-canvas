import { useEffect, useCallback, useRef, useState } from 'react'
import { STROKE_CAP } from '../../../lib/types'
import type { Stroke, StrokeData } from '../../../lib/types'
import {
  subscribeStrokes,
  parseStroke,
  addStroke as addStrokeData,
  updateStrokeData,
  deleteStroke as deleteStrokeData,
  clearStrokes,
} from '../../../data/strokes'

// Binary insert into a sorted-by-timestamp array — O(log n) search + O(n) copy,
// vs O(n log n) full sort. Pays off on the hot path of "user just drew one stroke".
function insertSorted(prev: Stroke[], stroke: Stroke): Stroke[] {
  const ts = stroke.timestamp
  let lo = 0, hi = prev.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (prev[mid].timestamp <= ts) lo = mid + 1
    else hi = mid
  }
  const out = new Array<Stroke>(prev.length + 1)
  for (let i = 0; i < lo; i++) out[i] = prev[i]
  out[lo] = stroke
  for (let i = lo; i < prev.length; i++) out[i + 1] = prev[i]
  return out
}

export function useStrokes(canvasId: string) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [strokesLoaded, setStrokesLoaded] = useState(false)
  // Stable object cache — reuses the same JS reference for unchanged strokes so the renderer's
  // wiggle-mutated node positions aren't reset back to their original values on an unrelated update.
  const cacheRef    = useRef<Map<string, Stroke>>(new Map())
  const sortedRef   = useRef<Stroke[]>([])

  useEffect(() => {
    setStrokesLoaded(false)
    cacheRef.current.clear()
    sortedRef.current = []
    const unsubscribe = subscribeStrokes(canvasId, (entries) => {
      const result: Stroke[] = []
      const seen = new Set<string>()
      const newStrokes: Stroke[] = []
      let hasMutations = false

      for (const { id, raw } of entries) {
        seen.add(id)
        const existing = cacheRef.current.get(id)
        if (existing) {
          // Text Boxes / stickers are mutable (move/edit) — re-parse and bust the cache when their
          // data actually changed so the update renders. Other strokes are immutable, so reuse the
          // cached object (preserves the wiggle node optimization).
          if (existing.type === 'text' || existing.type === 'sticker') {
            const next = parseStroke(id, raw)
            if (!next) { result.push(existing); continue }
            const a = existing.data, b = next.data
            if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height || a.rotation !== b.rotation || a.text !== b.text) {
              cacheRef.current.set(id, next)
              result.push(next)
              hasMutations = true
            } else {
              result.push(existing)
            }
          } else {
            result.push(existing)
          }
        } else {
          const stroke = parseStroke(id, raw)
          if (!stroke) continue
          cacheRef.current.set(id, stroke)
          result.push(stroke)
          newStrokes.push(stroke)
        }
      }

      // Evict deleted strokes from cache
      let deletionCount = 0
      for (const id of cacheRef.current.keys()) {
        if (!seen.has(id)) { cacheRef.current.delete(id); deletionCount++ }
      }

      let sorted: Stroke[]
      if (newStrokes.length === 1 && deletionCount === 0 && !hasMutations) {
        // Hot path: single new stroke (user is drawing) — binary insert, O(log n + n)
        sorted = insertSorted(sortedRef.current, newStrokes[0])
      } else if (hasMutations && newStrokes.length === 0 && deletionCount === 0) {
        // Only text/sticker mutations — preserve existing order, swap updated refs
        const byId = new Map(result.map(s => [s.id, s]))
        sorted = sortedRef.current.map(s => byId.get(s.id) ?? s)
      } else {
        // Initial load, bulk add, or deletions — full sort
        result.sort((a, b) => a.timestamp - b.timestamp)
        sorted = result
      }

      sortedRef.current = sorted
      setStrokes(sorted)
      setStrokesLoaded(true)
    })
    return unsubscribe
  }, [canvasId])

  const atCap = strokes.length >= STROKE_CAP

  const addStroke = useCallback(
    (stroke: Omit<Stroke, 'id'>): Promise<string> => addStrokeData(canvasId, stroke),
    [canvasId],
  )

  const updateStroke = useCallback(
    (strokeId: string, patch: Partial<StrokeData>) => updateStrokeData(canvasId, strokeId, patch),
    [canvasId],
  )

  const deleteStroke = useCallback(
    (strokeId: string) => deleteStrokeData(canvasId, strokeId),
    [canvasId],
  )

  const clearAllStrokes = useCallback(() => clearStrokes(canvasId), [canvasId])

  return { strokes, strokesLoaded, atCap, addStroke, updateStroke, deleteStroke, clearAllStrokes }
}
