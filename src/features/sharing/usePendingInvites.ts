import { useEffect } from 'react'
import type { User } from 'firebase/auth'
import {
  collection, query, where, getDocs,
  runTransaction, doc, arrayUnion, arrayRemove,
} from 'firebase/firestore'
import { ref, set } from 'firebase/database'
import { db, rtdb } from '../../lib/firebase'

export function usePendingInvites(user: User) {
  useEffect(() => {
    if (!user?.email) return
    resolvePendingInvites(user.uid, user.email)
  }, [user])
}

async function resolvePendingInvites(uid: string, email: string) {
  const q = query(
    collection(db, 'canvases'),
    where('pendingInvites', 'array-contains', email),
  )
  const snap = await getDocs(q)
  if (snap.empty) return

  await Promise.all(
    snap.docs.map(async (docSnap) => {
      await runTransaction(db, async (tx) => {
        const canvasRef = doc(db, 'canvases', docSnap.id)
        const fresh = await tx.get(canvasRef)
        if (!fresh.exists()) return
        const data = fresh.data()
        if (!data['pendingInvites']?.includes(email)) return
        tx.update(canvasRef, {
          members: arrayUnion(uid),
          pendingInvites: arrayRemove(email),
        })
      })
      await set(ref(rtdb, `canvases/${docSnap.id}/access/members/${uid}`), true)
    }),
  )
}
