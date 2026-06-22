import { useState, useEffect, useRef } from 'react'
import type { CanvasDoc } from '../../lib/types'
import {
  inviteByEmail,
  removeMember as removeMemberFromCanvas,
  cancelInvite as cancelInviteOnCanvas,
  type InviteOutcome,
} from '../../data/canvases'
import { getUserProfile, type UserProfile } from '../../data/users'

export type MemberInfo = UserProfile

export type InviteStatus = 'idle' | 'sending' | 'done' | 'error'

const INVITE_MESSAGES: Record<Extract<InviteOutcome, { ok: false }>['reason'], string> = {
  cap: 'This canvas already has the maximum number of collaborators.',
  'already-member': 'This user is already a collaborator.',
  'already-pending': 'Invite already sent to this email.',
  error: 'Failed to send invite. Please try again.',
}

// Owns the data side of sharing a canvas: resolving member profiles, inviting by email (existing
// user -> member, otherwise a pending invite), and removing members / cancelling invites. All
// Firebase access goes through the canvases/users repositories.
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
      const entries = await Promise.all(
        members.map(async (uid) => [uid, await getUserProfile(uid)] as const),
      )
      if (gen === fetchGenRef.current) setMemberInfo(Object.fromEntries(entries))
    }
    load()
  }, [membersJson])

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return

    setStatus('sending')
    const outcome = await inviteByEmail(canvas.id, trimmed)
    if (outcome.ok) {
      setMessage(
        outcome.kind === 'member'
          ? `${outcome.email} added as collaborator.`
          : `Invite sent to ${outcome.email}. They'll get access on first login.`,
      )
      setStatus('done')
      setEmail('')
    } else {
      setMessage(INVITE_MESSAGES[outcome.reason])
      setStatus('error')
    }
  }

  const removeMember = async (uid: string) => {
    try {
      await removeMemberFromCanvas(canvas.id, uid)
    } catch {
      setMessage('Failed to remove member.')
      setStatus('error')
    }
  }

  const cancelInvite = async (inviteEmail: string) => {
    try {
      await cancelInviteOnCanvas(canvas.id, inviteEmail)
    } catch {
      setMessage('Failed to cancel invite.')
      setStatus('error')
    }
  }

  return { email, setEmail, status, message, memberInfo, invite, removeMember, cancelInvite }
}
