import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../../lib/icons'
import { documentKind } from '../../canvas/documents/registry'
import { useCreateCanvas } from '../useCreateCanvas'

interface Props {
  uid: string
  iso: string
  dateLabel: string
  totalOwned: number
  onClose: (changed: boolean) => void
}

const CANVAS_LIMIT = 10

// The two creatable document types, in display order.
const TYPES = [
  { kindId: 'daily-planner', icon: 'calendar', desc: 'Printed "My Day" sheet' },
  { kindId: 'canvas', icon: 'grid', desc: 'Empty drawing canvas' },
] as const

const defaultName = (kindId: string) => documentKind(kindId).defaultTitle ?? 'Untitled Canvas'

// "Add document" to a Planner day: choose a type, name it, and create. The new Canvas counts toward
// the limit, is linked to the day, and is opened. The name field prefills from the chosen type's
// default and follows type changes until the user edits it.
export function AddDocumentModal({ uid, iso, dateLabel, totalOwned, onClose }: Props) {
  const [closing, setClosing] = useState(false)
  const [kindId, setKindId] = useState<string>(TYPES[0].kindId)
  const [name, setName] = useState(() => defaultName(TYPES[0].kindId))
  const [nameEdited, setNameEdited] = useState(false)
  const { createCanvas } = useCreateCanvas(uid)
  const atLimit = totalOwned >= CANVAS_LIMIT

  const close = useCallback((changed: boolean) => {
    setClosing(true)
    setTimeout(() => onClose(changed), 180)
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Switching type updates the prefilled name only while the user hasn't typed their own.
  const pickType = (id: string) => {
    setKindId(id)
    if (!nameEdited) setName(defaultName(id))
  }

  // Creating navigates away into the new canvas, so no need to manage `changed` here.
  const create = () => {
    if (atLimit) return
    createCanvas({ kindId, title: name, linkTo: { uid, iso } })
  }

  return (
    <div
      className={closing ? 'm-modal-overlay m-modal-overlay-out' : 'm-modal-overlay'}
      onPointerDown={(e) => { if (e.target === e.currentTarget) close(false) }}
    >
      <div
        className={`m-modal ${closing ? 'm-pop-out' : 'm-pop-in'}`}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ width: 'min(94vw, 460px)' }}
      >
        <div className="m-row m-between" style={{ alignItems: 'flex-start', gap: 8 }}>
          <div className="m-col" style={{ gap: 2 }}>
            <div className="m-h3">Add a document</div>
            <span className="m-tiny m-faint">{dateLabel}</span>
          </div>
          <button className="m-tool" title="Close" onClick={() => close(false)} style={{ fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>

        {/* Type picker */}
        <div className="m-eyebrow" style={{ marginTop: 18, marginBottom: 8, fontSize: 11 }}>TYPE</div>
        <div className="m-row m-g8">
          {TYPES.map((t) => {
            const selected = kindId === t.kindId
            return (
              <button
                key={t.kindId}
                onClick={() => pickType(t.kindId)}
                className="m-grow"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
                  padding: '13px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                  background: selected ? 'color-mix(in oklab, var(--m-primary) 9%, var(--m-surface))' : 'var(--m-surface)',
                  border: 'none',
                  boxShadow: selected ? 'inset 0 0 0 2px var(--m-primary)' : 'inset 0 0 0 1.5px var(--m-line)',
                  transition: 'box-shadow .14s ease, background .14s ease',
                }}
              >
                <span className="m-row m-g8" style={{ alignItems: 'center' }}>
                  <Icon name={t.icon} size={17} color={selected ? 'var(--m-primary)' : undefined} />
                  <span className="m-bold" style={{ fontSize: 14 }}>{documentKind(t.kindId).label}</span>
                </span>
                <span className="m-tiny m-faint">{t.desc}</span>
              </button>
            )
          })}
        </div>

        {/* Name */}
        <div className="m-eyebrow" style={{ marginTop: 18, marginBottom: 8, fontSize: 11 }}>NAME</div>
        <input
          className="m-text-input"
          value={name}
          autoFocus
          placeholder={defaultName(kindId)}
          onChange={(e) => { setName(e.target.value); setNameEdited(true) }}
          onKeyDown={(e) => { if (e.key === 'Enter') create() }}
        />

        {atLimit && (
          <span className="m-tiny" style={{ color: 'var(--m-coral)', marginTop: 12, display: 'block' }}>
            You've reached the {CANVAS_LIMIT}-canvas limit. Delete one to create a new document.
          </span>
        )}

        {/* Actions */}
        <div className="m-row m-g8" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="m-btn m-btn-outline" onClick={() => close(false)}>Cancel</button>
          <button className="m-btn m-btn-primary" onClick={create} disabled={atLimit}>
            <Icon name="plus" size={15} color="#fff" /><span>Create</span>
          </button>
        </div>
      </div>
    </div>
  )
}
