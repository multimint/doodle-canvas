import { ref, onValue, off, push, remove, update, get } from 'firebase/database'
import { rtdb } from '../lib/firebase'
import { StoredStrokeSchema, parseOrNull } from '../lib/schemas'
import type { Stroke, StrokeData } from '../lib/types'

// Repository for canvas strokes (Realtime Database — see ADR 0001). This is the only module that
// touches `firebase/database` for strokes; hooks and components call these functions and receive
// validated `Stroke` objects. Raw snapshots are parsed through the zod schema so a malformed
// record is dropped rather than rendered.

function strokesPath(canvasId: string): string {
  return `canvases/${canvasId}/strokes`
}

// One raw child of the strokes node: its push-id key and the unvalidated value. The caller
// (useStrokes) decides which entries to (re)parse, so its stable-reference cache can skip
// re-validating strokes it already holds — keeping validation cost proportional to *new* strokes.
export interface RawStrokeEntry {
  id: string
  raw: unknown
}

// Parse one persisted stroke value and attach its id. Returns null (and logs in dev) when the
// record doesn't match the schema, so callers can drop it.
export function parseStroke(id: string, raw: unknown): Stroke | null {
  const parsed = parseOrNull(StoredStrokeSchema, raw, `stroke ${id}`)
  return parsed ? { id, ...parsed } : null
}

// Subscribe to a canvas's strokes. The callback receives the raw children on every change; the
// caller parses and caches. Returns an unsubscribe function.
export function subscribeStrokes(
  canvasId: string,
  onEntries: (entries: RawStrokeEntry[]) => void,
): () => void {
  const node = ref(rtdb, strokesPath(canvasId))
  const handle = onValue(node, (snap) => {
    const entries: RawStrokeEntry[] = []
    snap.forEach((child) => {
      entries.push({ id: child.key!, raw: child.val() })
    })
    onEntries(entries)
  })
  return () => off(node, 'value', handle)
}

// One-shot read of all strokes, validated and sorted by timestamp (used by static previews).
export async function getStrokesOnce(canvasId: string): Promise<Stroke[]> {
  const snap = await get(ref(rtdb, strokesPath(canvasId)))
  const result: Stroke[] = []
  snap.forEach((child) => {
    const stroke = parseStroke(child.key!, child.val())
    if (stroke) result.push(stroke)
  })
  result.sort((a, b) => a.timestamp - b.timestamp)
  return result
}

export async function addStroke(canvasId: string, stroke: Omit<Stroke, 'id'>): Promise<string> {
  const newRef = await push(ref(rtdb, strokesPath(canvasId)), stroke)
  return newRef.key!
}

export async function updateStrokeData(
  canvasId: string,
  strokeId: string,
  patch: Partial<StrokeData>,
): Promise<void> {
  await update(ref(rtdb, `${strokesPath(canvasId)}/${strokeId}/data`), patch)
}

export async function deleteStroke(canvasId: string, strokeId: string): Promise<void> {
  await remove(ref(rtdb, `${strokesPath(canvasId)}/${strokeId}`))
}

export async function clearStrokes(canvasId: string): Promise<void> {
  await remove(ref(rtdb, strokesPath(canvasId)))
}
