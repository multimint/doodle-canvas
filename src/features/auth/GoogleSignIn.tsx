import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithPopup, signInAnonymously, GoogleAuthProvider } from 'firebase/auth'
import {
  doc, collection, writeBatch, setDoc, serverTimestamp, increment, Timestamp,
} from 'firebase/firestore'
import { ref, set } from 'firebase/database'
import { auth, db, rtdb } from '../../lib/firebase'
import { Icon } from '../../lib/icons'
import { Stage } from './signInDecor'
import { Brand, LivePill, SignInPanel } from './SignInPanel'

export function GoogleSignIn() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [guestLoading, setGuestLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 760)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 760)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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

  const panelProps = { onSignIn: handleSignIn, onGuest: handleGuestStart, guestLoading, error }

  /* ---- Mobile ---- */
  if (isMobile) {
    return (
      <div style={{ width: '100%', height: '100dvh', position: 'relative', overflow: 'hidden' }}>
        <Stage compact>
          <div className="m-row m-between" style={{ position: 'absolute', top: 18, left: 20, right: 20, zIndex: 7 }}>
            <Brand size="sm" />
            <LivePill />
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 6 }}>
            <SignInPanel {...panelProps} compact sheet />
          </div>
        </Stage>
      </div>
    )
  }

  /* ---- Desktop ---- */
  return (
    <div style={{ width: '100%', height: '100dvh', position: 'relative', overflow: 'hidden' }}>
      <Stage>
        <div className="m-row m-between" style={{ position: 'absolute', top: 28, left: 32, right: 32, zIndex: 7 }}>
          <Brand />
          <LivePill />
        </div>

        <div className="m-row m-center" style={{ position: 'absolute', inset: 0, zIndex: 6, padding: 24, pointerEvents: 'none' }}>
          <div className="m-panel-px" style={{ pointerEvents: 'auto' }}>
            <SignInPanel {...panelProps} />
          </div>
        </div>

        <div className="m-row m-g6 m-enter" style={{ position: 'absolute', bottom: 26, left: 0, right: 0, justifyContent: 'center', zIndex: 5, fontSize: 13, color: 'var(--m-ink-3)', animationDelay: '.6s' }}>
          <Icon name="pen" size={14} color="var(--m-primary)" /> Where every idea finds its shape — together.
        </div>
      </Stage>
    </div>
  )
}
