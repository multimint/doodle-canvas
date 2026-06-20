import type { CursorPos } from '../../../lib/types'
import { toolCursorVariant } from '../utils/toolCursor'
import { ToolFootprint } from './ToolFootprint'

interface Props {
  cursors: Record<string, CursorPos>
  zoom: number
  pan: { x: number; y: number }
  displayNames: Record<string, string>
}

export function CursorOverlay({ cursors, zoom, pan, displayNames }: Props) {
  return (
    <div className="cursor-overlay" style={{ pointerEvents: 'none' }}>
      {Object.entries(cursors).map(([uid, cursor]) => {
        // Drawing tools depict the actual painted footprint centred on the friend's point;
        // non-drawing tools (select/hand/text) keep the arrow pointer + a tool icon.
        const hasFootprint =
          !!cursor.tool && toolCursorVariant(cursor.tool) !== 'none'
        return (
          <div
            key={uid}
            className="remote-cursor"
            style={{
              left: cursor.x * zoom + pan.x,
              top: cursor.y * zoom + pan.y,
              color: cursor.color,
            }}
          >
            {hasFootprint ? (
              <span className="tool-cursor remote-footprint">
                <ToolFootprint
                  tool={cursor.tool!}
                  color={cursor.color}
                  strokeWidth={cursor.strokeWidth ?? 6}
                  zoom={zoom}
                />
              </span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill={cursor.color}>
                <path d="M0 0 L0 12 L3.5 8.5 L6 14 L8 13 L5.5 7.5 L10 7.5 Z" />
              </svg>
            )}
            <span className="cursor-label" style={{ background: cursor.color }}>
              {displayNames[uid] ?? uid.slice(0, 6)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
