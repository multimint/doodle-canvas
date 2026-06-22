import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { CanvasDocSchema, parseOrNull } from '../lib/schemas'
import type { CanvasDoc } from '../lib/types'

// Repository for canvas metadata documents (Firestore — see ADR 0001). The only module that reads
// `canvases/*` docs; it parses each snapshot through the zod schema and returns validated
// `CanvasDoc` objects (or null / filtered-out for malformed records) instead of `as`-casting.

function parseCanvas(id: string, data: unknown): CanvasDoc | null {
  if (data === undefined || data === null) return null
  return parseOrNull(CanvasDocSchema, { id, ...(data as object) }, `canvas ${id}`) as CanvasDoc | null
}

function subscribeCanvasQuery(
  uid: string,
  field: 'ownerId-eq' | 'members-contains',
  cb: (list: CanvasDoc[]) => void,
  onSettled: () => void,
): () => void {
  const base = collection(db, 'canvases')
  const q =
    field === 'ownerId-eq'
      ? query(base, where('ownerId', '==', uid), orderBy('updatedAt', 'desc'))
      : query(base, where('members', 'array-contains', uid), orderBy('updatedAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      const list: CanvasDoc[] = []
      snap.docs.forEach((d) => {
        const parsed = parseCanvas(d.id, d.data())
        if (parsed) list.push(parsed)
      })
      cb(list)
      onSettled()
    },
    onSettled,
  )
}

export function subscribeOwnedCanvases(
  uid: string,
  cb: (list: CanvasDoc[]) => void,
  onSettled: () => void,
): () => void {
  return subscribeCanvasQuery(uid, 'ownerId-eq', cb, onSettled)
}

export function subscribeSharedCanvases(
  uid: string,
  cb: (list: CanvasDoc[]) => void,
  onSettled: () => void,
): () => void {
  return subscribeCanvasQuery(uid, 'members-contains', cb, onSettled)
}

// Subscribe to a single canvas document. `onDoc` fires with the validated doc; `onGone` fires when
// the doc doesn't exist, fails validation, or the listener errors — the caller navigates away.
export function subscribeCanvas(
  canvasId: string,
  handlers: { onDoc: (doc: CanvasDoc) => void; onGone: () => void },
): () => void {
  return onSnapshot(
    doc(db, 'canvases', canvasId),
    (snap) => {
      if (!snap.exists()) { handlers.onGone(); return }
      const parsed = parseCanvas(snap.id, snap.data())
      if (!parsed) { handlers.onGone(); return }
      handlers.onDoc(parsed)
    },
    handlers.onGone,
  )
}

// One-shot read of a canvas doc; null when missing or malformed (used to resolve Planner links).
export async function getCanvasOnce(canvasId: string): Promise<CanvasDoc | null> {
  try {
    const snap = await getDoc(doc(db, 'canvases', canvasId))
    if (!snap.exists()) return null
    return parseCanvas(snap.id, snap.data())
  } catch {
    return null
  }
}

export async function setCanvasTitle(canvasId: string, title: string): Promise<void> {
  await updateDoc(doc(db, 'canvases', canvasId), { title })
}

// Clear the scheduled-deletion marker (e.g. when a guest upgrades their canvas to a real account).
export async function cancelCanvasDeletion(canvasId: string): Promise<void> {
  await updateDoc(doc(db, 'canvases', canvasId), { deleteAt: deleteField() })
}
