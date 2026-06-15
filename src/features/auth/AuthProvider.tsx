import { createContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../../lib/firebase'

interface AuthCtx {
  user: User | null
  loading: boolean
}

export const AuthContext = createContext<AuthCtx>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Process any pending redirect result as early as possible so that
    // onAuthStateChanged fires with the user before BrowserRouter mounts.
    // Errors here are non-fatal — the sign-in page handles them via its own
    // getRedirectResult call if needed.
    getRedirectResult(auth).catch(() => {})

    return onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) await ensureUserDoc(firebaseUser)
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

async function ensureUserDoc(user: User) {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      photoURL: user.photoURL ?? '',
      canvasCount: 0,
      createdAt: serverTimestamp(),
    })
  } else {
    await setDoc(ref, {
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      photoURL: user.photoURL ?? '',
    }, { merge: true })
  }
}
