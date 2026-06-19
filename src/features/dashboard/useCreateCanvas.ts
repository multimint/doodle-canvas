import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  doc,
  increment,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { ref, set } from 'firebase/database'
import { db, rtdb } from '../../lib/firebase'

// Creates a new canvas (Firestore doc + RTDB access entries + owner canvasCount bump),
// holds the in-flight `creating`/`creatingId` state for the overlay, and navigates to
// the new canvas. Limit enforcement stays in the caller so it can surface a modal.
export function useCreateCanvas(uid: string) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [creatingId, setCreatingId] = useState<string | null>(null)

  const createCanvas = async () => {
    setCreating(true)
    try {
      const canvasRef = doc(collection(db, 'canvases'))
      setCreatingId(canvasRef.id)
      const batch = writeBatch(db)
      batch.set(canvasRef, {
        title: 'Untitled Canvas',
        ownerId: uid,
        members: [],
        pendingInvites: [],
        width: 1920,
        height: 1080,
        createdAt: serverTimestamp(),
        updatedAt: Date.now(),
      })
      batch.update(doc(db, 'users', uid), { canvasCount: increment(1) })

      await Promise.all([
        batch
          .commit()
          .then(() =>
            Promise.all([
              set(ref(rtdb, `canvases/${canvasRef.id}/access/ownerId`), uid),
              set(
                ref(rtdb, `canvases/${canvasRef.id}/access/members/${uid}`),
                true,
              ),
            ]),
          ),
        new Promise((resolve) => setTimeout(resolve, 900)),
      ])

      navigate(`/canvas/${canvasRef.id}`)
    } finally {
      setCreating(false)
      setCreatingId(null)
    }
  }

  return { creating, creatingId, createCanvas }
}
