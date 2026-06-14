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
    <div
      className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white border-[3px] border-ink shadow-hard-lg p-6 w-full max-w-md"
        style={{ borderRadius: '15px 185px 25px 155px / 185px 15px 155px 25px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tape */}
        <div
          className="absolute -top-4 left-1/2 -translate-x-1/2 w-16 h-6 bg-muted/60 border border-ink/20 rotate-1"
          style={{ borderRadius: '3px 5px 4px 3px / 4px 3px 5px 4px' }}
        />

        <div className="flex items-start justify-between mb-5">
          <h2 className="font-hand text-2xl text-ink">Share "{canvas.title}"</h2>
          <button
            className="font-body text-ink/40 hover:text-accent text-lg leading-none ml-4 mt-1"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleInvite} className="flex gap-2 mb-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Collaborator's email"
            disabled={status === 'sending'}
            required
            autoFocus
            className="flex-1 font-body text-sm text-ink bg-paper border-2 border-ink px-3 py-2 outline-none focus:border-blue-pen placeholder:text-ink/30"
            style={{ borderRadius: '15px 55px 15px 55px / 55px 15px 55px 15px' }}
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="font-body text-sm px-4 py-2 bg-white border-[3px] border-ink shadow-hard transition-all duration-100 hover:bg-accent hover:text-white hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-sm disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}
          >
            {status === 'sending' ? '…' : 'Invite'}
          </button>
        </form>

        {message && (
          <p className={`font-body text-sm mt-1 ${status === 'done' ? 'text-green-600' : 'text-accent'}`}>
            {message}
          </p>
        )}

        {(canvas.members.length > 0 || canvas.pendingInvites.length > 0) && (
          <div className="mt-5 border-t-2 border-dashed border-ink/20 pt-4 flex flex-col gap-3">
            {canvas.members.length > 0 && (
              <div>
                <p className="font-hand text-xs text-ink/40 uppercase tracking-wider mb-1">Members</p>
                <ul className="flex flex-col gap-1">
                  {canvas.members.map((uid) => (
                    <li key={uid} className="font-body text-xs text-ink/50 font-mono">{uid}</li>
                  ))}
                </ul>
              </div>
            )}
            {canvas.pendingInvites.length > 0 && (
              <div>
                <p className="font-hand text-xs text-ink/40 uppercase tracking-wider mb-1">Pending</p>
                <ul className="flex flex-col gap-1">
                  {canvas.pendingInvites.map((e) => (
                    <li key={e} className="flex items-center gap-2 font-body text-xs text-ink/60">
                      {e}
                      <span
                        className="text-[10px] px-1.5 py-0.5 bg-muted border border-ink/20 text-ink/40"
                        style={{ borderRadius: '4px 8px 4px 8px / 8px 4px 8px 4px' }}
                      >
                        pending
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
