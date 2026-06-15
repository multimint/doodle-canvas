import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import {
  collection, doc, increment, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { ref, set } from 'firebase/database'
import { auth, db, rtdb } from '../../lib/firebase'
import { useAuth } from '../auth/useAuth'
import { useCanvasList } from './useCanvasList'
import { usePendingInvites } from '../sharing/usePendingInvites'
import { CanvasCard } from './CanvasCard'

const ROTATE_PATTERN: Array<'cw' | 'ccw' | 'none'> = ['ccw', 'none', 'cw', 'none', 'ccw', 'cw']

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = user!.uid
  const { owned, shared, loading } = useCanvasList(uid)
  const [creating, setCreating] = useState(false)

  usePendingInvites(user!)

  const totalOwned = owned.length

  const handleCreate = async () => {
    if (totalOwned >= 10) {
      alert('You have reached the maximum of 10 canvases. Delete one to create a new one.')
      return
    }
    setCreating(true)
    try {
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
      })
      batch.update(doc(db, 'users', uid), { canvasCount: increment(1) })
      await batch.commit()

      await Promise.all([
        set(ref(rtdb, `canvases/${canvasRef.id}/access/ownerId`), uid),
        set(ref(rtdb, `canvases/${canvasRef.id}/access/members/${uid}`), true),
      ])

      navigate(`/canvas/${canvasRef.id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 h-16 bg-white border-b-[3px] border-ink shadow-hard-sm shrink-0">
        <h1 className="font-hand text-2xl text-ink">Doodle Canvas</h1>
        <div className="flex items-center gap-3">
          {user!.photoURL && (
            <img
              src={user!.photoURL}
              alt={user!.displayName ?? ''}
              className="w-8 h-8 rounded-full border-2 border-ink"
            />
          )}
          <span className="font-body text-ink/70 text-sm hidden sm:block">{user!.displayName}</span>
          <button
            className="font-body text-sm px-3 py-1 border-2 border-ink transition-all duration-100 hover:bg-ink hover:text-paper"
            style={{ borderRadius: '55px 15px 55px 15px / 15px 55px 15px 55px' }}
            onClick={() => signOut(auth)}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-12">

        {/* My Canvases */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-hand text-3xl text-ink">
              My Canvases
              <span className="font-body text-base text-ink/40 ml-2">{totalOwned}/10</span>
            </h2>
            <button
              disabled={creating || totalOwned >= 10}
              onClick={handleCreate}
              className="font-body text-base px-5 py-2 bg-white border-[3px] border-ink shadow-hard transition-all duration-100 hover:bg-accent hover:text-white hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-sm active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-hard disabled:hover:bg-white disabled:hover:text-ink"
              style={{ borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px' }}
            >
              + New Canvas
            </button>
          </div>

          {loading ? (
            <div className="spinner" />
          ) : owned.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="text-4xl">🖼️</span>
              <p className="font-body text-ink/50 text-lg">No canvases yet. Create one above!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {owned.map((c, i) => (
                <CanvasCard
                  key={c.id}
                  canvas={c}
                  isOwner
                  uid={uid}
                  rotate={ROTATE_PATTERN[i % ROTATE_PATTERN.length]}
                />
              ))}
            </div>
          )}
        </section>

        {/* Shared with me */}
        {shared.length > 0 && (
          <section>
            <h2 className="font-hand text-3xl text-ink mb-5">Shared with Me</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {shared.map((c, i) => (
                <CanvasCard
                  key={c.id}
                  canvas={c}
                  isOwner={false}
                  uid={uid}
                  rotate={ROTATE_PATTERN[i % ROTATE_PATTERN.length]}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
