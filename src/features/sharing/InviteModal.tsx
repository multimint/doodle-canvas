import { useState } from 'react'
import {
  doc, runTransaction, collection, query, where, getDocs, arrayUnion,
} from 'firebase/firestore'
import { ref, set } from 'firebase/database'
import { db, rtdb } from '../../lib/firebase'
import type { CanvasDoc } from '../../lib/types'

interface Props {
  canvas: CanvasDoc
  onClose: () => void
}

export function InviteModal({ canvas, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleInvite = async (e: React.FormEvent) => {
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Share "{canvas.title}"</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleInvite} className="invite-form">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Collaborator's email"
            disabled={status === 'sending'}
            required
            autoFocus
          />
          <button type="submit" className="btn-primary" disabled={status === 'sending'}>
            {status === 'sending' ? 'Inviting…' : 'Invite'}
          </button>
        </form>

        {message && (
          <p className={`invite-status ${status}`}>{message}</p>
        )}

        {(canvas.members.length > 0 || canvas.pendingInvites.length > 0) && (
          <div className="invite-list">
            {canvas.members.length > 0 && (
              <>
                <h3>Members</h3>
                <ul>
                  {canvas.members.map((uid) => (
                    <li key={uid} className="member-uid">{uid}</li>
                  ))}
                </ul>
              </>
            )}
            {canvas.pendingInvites.length > 0 && (
              <>
                <h3>Pending</h3>
                <ul>
                  {canvas.pendingInvites.map((e) => (
                    <li key={e}>{e} <span className="badge">pending</span></li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
