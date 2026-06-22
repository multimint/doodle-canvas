import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../../lib/icons'
import { ConfirmModal } from '../../../lib/ConfirmModal'
import { documentKind } from '../../canvas/documents/registry'
import { deleteCanvas } from '../deleteCanvas'
import { removeDayLink, type ResolvedLink } from './plannerLinks'

interface Props {
  resolved: ResolvedLink
  uid: string
  iso: string
  // Called after a mutation (unlink / delete) so the parent can reload the day's links.
  onChanged: () => void
}

// One linked document in the Planner's day panel: a compact row that opens the canvas on click and
// offers an unlink action (link only) plus an owner-only delete. A link whose canvas was deleted
// elsewhere resolves to a greyed "unavailable" row that can only be removed. See CONTEXT.md.
export function LinkedDocRow({ resolved, uid, iso, onChanged }: Props) {
  const navigate = useNavigate()
  const { link, canvas } = resolved
  const [confirmDelete, setConfirmDelete] = useState(false)
  const kind = documentKind(canvas?.kind ?? link.kind)
  const isOwner = canvas?.ownerId === uid
  const iconName = kind.id === 'daily-planner' ? 'calendar' : 'folder'

  const unlink = async () => {
    await removeDayLink(uid, iso, link.canvasId).catch((e) => console.error('Failed to unlink', e))
    onChanged()
  }

  // Dangling link: the canvas no longer exists. Offer only removal of the stale link.
  if (!canvas) {
    return (
      <div
        className="m-card m-card-sm"
        style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 11, opacity: 0.6 }}
      >
        <div className="m-col m-grow" style={{ gap: 2, minWidth: 0 }}>
          <div className="m-bold" style={{ fontSize: 13.5, textDecoration: 'line-through', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {link.title}
          </div>
          <span className="m-tiny m-faint">Unavailable — deleted</span>
        </div>
        <button className="m-tool" title="Remove from day" onClick={unlink} style={{ flexShrink: 0 }}>
          <Icon name="minus" size={15} />
        </button>
      </div>
    )
  }

  return (
    <>
      <div
        className="m-card m-card-sm m-liftable"
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/canvas/${canvas.id}`)}
        onKeyDown={(e) => e.key === 'Enter' && navigate(`/canvas/${canvas.id}`)}
        style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 10, flex: '0 0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--m-bg-2)', color: 'var(--m-ink-2)',
        }}>
          <Icon name={iconName} size={17} />
        </div>
        <div className="m-col m-grow" style={{ gap: 2, minWidth: 0 }}>
          <div className="m-bold" style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {canvas.title}
          </div>
          <span className="m-tiny m-faint">{kind.label}</span>
        </div>
        <div className="m-row m-g4" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button className="m-tool" title="Remove from day" onClick={unlink}>
            <Icon name="minus" size={15} />
          </button>
          {isOwner && (
            <button className="m-tool" title="Delete document" onClick={() => setConfirmDelete(true)}>
              <Icon name="eraser" size={15} />
            </button>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete document?"
          message={`"${canvas.title}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            setConfirmDelete(false)
            await deleteCanvas(uid, canvas.id).catch((e) => console.error('Failed to delete', e))
            await removeDayLink(uid, iso, canvas.id).catch(() => {})
            onChanged()
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
