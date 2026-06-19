import { forwardRef } from 'react'
import type { ToolType } from '../../../lib/types'
import { toolCursorSize, toolCursorVariant } from '../utils/toolCursor'

interface Props {
  tool: ToolType
  color: string
  strokeWidth: number
  zoom: number
  visible: boolean
}

// A presentational follower that depicts the active tool's painted footprint at the
// pointer. It is positioned imperatively: the parent holds the forwarded ref and writes
// `transform: translate(x, y)` on every mousemove (no React re-render), so `transform`
// is deliberately kept OUT of the React-managed style below. React only re-renders when
// the tool / color / size / visibility change, which is rare.
//
// The moved root sits at the stage origin; the inner visual centres itself on that point
// with translate(-50%, -50%), so the pointer maps to the true centre of the footprint.
export const ToolCursor = forwardRef<HTMLDivElement, Props>(function ToolCursor(
  { tool, color, strokeWidth, zoom, visible },
  ref,
) {
  const variant = toolCursorVariant(tool)
  if (variant === 'none') return null

  const d = toolCursorSize(strokeWidth, zoom)

  return (
    <div
      ref={ref}
      className='tool-cursor'
      style={{ visibility: visible ? 'visible' : 'hidden' }}
    >
      {variant === 'filled' && (
        <span
          className='tool-cursor-dot'
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
    </div>
  )
})
