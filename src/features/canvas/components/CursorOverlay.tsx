import type { CursorPos, ToolType } from '../../../lib/types'
import { Icon } from '../../../lib/icons'

interface Props {
  cursors: Record<string, CursorPos>
  zoom: number
  pan: { x: number; y: number }
  displayNames: Record<string, string>
}

// Icon name (see lib/icons) for each tool a friend can hold. select has no glyph — its cursor
// just shows the pointer + name.
const TOOL_ICON: Partial<Record<ToolType, string>> = {
  pen: 'pen',
  brush: 'spray',
  marker: 'marker',
  line: 'line',
  rect: 'square',
  circle: 'circle',
  text: 'text',
  eraser: 'eraser',
  hand: 'hand',
}

export function CursorOverlay({ cursors, zoom, pan, displayNames }: Props) {
  return (
    <div className="cursor-overlay" style={{ pointerEvents: 'none' }}>
      {Object.entries(cursors).map(([uid, cursor]) => (
        <div
          key={uid}
          className="remote-cursor"
          style={{
            left: cursor.x * zoom + pan.x,
            top: cursor.y * zoom + pan.y,
            color: cursor.color,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill={cursor.color}>
            <path d="M0 0 L0 12 L3.5 8.5 L6 14 L8 13 L5.5 7.5 L10 7.5 Z" />
          </svg>
          <span className="cursor-label" style={{ background: cursor.color }}>
            {cursor.tool && TOOL_ICON[cursor.tool] && (
              <Icon name={TOOL_ICON[cursor.tool]!} size={12} sw={2.2} />
            )}
            {displayNames[uid] ?? uid.slice(0, 6)}
          </span>
        </div>
      ))}
    </div>
  )
}
