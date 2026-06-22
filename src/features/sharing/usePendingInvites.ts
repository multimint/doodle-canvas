import { useEffect } from 'react'
import type { User } from 'firebase/auth'
import { acceptPendingInvites } from '../../data/canvases'

export function usePendingInvites(user: User) {
  useEffect(() => {
    if (!user?.email) return
    acceptPendingInvites(user.uid, user.email)
  }, [user])
}
