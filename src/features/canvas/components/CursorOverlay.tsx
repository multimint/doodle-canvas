import type { CursorPos } from '../../../lib/types'

interface Props {
  cursors: Record<string, CursorPos>
  scale: number
  displayNames: Record<string, string>
}

export function CursorOverlay({ cursors, scale, displayNames }: Props) {
  return (
    <div className="cursor-overlay" style={{ pointerEvents: 'none' }}>
      {Object.entries(cursors).map(([uid, cursor]) => (
        <div
          key={uid}
          className="remote-cursor"
          style={{
            left: cursor.x * scale,
            top: cursor.y * scale,
            color: cursor.color,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill={cursor.color}>
            <path d="M0 0 L0 12 L3.5 8.5 L6 14 L8 13 L5.5 7.5 L10 7.5 Z" />
          </svg>
          <span
            className="cursor-label"
            style={{ background: cursor.color }}
          >
            {displayNames[uid] ?? uid.slice(0, 6)}
          </span>
        </div>
      ))}
    </div>
  )
}
