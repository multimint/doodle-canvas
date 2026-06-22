import { doc, increment, writeBatch } from 'firebase/firestore'
import { ref as rtdbRef, remove } from 'firebase/database'
import { db, rtdb } from '../../lib/firebase'

// Permanently delete a canvas the current user owns: remove the Firestore doc, decrement the
// owner's canvasCount, and clear the RTDB stroke/access tree. Shared by the dashboard card menu
// and the Planner's linked-document row.
export async function deleteCanvas(uid: string, canvasId: string): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'canvases', canvasId))
  batch.update(doc(db, 'users', uid), { canvasCount: increment(-1) })
  await batch.commit()
  await remove(rtdbRef(rtdb, `canvases/${canvasId}`))
}
