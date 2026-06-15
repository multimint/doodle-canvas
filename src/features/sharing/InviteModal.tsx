import { useState, useEffect, useRef } from 'react'
import {
  doc, getDoc, runTransaction, collection, query, where, getDocs,
  arrayUnion, updateDoc, arrayRemove,
} from 'firebase/firestore'
import { ref, set, remove } from 'firebase/database'
import { db, rtdb } from '../../lib/firebase'
import type { CanvasDoc } from '../../lib/types'

interface MemberInfo {
  displayName: string
  email: string
  photoURL: string
}

interface Props {
  canvas: CanvasDoc
  onClose: () => void
}

export function InviteModal({ canvas, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
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

  const handleRemoveMember = async (uid: string) => {
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

  const handleCancelInvite = async (inviteEmail: string) => {
    try {
      await updateDoc(doc(db, 'canvases', canvas.id), { pendingInvites: arrayRemove(inviteEmail) })
    } catch {
      setMessage('Failed to cancel invite.')
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
          <div className="mt-5 border-t-2 border-dashed border-ink/20 pt-4 flex flex-col gap-4 max-h-64 overflow-y-auto">
            {canvas.members.length > 0 && (
              <div>
                <p className="font-hand text-xs text-ink/40 uppercase tracking-wider mb-2">
                  Members ({canvas.members.length})
                </p>
                {canvas.members.length > 0 && Object.keys(memberInfo).length === 0 && (
                  <p className="font-body text-xs text-ink/30 italic">Loading…</p>
                )}
                <ul className="flex flex-col gap-2">
                  {canvas.members.map((uid) => {
                    const info = memberInfo[uid]
                    return (
                      <li key={uid} className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full border-2 border-ink overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                          {info?.photoURL ? (
                            <img src={info.photoURL} alt={info.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="font-hand text-xs text-ink">
                              {info?.displayName?.[0]?.toUpperCase() ?? '?'}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm text-ink truncate">
                            {info?.displayName ?? uid}
                          </p>
                          {info?.email && (
                            <p className="font-body text-xs text-ink/40 truncate">{info.email}</p>
                          )}
                        </div>
                        <button
                          className="shrink-0 font-body text-xs text-ink/30 hover:text-accent transition-colors px-1.5 py-0.5 border border-ink/20 hover:border-accent"
                          style={{ borderRadius: '4px 8px 4px 8px / 8px 4px 8px 4px' }}
                          onClick={() => handleRemoveMember(uid)}
                          title="Remove member"
                        >
                          ✕
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {canvas.pendingInvites.length > 0 && (
              <div>
                <p className="font-hand text-xs text-ink/40 uppercase tracking-wider mb-2">
                  Pending ({canvas.pendingInvites.length})
                </p>
                <ul className="flex flex-col gap-2">
                  {canvas.pendingInvites.map((inviteEmail) => (
                    <li key={inviteEmail} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full border-2 border-dashed border-ink/30 flex items-center justify-center shrink-0">
                        <span className="font-body text-xs text-ink/30">?</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm text-ink/60 truncate">{inviteEmail}</p>
                        <span
                          className="font-body text-[10px] px-1.5 py-0.5 bg-muted border border-ink/20 text-ink/40"
                          style={{ borderRadius: '4px 8px 4px 8px / 8px 4px 8px 4px' }}
                        >
                          pending
                        </span>
                      </div>
                      <button
                        className="shrink-0 font-body text-xs text-ink/30 hover:text-accent transition-colors px-1.5 py-0.5 border border-ink/20 hover:border-accent"
                        style={{ borderRadius: '4px 8px 4px 8px / 8px 4px 8px 4px' }}
                        onClick={() => handleCancelInvite(inviteEmail)}
                        title="Cancel invite"
                      >
                        ✕
                      </button>
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
