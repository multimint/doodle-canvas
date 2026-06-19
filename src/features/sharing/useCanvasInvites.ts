import { useState, useEffect, useRef } from 'react'
import {
  doc, getDoc, runTransaction, collection, query, where, getDocs,
  arrayUnion, updateDoc, arrayRemove,
} from 'firebase/firestore'
import { ref, set, remove } from 'firebase/database'
import { db, rtdb } from '../../lib/firebase'
import type { CanvasDoc } from '../../lib/types'

export interface MemberInfo {
  displayName: string
  email: string
  photoURL: string
}

export type InviteStatus = 'idle' | 'sending' | 'done' | 'error'

// Owns the data side of sharing a canvas: resolving member profiles, inviting by email
// (existing user -> member, otherwise a pending invite), and removing members / cancelling
// invites. Firestore is the source of truth; RTDB access entries are kept in sync.
export function useCanvasInvites(canvas: CanvasDoc) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<InviteStatus>('idle')
  const [message, setMessage] = useState('')
  const [memberInfo, setMemberInfo] = useState<Record<string, MemberInfo>>({})
  const fetchGenRef = useRef(0)

  const membersJson = JSON.stringify(canvas.members)
  useEffect(() => {
    const members: string[] = JSON.parse(membersJson)
    if (members.length === 0) { setMemberInfo({}); return }
    const gen = ++fetchGenRef.current
    const load = async () => {
      const results: Record<string, MemberInfo> = {}
      await Promise.all(members.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'users', uid))
          if (snap.exists()) {
            const d = snap.data()
            results[uid] = {
              displayName: d.displayName ?? uid,
              email: d.email ?? '',
              photoURL: d.photoURL ?? '',
            }
          } else {
            results[uid] = { displayName: uid, email: '', photoURL: '' }
          }
        } catch {
          results[uid] = { displayName: uid, email: '', photoURL: '' }
        }
      }))
      if (gen === fetchGenRef.current) setMemberInfo(results)
    }
    load()
  }, [membersJson])

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return

    setStatus('sending')
    try {
      const canvasRef = doc(db, 'canvases', canvas.id)

      const usersSnap = await getDocs(query(
        collection(db, 'users'),
        where('email', '==', trimmed),
      ))
      const existingUser = usersSnap.empty ? null : usersSnap.docs[0]

      let addedUid: string | null = null
      let msg = ''

      await runTransaction(db, async (tx) => {
        const fresh = await tx.get(canvasRef)
        if (!fresh.exists()) throw new Error('not-found')
        const data = fresh.data()
        const members: string[] = data.members ?? []
        const pendingInvites: string[] = data.pendingInvites ?? []

        if (members.length + pendingInvites.length >= 20) {
          throw Object.assign(new Error('cap'), { code: 'cap' })
        }

        if (existingUser) {
          const uid = existingUser.id
          if (members.includes(uid)) {
            throw Object.assign(new Error('already-member'), { code: 'already-member' })
          }
          tx.update(canvasRef, { members: arrayUnion(uid) })
          addedUid = uid
          msg = `${trimmed} added as collaborator.`
        } else {
          if (pendingInvites.includes(trimmed)) {
            throw Object.assign(new Error('already-pending'), { code: 'already-pending' })
          }
          tx.update(canvasRef, { pendingInvites: arrayUnion(trimmed) })
          msg = `Invite sent to ${trimmed}. They'll get access on first login.`
        }
      })

      if (addedUid) {
        await set(ref(rtdb, `canvases/${canvas.id}/access/members/${addedUid}`), true)
      }

      setMessage(msg)
      setStatus('done')
      setEmail('')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'cap') {
        setMessage('This canvas already has the maximum number of collaborators.')
      } else if (code === 'already-member') {
        setMessage('This user is already a collaborator.')
      } else if (code === 'already-pending') {
        setMessage('Invite already sent to this email.')
      } else {
        setMessage('Failed to send invite. Please try again.')
      }
      setStatus('error')
    }
  }

  const removeMember = async (uid: string) => {
    try {
      await updateDoc(doc(db, 'canvases', canvas.id), { members: arrayRemove(uid) })
    } catch {
      setMessage('Failed to remove member.')
      setStatus('error')
      return
    }
    // Firestore is source of truth — member is already kicked via onSnapshot.
    // Best-effort RTDB cleanup; log if it fails so it can be investigated.
    remove(ref(rtdb, `canvases/${canvas.id}/access/members/${uid}`)).catch(err => {
      console.error('[InviteModal] RTDB member access cleanup failed for', uid, err)
    })
  }

  const cancelInvite = async (inviteEmail: string) => {
    try {
      await updateDoc(doc(db, 'canvases', canvas.id), { pendingInvites: arrayRemove(inviteEmail) })
    } catch {
      setMessage('Failed to cancel invite.')
      setStatus('error')
    }
  }

  return { email, setEmail, status, message, memberInfo, invite, removeMember, cancelInvite }
}
