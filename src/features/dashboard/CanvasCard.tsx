import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, increment, writeBatch, updateDoc, arrayRemove } from 'firebase/firestore'
import { ref as rtdbRef, remove } from 'firebase/database'
import { db, rtdb } from '../../lib/firebase'
import type { CanvasDoc } from '../../lib/types'
import { MCOLORS } from '../../lib/icons'
import { ConfirmModal } from '../../lib/ConfirmModal'
import { CanvasPreview } from './CanvasPreview'

interface Props {
  canvas: CanvasDoc
  isOwner: boolean
  uid: string
}

type ModalConfig = {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

function pickColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return MCOLORS[Math.abs(hash) % MCOLORS.length]
}

const pickMemberColor = pickColor

export function CanvasCard({ canvas, isOwner, uid }: Props) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuClosing, setMenuClosing] = useState(false)
  const [modal, setModal] = useState<ModalConfig | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const closeMenu = () => {
    setMenuClosing(true)
    setTimeout(() => { setMenuOpen(false); setMenuClosing(false) }, 150)
  }

  useEffect(() => {
    if (!menuOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [menuOpen])

  const confirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    closeMenu()
    setModal({
      title: 'Delete canvas?',
      message: `"${canvas.title}" will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setModal(null)
        const batch = writeBatch(db)
        batch.delete(doc(db, 'canvases', canvas.id))
        batch.update(doc(db, 'users', uid), { canvasCount: increment(-1) })
        await batch.commit()
        await remove(rtdbRef(rtdb, `canvases/${canvas.id}`))
      },
    })
  }

  const confirmLeave = (e: React.MouseEvent) => {
    e.stopPropagation()
    closeMenu()
    setModal({
      title: 'Leave canvas?',
      message: `You'll be removed from "${canvas.title}" and will need to be re-invited to regain access.`,
      confirmLabel: 'Leave',
      danger: true,
      onConfirm: async () => {
        setModal(null)
        try {
          await updateDoc(doc(db, 'canvases', canvas.id), { members: arrayRemove(uid) })
          remove(rtdbRef(rtdb, `canvases/${canvas.id}/access/members/${uid}`)).catch(err =>
            console.error('[CanvasCard] RTDB access cleanup failed', err)
          )
        } catch (err) {
          console.error('Failed to leave canvas:', err)
          setModal({
            title: 'Something went wrong',
            message: 'Failed to leave the canvas. Please try again.',
            confirmLabel: 'Got it',
            onConfirm: () => setModal(null),
          })
        }
      },
    })
  }

  const formattedDate = new Date(canvas.updatedAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  const collabMembers = isOwner
    ? canvas.members.slice(0, 3)
    : canvas.members.filter(m => m !== uid).slice(0, 3)

  return (
    <>
      <div
        className="m-card m-card-sm m-liftable"
        onClick={() => navigate(`/canvas/${canvas.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && navigate(`/canvas/${canvas.id}`)}
        style={{ padding: 9, display: 'flex', flexDirection: 'column', cursor: 'pointer', userSelect: 'none', position: 'relative', zIndex: (menuOpen || menuClosing) ? 10 : 'auto', minWidth: 0 }}
      >
        {/* Thumbnail */}
        <div style={{
          height: 148, borderRadius: 14, overflow: 'hidden', position: 'relative',
          background: 'radial-gradient(rgba(20,23,45,.07) 1.1px, transparent 1.2px) -1px -1px / 13px 13px, #fbfcfe',
          boxShadow: 'inset 0 0 0 1px rgba(20,23,45,.04)',
        }}>
          {/* Drifting glow accent */}
          <div className="m-glow-drift" style={{
            position: 'absolute', left: 'calc(100% - 102px)', top: -22, width: 124, height: 124,
            borderRadius: '50%', background: pickColor(canvas.id), opacity: 0.16, filter: 'blur(20px)',
            pointerEvents: 'none',
          }} />
          <CanvasPreview canvasId={canvas.id} accentColor={pickColor(canvas.id)} />

          {!isOwner && (
            <span
              className="m-tag"
              style={{ position: 'absolute', left: 9, top: 9, background: 'rgba(255,255,255,.94)', color: MCOLORS[5] }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 9, background: MCOLORS[5] }} />
              Shared
            </span>
          )}
        </div>

        {/* Footer */}
        <div className="m-row m-between" style={{ padding: '11px 6px 5px', alignItems: 'center', gap: 10 }}>
          {/* Left: title + date stacked */}
          <div className="m-col" style={{ minWidth: 0, flex: '1 1 auto', gap: 3 }}>
            <div className="m-bold" style={{ fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {canvas.title}
            </div>
            <div className="m-tiny m-faint" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {formattedDate}
            </div>
          </div>

          {/* Right: avatars + kebab menu */}
          <div className="m-row" style={{ flexShrink: 0, alignItems: 'center', gap: 4 }}>
            {collabMembers.length > 0 && (
              <div className="m-row">
                {collabMembers.map((memberId, i) => (
                  <div
                    key={memberId}
                    className="m-ava"
                    title={memberId}
                    style={{ width: 22, height: 22, fontSize: 10, marginLeft: i ? -7 : 0, background: pickMemberColor(memberId) }}
                  >
                    {memberId.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
            )}

            {/* Options menu */}
            <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <button
                className="m-tool"
                style={{ width: 24, height: 24, borderRadius: 6 }}
                onClick={e => { e.stopPropagation(); menuOpen ? closeMenu() : setMenuOpen(true) }}
                aria-label="Canvas options"
              >
                <span style={{ fontFamily: 'var(--ui)', fontSize: 15, fontWeight: 700, color: 'var(--m-ink-3)', lineHeight: 1 }}>⋮</span>
              </button>

              {(menuOpen || menuClosing) && (
                <div
                  className={`m-card ${menuClosing ? 'm-dropdown-out' : 'm-dropdown'}`}
                  style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, padding: '4px', minWidth: 130, zIndex: 20, borderRadius: 12, boxShadow: 'var(--m-shadow-lg)' }}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left', borderRadius: 9, fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 500, color: 'var(--m-coral)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in oklab, var(--m-coral) 10%, transparent)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                    onClick={isOwner ? confirmDelete : confirmLeave}
                  >
                    {isOwner ? 'Delete' : 'Leave canvas'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {modal && (
        <ConfirmModal
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          danger={modal.danger}
          onConfirm={modal.onConfirm}
          onCancel={modal.confirmLabel === 'Got it' ? undefined : () => setModal(null)}
        />
      )}
    </>
  )
}
