import { createContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { ensureUserDoc } from '../../data/users'

interface AuthCtx {
  user: User | null
  loading: boolean
}

export const AuthContext = createContext<AuthCtx>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          await ensureUserDoc({
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            displayName: firebaseUser.displayName ?? '',
            photoURL: firebaseUser.photoURL ?? '',
          })
        }
      } catch {
        // auth succeeded; Firestore doc sync is non-fatal
      } finally {
        setUser(firebaseUser)
        setLoading(false)
      }
    })
  }, [])

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>
}
