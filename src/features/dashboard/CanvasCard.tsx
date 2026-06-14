import { useNavigate } from 'react-router-dom'
import { doc, increment, writeBatch } from 'firebase/firestore'
import { ref as rtdbRef, remove } from 'firebase/database'
import { db, rtdb } from '../../lib/firebase'
import type { CanvasDoc } from '../../lib/types'

interface Props {
  canvas: CanvasDoc
  isOwner: boolean
  uid: string
}

export function CanvasCard({ canvas, isOwner, uid }: Props) {
  const navigate = useNavigate()

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete "${canvas.title}"? This cannot be undone.`)) return

    const batch = writeBatch(db)
    batch.delete(doc(db, 'canvases', canvas.id))
    batch.update(doc(db, 'users', uid), { canvasCount: increment(-1) })
    await batch.commit()
    await remove(rtdbRef(rtdb, `canvases/${canvas.id}`))
  }

  const formattedDate = new Date(canvas.updatedAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div
      className="canvas-card"
      onClick={() => navigate(`/canvas/${canvas.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/canvas/${canvas.id}`)}
    >
      <div className="canvas-card-preview">
        <div className="canvas-card-empty" />
      </div>
      <div className="canvas-card-info">
        <span className="canvas-card-title">{canvas.title}</span>
        <span className="canvas-card-date">{formattedDate}</span>
        {isOwner && (
          <button
            className="canvas-card-delete"
            onClick={handleDelete}
            aria-label="Delete canvas"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
