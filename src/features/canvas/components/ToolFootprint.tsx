import type { ToolType } from '../../../lib/types'
import {
  toolCursorSize,
  toolCursorVariant,
  toolFootprintScale,
} from '../utils/toolCursor'

interface Props {
  tool: ToolType
  color: string
  strokeWidth: number
  zoom: number
}

// The inner footprint spans of a tool cursor, WITHOUT any positioning — they rely on a parent
// with the `.tool-cursor` class (its `> span` rule centres each on the anchor point). ToolCursor
// wraps this for the local follower; CursorOverlay reuses it so a friend's cursor shows the very
// same footprint (pen dot / spray cloud / marker nib / eraser ring / shape crosshair).
export function ToolFootprint({ tool, color, strokeWidth, zoom }: Props) {
  const variant = toolCursorVariant(tool)
  if (variant === 'none') return null

  // Footprint-sized outer visual; `core` is the thin true stroke width, drawn as the centre
  // dot inside the spray's spread ring (the dense core of the center-weighted cloud).
  const d = toolCursorSize(strokeWidth, zoom, toolFootprintScale(tool))
  const core = toolCursorSize(strokeWidth, zoom)

  return (
    <>
      {variant === 'pen' && (
        <span
          className='tool-cursor-dot'
          style={{ width: d, height: d, background: color }}
        />
      )}
      {variant === 'spray' && (
        <>
          <span
            className='tool-cursor-spray'
            style={{ width: d, height: d, borderColor: color }}
          />
          <span
            className='tool-cursor-dot'
            style={{ width: core, height: core, background: color }}
          />
        </>
      )}
      {variant === 'marker' && (
        <span
          className='tool-cursor-marker'
          style={{ width: d, height: d, background: color }}
        />
      )}
      {variant === 'ring' && (
        <span className='tool-cursor-ring' style={{ width: d, height: d }} />
      )}
      {variant === 'crosshair' && (
        <span className='tool-cursor-cross'>
          <svg width='24' height='24' viewBox='0 0 24 24'>
            {/* white halo lines under dark lines so the cross reads on any background */}
            <g stroke='#fff' strokeWidth='3' strokeLinecap='round'>
              <line x1='12' y1='3' x2='12' y2='9' />
              <line x1='12' y1='15' x2='12' y2='21' />
              <line x1='3' y1='12' x2='9' y2='12' />
              <line x1='15' y1='12' x2='21' y2='12' />
            </g>
            <g stroke='rgba(0,0,0,0.7)' strokeWidth='1.5' strokeLinecap='round'>
              <line x1='12' y1='3' x2='12' y2='9' />
              <line x1='12' y1='15' x2='12' y2='21' />
              <line x1='3' y1='12' x2='9' y2='12' />
              <line x1='15' y1='12' x2='21' y2='12' />
            </g>
            {/* current-color dot, offset so it never hides the exact centre point */}
            <circle cx='20' cy='4' r='3' fill={color} stroke='#fff' strokeWidth='1' />
          </svg>
        </span>
      )}
    </>
  )
}
