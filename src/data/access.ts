import { ref, set, remove, get } from 'firebase/database'
import { rtdb } from '../lib/firebase'

// RTDB access-control mirror for a canvas, at `canvases/{canvasId}/access`. Firestore is the source
// of truth for membership (see ADR 0001); these entries mirror it so the RTDB security rules can
// authorize stroke/cursor writes. The only module that touches those paths.

export function grantMemberAccess(canvasId: string, uid: string): Promise<void> {
  return set(ref(rtdb, `canvases/${canvasId}/access/members/${uid}`), true)
}

export function revokeMemberAccess(canvasId: string, uid: string): Promise<void> {
  return remove(ref(rtdb, `canvases/${canvasId}/access/members/${uid}`))
}

export function setOwnerAccess(canvasId: string, uid: string): Promise<void> {
  return set(ref(rtdb, `canvases/${canvasId}/access/ownerId`), uid)
}

// Set the owner access entry only if it isn't already present (idempotent owner bootstrap).
export async function ensureOwnerAccess(canvasId: string, uid: string): Promise<void> {
  const ownerRef = ref(rtdb, `canvases/${canvasId}/access/ownerId`)
  const snap = await get(ownerRef)
  if (!snap.exists()) await set(ownerRef, uid)
}

// Grant both owner and member access for a freshly created canvas.
export function grantOwnerAndMemberAccess(canvasId: string, uid: string): Promise<void[]> {
  return Promise.all([grantMemberAccess(canvasId, uid), setOwnerAccess(canvasId, uid)])
}

// Remove the entire realtime subtree for a canvas (strokes, cursors, presence, access) on delete.
export function removeCanvasRealtimeData(canvasId: string): Promise<void> {
  return remove(ref(rtdb, `canvases/${canvasId}`))
}
