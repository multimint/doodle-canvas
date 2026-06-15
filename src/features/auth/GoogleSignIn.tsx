import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithPopup, signInAnonymously, GoogleAuthProvider } from 'firebase/auth'
import {
  doc, collection, writeBatch, setDoc, serverTimestamp, increment, Timestamp,
} from 'firebase/firestore'
import { ref, set } from 'firebase/database'
import { auth, db, rtdb } from '../../lib/firebase'

export function GoogleSignIn() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [guestLoading, setGuestLoading] = useState(false)

  const handleSignIn = async () => {
    setError(null)
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (err) {
      const code = (err as { code?: string })?.code ?? 'unknown'
      console.error('[auth] signInWithPopup failed:', code, err)
      setError(`Sign-in failed (${code}). Please try again.`)
    }
  }

  const handleGuestStart = async () => {
    setError(null)
    setGuestLoading(true)
    try {
      const credential = await signInAnonymously(auth)
      const uid = credential.user.uid

      // User doc must exist before canvas creation (Firestore rule checks canvasCount < 10)
      await setDoc(doc(db, 'users', uid), {
        email: '', displayName: '', photoURL: '', canvasCount: 0, createdAt: serverTimestamp(),
      }, { merge: true })

      const canvasRef = doc(collection(db, 'canvases'))
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
        deleteAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      batch.update(doc(db, 'users', uid), { canvasCount: increment(1) })
      await batch.commit()

      await Promise.all([
        set(ref(rtdb, `canvases/${canvasRef.id}/access/ownerId`), uid),
        set(ref(rtdb, `canvases/${canvasRef.id}/access/members/${uid}`), true),
      ])

      navigate(`/canvas/${canvasRef.id}`)
    } catch (err) {
      const code = (err as { code?: string })?.code ?? 'unknown'
      console.error('[auth] guest start failed:', code, err)
      setError('Failed to start as guest. Please try again.')
      setGuestLoading(false)
    }
  }

  return (
    <div className="min-h-screen paper-dots flex items-center justify-center p-6">
      <div
        className="relative bg-white border-[3px] border-ink shadow-hard-lg p-10 flex flex-col items-center gap-5 w-full max-w-sm"
        style={{ borderRadius: '15px 185px 25px 155px / 185px 15px 155px 25px' }}
      >
        {/* Tape decoration */}
        <div
          className="absolute -top-4 left-1/2 -translate-x-1/2 w-20 h-7 bg-muted/60 border border-ink/20 -rotate-1"
          style={{ borderRadius: '4px 6px 5px 3px / 3px 5px 6px 4px' }}
        />

        <h1 className="font-hand text-5xl text-ink tracking-tight mt-2">Doodle Canvas</h1>
        <p className="font-body text-ink/60 text-lg text-center">A collaborative drawing space ✍️</p>

        <button
          className="flex items-center gap-3 px-6 py-3 mt-2 bg-white border-[3px] border-ink font-body text-lg text-ink shadow-hard transition-all duration-100 hover:bg-accent hover:text-white hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-sm active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
          style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}
          onClick={handleSignIn}
        >
          <svg viewBox="0 0 48 48" width="20" height="20" className="shrink-0">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Sign in with Google
        </button>

        <button
          disabled={guestLoading}
          onClick={handleGuestStart}
          className="font-body text-sm text-ink/50 hover:text-ink underline underline-offset-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {guestLoading ? 'Starting…' : 'Try as guest'}
        </button>

        {error && <p className="font-body text-accent text-sm mt-1 text-center">{error}</p>}

        <p className="font-body text-ink/30 text-xs mt-2">draw · share · create together</p>
      </div>
    </div>
  )
}
