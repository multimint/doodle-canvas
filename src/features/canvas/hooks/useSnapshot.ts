import { useEffect, useRef, useCallback } from 'react'
import {
  collection,
  doc,
  writeBatch,
  updateDoc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import type { Stroke } from '../../../lib/types'

const DEBOUNCE_MS = 5_000
const MAX_INTERVAL_MS = 30_000
const BATCH_SIZE = 499

interface Options {
  canvasId: string
  isLeader: boolean
  strokes: Stroke[]
}

export function useSnapshot({ canvasId, isLeader, strokes }: Options) {
  const strokesRef = useRef(strokes)
  useEffect(() => { strokesRef.current = strokes })

  // Distinguish "RTDB not yet loaded" (empty on mount) from "canvas cleared".
  // writeSnapshot skips if strokes are empty and have never been non-empty.
  const hasEverHadStrokes = useRef(false)
  useEffect(() => {
    if (strokes.length > 0) hasEverHadStrokes.current = true
  }, [strokes])

  // Prevent concurrent writes from racing at step 3.
  const inFlightRef = useRef(false)

  // null = first write this session; use getDocs to detect cross-session orphans.
  // Set = in-memory IDs last written; cheaper than getDocs on every write.
  const prevSnapshotIds = useRef<Set<string> | null>(null)

  // Max-wait debounce: tracks when the current debounce window opened.
  const windowStartRef = useRef<number | null>(null)

  const writeSnapshot = useCallback(async () => {
    const current = strokesRef.current
    if (!hasEverHadStrokes.current && current.length === 0) return
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const strokesCol = collection(db, 'canvases', canvasId, 'strokes')
      const ids = current.map(s => s.id)
      const idSet = new Set(ids)

      // Step 1: upsert all current strokes (parallel batches)
      const upsertBatches: Promise<void>[] = []
      for (let i = 0; i < current.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        for (const stroke of current.slice(i, i + BATCH_SIZE)) {
          const { id, ...rest } = stroke
          batch.set(doc(strokesCol, id), rest)
        }
        upsertBatches.push(batch.commit())
      }
      if (upsertBatches.length > 0) await Promise.all(upsertBatches)

      // Step 2: update pointer — atomic commit point; readers are safe from here
      await updateDoc(doc(db, 'canvases', canvasId), {
        snapshotStrokeIds: ids,
        snapshotAt: serverTimestamp(),
      })

      // Step 3: delete orphans
      // First write this session: getDocs to catch cross-session orphans.
      // Subsequent writes: use in-memory tracking (avoids full subcollection reads).
      let orphanIds: string[]
      if (prevSnapshotIds.current === null) {
        const snap = await getDocs(strokesCol)
        orphanIds = snap.docs.map(d => d.id).filter(id => !idSet.has(id))
      } else {
        orphanIds = [...prevSnapshotIds.current].filter(id => !idSet.has(id))
      }
      prevSnapshotIds.current = idSet

      if (orphanIds.length > 0) {
        const deleteBatches: Promise<void>[] = []
        for (let i = 0; i < orphanIds.length; i += BATCH_SIZE) {
          const batch = writeBatch(db)
          orphanIds.slice(i, i + BATCH_SIZE).forEach(id => batch.delete(doc(strokesCol, id)))
          deleteBatches.push(batch.commit())
        }
        await Promise.all(deleteBatches)
      }
    } catch (e) {
      console.error('[useSnapshot] write failed:', e)
    } finally {
      inFlightRef.current = false
    }
  }, [canvasId])

  // Debounce with max-wait: fire after 5 s of idle, or after 30 s of continuous drawing.
  useEffect(() => {
    if (!isLeader) {
      windowStartRef.current = null
      return
    }
    const now = Date.now()
    if (windowStartRef.current === null) windowStartRef.current = now
    const elapsed = now - windowStartRef.current
    const delay = elapsed >= MAX_INTERVAL_MS ? 0 : DEBOUNCE_MS
    const t = setTimeout(() => {
      windowStartRef.current = null
      writeSnapshot()
    }, delay)
    return () => clearTimeout(t)
  }, [strokes, isLeader, writeSnapshot])

  // Promotion: write immediately on false→true leader transition.
  const prevIsLeaderRef = useRef(false)
  useEffect(() => {
    const prev = prevIsLeaderRef.current
    prevIsLeaderRef.current = isLeader
    if (!prev && isLeader) writeSnapshot()
  }, [isLeader, writeSnapshot])
}
