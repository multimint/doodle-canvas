import type { PresenceEntry } from '../../../lib/types'

interface Props {
  presence: Record<string, PresenceEntry>
  currentUid: string
}

export function PresenceBar({ presence, currentUid }: Props) {
  const entries = Object.entries(presence)
  if (entries.length === 0) return null

  return (
    <div className="flex items-center">
      {entries.map(([uid, entry]) => (
        <div key={uid} className="relative -ml-1 first:ml-0">
          {entry.photoURL ? (
            <img
              src={entry.photoURL}
              alt={entry.displayName}
              className="w-7 h-7 rounded-full border-2"
              style={{ borderColor: entry.color }}
              title={entry.displayName}
            />
          ) : (
            <div
              className="w-7 h-7 rounded-full border-2 border-ink flex items-center justify-center font-body text-xs text-white font-bold"
              style={{ background: entry.color }}
              title={entry.displayName}
            >
              {entry.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {uid === currentUid && (
            <span className="presence-you font-body">you</span>
          )}
        </div>
      ))}
    </div>
  )
}
