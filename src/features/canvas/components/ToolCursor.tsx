import { forwardRef } from 'react'
import type { ToolType } from '../../../lib/types'
import { toolCursorVariant } from '../utils/toolCursor'
import { ToolFootprint } from './ToolFootprint'
import { StickerPreview } from './StickerPreview'

interface Props {
  tool: ToolType
  color: string
  strokeWidth: number
  zoom: number
  visible: boolean
  stickerId?: string
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
  { tool, color, strokeWidth, zoom, visible, stickerId },
  ref,
) {
  const variant = toolCursorVariant(tool)
  if (variant === 'none') return null

  return (
    <div
      ref={ref}
      className='tool-cursor'
      style={{ visibility: visible ? 'visible' : 'hidden' }}
    >
      {variant === 'sticker' ? (
        <StickerPreview stickerId={stickerId ?? 'flower'} color={color} zoom={zoom} />
      ) : (
        <ToolFootprint
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          zoom={zoom}
        />
      )}
    </div>
  )
})
