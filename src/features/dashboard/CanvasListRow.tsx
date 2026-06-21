import { useNavigate } from 'react-router-dom'
import type { CanvasDoc } from '../../lib/types'
import { MCOLORS } from '../../lib/icons'
import { CanvasPreview } from './CanvasPreview'

interface Props {
  canvas: CanvasDoc
  isOwner: boolean
  uid: string
}

function pickColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return MCOLORS[Math.abs(hash) % MCOLORS.length]
}

// A compact list-row presentation of a canvas, used by the Home page's "Recent documents" section.
// Same open-on-click behaviour as CanvasCard but without the kebab menu — a small live thumbnail
// beside the title and last-edited date.
export function CanvasListRow({ canvas, isOwner, uid }: Props) {
  const navigate = useNavigate()

  const formattedDate = new Date(canvas.updatedAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  const collabMembers = isOwner
    ? canvas.members.slice(0, 3)
    : canvas.members.filter(m => m !== uid).slice(0, 3)

  return (
    <div
      className="m-card m-card-sm m-liftable"
      onClick={() => navigate(`/canvas/${canvas.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && navigate(`/canvas/${canvas.id}`)}
      style={{ padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer', userSelect: 'none' }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 13, overflow: 'hidden', flex: '0 0 auto',
        position: 'relative', display: 'flex', alignItems: 'center',
        background: 'radial-gradient(rgba(45,39,34,.07) 1.1px, transparent 1.2px) -1px -1px / 13px 13px, #fffdf8',
        boxShadow: 'inset 0 0 0 1px rgba(20,23,45,.04)',
      }}>
        <CanvasPreview canvasId={canvas.id} accentColor={pickColor(canvas.id)} />
      </div>
      <div className="m-col m-grow" style={{ gap: 3, minWidth: 0 }}>
        <div className="m-bold" style={{ fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {canvas.title}
        </div>
        <div className="m-tiny m-faint" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {formattedDate}
        </div>
      </div>
      <div className="m-row" style={{ flexShrink: 0, alignItems: 'center' }}>
        {collabMembers.length > 0
          ? collabMembers.map((memberId, i) => (
              <div
                key={memberId}
                className="m-ava"
                title={memberId}
                style={{ width: 22, height: 22, fontSize: 10, marginLeft: i ? -7 : 0, background: pickColor(memberId) }}
              >
                {memberId.charAt(0).toUpperCase()}
              </div>
            ))
          : !isOwner && (
              <span className="m-tag" style={{ background: 'var(--m-bg-2)', color: 'var(--m-ink-2)' }}>Shared</span>
            )}
      </div>
    </div>
  )
}
