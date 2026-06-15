import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, increment, writeBatch, updateDoc, arrayRemove } from 'firebase/firestore'
import { ref as rtdbRef, remove } from 'firebase/database'
import { db, rtdb } from '../../lib/firebase'
import type { CanvasDoc } from '../../lib/types'
import { CanvasPreview } from './CanvasPreview'

interface Props {
  canvas: CanvasDoc
  isOwner: boolean
  uid: string
  rotate?: 'cw' | 'ccw' | 'none'
}

export function CanvasCard({ canvas, isOwner, uid, rotate = 'none' }: Props) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [menuOpen])

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(false)
    if (!confirm(`Delete "${canvas.title}"? This cannot be undone.`)) return

    const batch = writeBatch(db)
    batch.delete(doc(db, 'canvases', canvas.id))
    batch.update(doc(db, 'users', uid), { canvasCount: increment(-1) })
    await batch.commit()
    await remove(rtdbRef(rtdb, `canvases/${canvas.id}`))
  }

  const handleLeave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen(false)
    if (!confirm(`Leave "${canvas.title}"? You'll need to be re-invited to regain access.`)) return

    try {
      await updateDoc(doc(db, 'canvases', canvas.id), { members: arrayRemove(uid) })
      remove(rtdbRef(rtdb, `canvases/${canvas.id}/access/members/${uid}`)).catch(err => {
        console.error('[CanvasCard] RTDB access cleanup failed for', uid, err)
      })
    } catch (err) {
      console.error('Failed to leave canvas:', err)
      alert('Failed to leave canvas. Please try again.')
    }
  }

  const formattedDate = new Date(canvas.updatedAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  const rotateClass = rotate === 'cw' ? 'rotate-1' : rotate === 'ccw' ? '-rotate-1' : ''

  return (
    <div
      className={`relative bg-white border-[3px] border-ink shadow-hard cursor-pointer overflow-hidden transition-all duration-100 hover:shadow-hard-lg hover:-translate-y-1 ${rotateClass}`}
      style={{ borderRadius: '12px 185px 12px 155px / 185px 12px 155px 12px' }}
      onClick={() => navigate(`/canvas/${canvas.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/canvas/${canvas.id}`)}
    >
      {/* Thumbtack */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 w-4 h-4 rounded-full bg-accent border-2 border-ink shadow-hard-sm" />

      {/* Preview */}
      <CanvasPreview canvasId={canvas.id} />

      {/* Info */}
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="font-body text-ink text-sm flex-1 truncate">{canvas.title}</span>
        <span className="font-body text-ink/40 text-xs shrink-0">{formattedDate}</span>
        <div className="relative shrink-0" ref={menuRef}>
          <button
            className="w-6 h-6 flex items-center justify-center font-body text-ink/30 hover:text-ink transition-colors text-base leading-none"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o) }}
            aria-label="Canvas options"
          >
            ⋮
          </button>
          {menuOpen && (
            <div
              className="absolute bottom-full right-0 mb-1 bg-white border-2 border-ink shadow-hard-sm min-w-max z-20"
              style={{ borderRadius: '8px 8px 4px 8px' }}
              onClick={(e) => e.stopPropagation()}
            >
              {isOwner ? (
                <button
                  className="block w-full px-3 py-1.5 font-body text-xs text-accent hover:bg-accent/10 text-left"
                  onClick={handleDelete}
                >
                  Delete canvas
                </button>
              ) : (
                <button
                  className="block w-full px-3 py-1.5 font-body text-xs text-accent hover:bg-accent/10 text-left"
                  onClick={handleLeave}
                >
                  Leave canvas
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
