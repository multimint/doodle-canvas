import { useEffect, useRef } from 'react'
import { collection, doc, getDoc } from 'firebase/firestore'
import { ref, update } from 'firebase/database'
import { db, rtdb } from '../../../lib/firebase'

const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000
const RTDB_CHUNK_SIZE = 200

interface Options {
  canvasId: string
  strokesLoaded: boolean
  strokeCount: number
  snapshotStrokeIds: string[] | undefined
  snapshotAt: { toMillis(): number } | null | undefined
}

export function useRestore({ canvasId, strokesLoaded, strokeCount, snapshotStrokeIds, snapshotAt }: Options) {
  // Tracks which canvasId was last attempted — resets automatically on canvas navigation.
  const lastAttemptedCanvasId = useRef<string | null>(null)

  useEffect(() => {
    if (!strokesLoaded) return
    if (lastAttemptedCanvasId.current === canvasId) return
    if (strokeCount > 0) return
    if (!snapshotStrokeIds?.length) return
    if (!snapshotAt) return
    if (Date.now() - snapshotAt.toMillis() > RESTORE_WINDOW_MS) return

    lastAttemptedCanvasId.current = canvasId
    restoreFromSnapshot(canvasId, snapshotStrokeIds).catch(e => {
      console.error('[useRestore] failed:', e)
      lastAttemptedCanvasId.current = null  // allow retry on transient error
    })
  }, [strokesLoaded, strokeCount, snapshotStrokeIds, snapshotAt, canvasId])
}

async function restoreFromSnapshot(canvasId: string, snapshotStrokeIds: string[]) {
  const strokesCol = collection(db, 'canvases', canvasId, 'strokes')
  const docs = await Promise.all(
    snapshotStrokeIds.map(id => getDoc(doc(strokesCol, id)))
  )

  const updates: Record<string, unknown> = {}
  docs.forEach(d => {
    if (d.exists()) updates[`canvases/${canvasId}/strokes/${d.id}`] = d.data()
  })

  if (Object.keys(updates).length === 0) return

  const entries = Object.entries(updates)
  for (let i = 0; i < entries.length; i += RTDB_CHUNK_SIZE) {
    await update(ref(rtdb), Object.fromEntries(entries.slice(i, i + RTDB_CHUNK_SIZE)))
  }

  console.log(`[useRestore] restored ${Object.keys(updates).length} strokes from Firestore snapshot`)
}
