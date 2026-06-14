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
      const title = prompt('Canvas name:', 'Untitled Canvas')
      if (!title) return

      const canvasRef = doc(collection(db, 'canvases'))
      const batch = writeBatch(db)
      batch.set(canvasRef, {
        title: title.trim() || 'Untitled Canvas',
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
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Doodle Canvas</h1>
        <div className="dashboard-header-right">
          {user!.photoURL && (
            <img src={user!.photoURL} alt={user!.displayName ?? ''} className="avatar-sm" />
          )}
          <span>{user!.displayName}</span>
          <button onClick={() => signOut(auth)} className="btn-ghost">Sign out</button>
        </div>
      </header>

      <main className="dashboard-main">
        <section>
          <div className="section-header">
            <h2>My Canvases <span className="count">{totalOwned}/10</span></h2>
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={creating || totalOwned >= 10}
            >
              + New Canvas
            </button>
          </div>
          {loading ? (
            <div className="spinner" />
          ) : owned.length === 0 ? (
            <p className="empty-state">No canvases yet. Create one above!</p>
          ) : (
            <div className="canvas-grid">
              {owned.map((c) => (
                <CanvasCard key={c.id} canvas={c} isOwner uid={uid} />
              ))}
            </div>
          )}
        </section>

        {shared.length > 0 && (
          <section>
            <h2>Shared With Me</h2>
            <div className="canvas-grid">
              {shared.map((c) => (
                <CanvasCard key={c.id} canvas={c} isOwner={false} uid={uid} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
