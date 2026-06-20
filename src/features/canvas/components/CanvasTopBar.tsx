import { Icon } from '../../../lib/icons'
import type { PresenceEntry } from '../../../lib/types'

interface CanvasTopBarProps {
  title: string
  isOwner: boolean
  editingTitle: boolean
  titleDraft: string
  setTitleDraft: (v: string) => void
  onTitleSave: () => void
  onTitleEditStart: () => void
  onTitleEditCancel: () => void
  presenceEntries: [string, PresenceEntry][]
  uid: string
  onBack: () => void
  onUndo: () => void
  onRedo: () => void
  onShare: () => void
  wiggle: boolean
  onWiggleToggle: () => void
}

// The canvas top bar: back button, (rename-able) title + saved chip, collaborator
// avatars, undo/redo, and the owner-only Share button. Presentational only.
export function CanvasTopBar({
  title,
  isOwner,
  editingTitle,
  titleDraft,
  setTitleDraft,
  onTitleSave,
  onTitleEditStart,
  onTitleEditCancel,
  presenceEntries,
  uid,
  onBack,
  onUndo,
  onRedo,
  onShare,
  wiggle,
  onWiggleToggle,
}: CanvasTopBarProps) {
  return (
    <div
      className="m-row m-between m-canvas-top"
      style={{ padding: '11px 18px', borderBottom: '1px solid var(--m-line)', background: 'var(--m-surface)', zIndex: 6, flexShrink: 0 }}
    >
      {/* Left: back + title */}
      <div className="m-row m-g12">
        <button
          className="m-btn m-btn-ghost m-btn-sm"
          onClick={onBack}
          style={{ boxShadow: 'inset 0 0 0 1.5px var(--m-line)' }}
        >
          <Icon name="back" size={17} />
          <span className="m-canvas-back-label">Dashboard</span>
        </button>

        <div className="m-row m-g8">
          {isOwner && editingTitle ? (
            <input
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={onTitleSave}
              onKeyDown={e => {
                if (e.key === 'Enter') onTitleSave()
                if (e.key === 'Escape') onTitleEditCancel()
              }}
              autoFocus
              style={{
                fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 17, color: 'var(--m-ink)',
                border: 'none', outline: 'none', background: 'transparent',
                borderBottom: '2px solid var(--m-primary)',
                minWidth: 80, maxWidth: 260,
              }}
            />
          ) : (
            <span
              onClick={() => { if (isOwner) onTitleEditStart() }}
              title={isOwner ? 'Click to rename' : undefined}
              style={{
                fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 17, color: 'var(--m-ink)',
                cursor: isOwner ? 'pointer' : 'default',
                maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {title}
            </span>
          )}

          {/* Saved chip */}
          <span className="m-tiny m-faint m-row m-g4" style={{ flexShrink: 0 }}>
            <Icon name="check" size={14} color="var(--m-green)" />
            Saved
          </span>
        </div>
      </div>

      {/* Right: collab avatars + undo/redo + share */}
      <div className="m-row m-g10">
        {presenceEntries.length > 0 && (
          <div className="m-row m-collab" style={{ marginRight: 2 }}>
            {presenceEntries.map(([id, entry], i) => (
              <div
                key={id}
                className="m-ava"
                title={entry.displayName + (id === uid ? ' (you)' : '')}
                style={{ width: 28, height: 28, fontSize: 11, marginLeft: i ? -8 : 0, background: entry.color }}
              >
                {entry.displayName.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        )}

        <button className="m-tool" onClick={onUndo} title="Undo (Ctrl+Z)" style={{ width: 40, height: 40 }}>
          <Icon name="undo" size={19} />
        </button>

        <button className="m-tool" onClick={onRedo} title="Redo (Ctrl+Shift+Z)" style={{ width: 40, height: 40 }}>
          <Icon name="redo" size={19} />
        </button>

        <button
          className="m-tool"
          onClick={onWiggleToggle}
          title={wiggle ? 'Wiggle on — click to turn off' : 'Wiggle off — click to turn on'}
          style={{
            width: 40, height: 40,
            background: wiggle ? 'color-mix(in oklab, var(--m-primary) 12%, transparent)' : undefined,
            color: wiggle ? 'var(--m-primary)' : 'var(--m-ink-3)',
          }}
        >
          <Icon name="wiggle" size={19} />
        </button>

        {isOwner && (
          <button className="m-btn m-btn-primary m-btn-sm" onClick={onShare}>
            <Icon name="share" size={16} color="#fff" />
            Share
          </button>
        )}
      </div>
    </div>
  )
}
