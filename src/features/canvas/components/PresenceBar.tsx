import type { PresenceEntry } from '../../../lib/types'

interface Props {
  presence: Record<string, PresenceEntry>
  currentUid: string
}

export function PresenceBar({ presence, currentUid }: Props) {
  const entries = Object.entries(presence)
  if (entries.length === 0) return null

  return (
    <div className="presence-bar">
      {entries.map(([uid, entry]) => (
        <div key={uid} className="presence-avatar" title={entry.displayName}>
          {entry.photoURL ? (
            <img
              src={entry.photoURL}
              alt={entry.displayName}
              style={{ border: `2px solid ${entry.color}` }}
            />
          ) : (
            <div
              className="presence-avatar-initials"
              style={{ background: entry.color }}
            >
              {entry.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {uid === currentUid && <span className="presence-you">you</span>}
        </div>
      ))}
    </div>
  )
}
