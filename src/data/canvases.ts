import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { CanvasDocSchema, parseOrNull } from '../lib/schemas'
import type { CanvasDoc } from '../lib/types'
import {
  grantMemberAccess,
  grantOwnerAndMemberAccess,
  removeCanvasRealtimeData,
  revokeMemberAccess,
} from './access'
import { findUserIdByEmail } from './users'

const MEMBER_CAP = 20

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

// --- Lifecycle -------------------------------------------------------------

// A fresh canvas id, allocated client-side so the caller can show an optimistic placeholder before
// the write lands.
export function newCanvasId(): string {
  return doc(collection(db, 'canvases')).id
}

export interface CreateCanvasInput {
  uid: string
  title: string
  width: number
  height: number
  kindId?: string // omitted for legacy / guest canvases
  deleteAfterMs?: number // guest canvases self-destruct after this many ms
}

// Write a new canvas doc, bump the owner's canvasCount, and mirror access into RTDB.
export async function createCanvas(canvasId: string, input: CreateCanvasInput): Promise<void> {
  const canvasRef = doc(db, 'canvases', canvasId)
  const batch = writeBatch(db)
  batch.set(canvasRef, {
    title: input.title,
    ownerId: input.uid,
    members: [],
    pendingInvites: [],
    ...(input.kindId ? { kind: input.kindId } : {}),
    width: input.width,
    height: input.height,
    createdAt: serverTimestamp(),
    updatedAt: Date.now(),
    ...(input.deleteAfterMs
      ? { deleteAt: Timestamp.fromMillis(Date.now() + input.deleteAfterMs) }
      : {}),
  })
  batch.update(doc(db, 'users', input.uid), { canvasCount: increment(1) })
  await batch.commit()
  await grantOwnerAndMemberAccess(canvasId, input.uid)
}

// Permanently delete a canvas: remove its Firestore doc, decrement the owner's canvasCount, and
// clear the RTDB stroke/access tree.
export async function deleteCanvas(uid: string, canvasId: string): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'canvases', canvasId))
  batch.update(doc(db, 'users', uid), { canvasCount: increment(-1) })
  await batch.commit()
  await removeCanvasRealtimeData(canvasId)
}

// --- Sharing ---------------------------------------------------------------

// Outcome of an invite attempt — a discriminated result the UI maps to a message, instead of
// throwing tagged errors.
export type InviteOutcome =
  | { ok: true; kind: 'member' | 'pending'; email: string }
  | { ok: false; reason: 'cap' | 'already-member' | 'already-pending' | 'error' }

// Invite by email: add an existing user as a member (mirroring RTDB access), otherwise record a
// pending invite they'll claim on first login. Atomic via a transaction on the canvas doc.
export async function inviteByEmail(canvasId: string, email: string): Promise<InviteOutcome> {
  try {
    const existingUid = await findUserIdByEmail(email)
    const canvasRef = doc(db, 'canvases', canvasId)

    const outcome = await runTransaction<InviteOutcome>(db, async (tx) => {
      const fresh = await tx.get(canvasRef)
      if (!fresh.exists()) return { ok: false, reason: 'error' }
      const data = fresh.data()
      const members: string[] = data.members ?? []
      const pendingInvites: string[] = data.pendingInvites ?? []

      if (members.length + pendingInvites.length >= MEMBER_CAP) {
        return { ok: false, reason: 'cap' }
      }
      if (existingUid) {
        if (members.includes(existingUid)) return { ok: false, reason: 'already-member' }
        tx.update(canvasRef, { members: arrayUnion(existingUid) })
        return { ok: true, kind: 'member', email }
      }
      if (pendingInvites.includes(email)) return { ok: false, reason: 'already-pending' }
      tx.update(canvasRef, { pendingInvites: arrayUnion(email) })
      return { ok: true, kind: 'pending', email }
    })

    if (outcome.ok && outcome.kind === 'member' && existingUid) {
      await grantMemberAccess(canvasId, existingUid)
    }
    return outcome
  } catch {
    return { ok: false, reason: 'error' }
  }
}

// Remove a member from a canvas (Firestore is source of truth; RTDB access cleanup is best-effort).
export async function removeMember(canvasId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'canvases', canvasId), { members: arrayRemove(uid) })
  revokeMemberAccess(canvasId, uid).catch((err) => {
    console.error('[canvases] RTDB member access cleanup failed for', uid, err)
  })
}

export async function cancelInvite(canvasId: string, email: string): Promise<void> {
  await updateDoc(doc(db, 'canvases', canvasId), { pendingInvites: arrayRemove(email) })
}

// On login, claim every pending invite matching the user's email: promote it to membership and
// mirror RTDB access. Each canvas is updated under a transaction so concurrent claims are safe.
export async function acceptPendingInvites(uid: string, email: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, 'canvases'), where('pendingInvites', 'array-contains', email)),
  )
  if (snap.empty) return
  await Promise.all(
    snap.docs.map(async (docSnap) => {
      const canvasRef = doc(db, 'canvases', docSnap.id)
      await runTransaction(db, async (tx) => {
        const fresh = await tx.get(canvasRef)
        if (!fresh.exists()) return
        if (!fresh.data().pendingInvites?.includes(email)) return
        tx.update(canvasRef, {
          members: arrayUnion(uid),
          pendingInvites: arrayRemove(email),
        })
      })
      await grantMemberAccess(docSnap.id, uid)
    }),
  )
}
