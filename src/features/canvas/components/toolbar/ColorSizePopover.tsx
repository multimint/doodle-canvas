import type { ToolType } from '../../../../lib/types'
import { STROKE_SIZES } from '../../utils/strokeSize'
import { popoverAnchor } from './popoverStyle'

const PALETTE = [
  '#14151c', '#3d5afe', '#12c2e9', '#15cf7f', '#ffb01f',
  '#ff5d73', '#ff62b0', '#9b5de5', '#ffffff',
]

interface Props {
  horizontal: boolean
  color: string
  strokeWidth: number
  tool: ToolType
  onColorChange: (c: string) => void
  onStrokeWidthChange: (w: number) => void
  onToolChange: (t: ToolType) => void
  onClose: () => void
}

// The colour palette + stroke-size picker popover anchored off the toolbar's colour swatch.
export function ColorSizePopover({
  horizontal,
  color,
  strokeWidth,
  tool,
  onColorChange,
  onStrokeWidthChange,
  onToolChange,
  onClose,
}: Props) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={onClose} />
      <div
        className='m-card'
        style={{
          position: 'absolute',
          ...popoverAnchor(horizontal),
          padding: 12,
          zIndex: 20,
          borderRadius: 16,
          boxShadow: 'var(--m-shadow-lg)',
          minWidth: 158,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 9 }}>
          {PALETTE.map((c) => (
            <button
              key={c}
              className='m-swatch'
              onClick={() => {
                onColorChange(c)
                if (tool === 'eraser') onToolChange('pen')
              }}
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                background: c,
                border: 'none',
                cursor: 'pointer',
                boxShadow:
                  c === color
                    ? '0 0 0 2.5px var(--m-ink)'
                    : c === '#ffffff'
                      ? 'inset 0 0 0 1.5px var(--m-line-2)'
                      : 'none',
              }}
            />
          ))}
        </div>
        <div style={{ height: 1, background: 'var(--m-line)', margin: '11px 0' }} />
        <div className='m-row' style={{ justifyContent: 'space-between' }}>
          {STROKE_SIZES.map((s) => (
            <button
              key={s}
              onClick={() => onStrokeWidthChange(s)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: 'none',
                background: strokeWidth === s ? 'var(--m-bg-2)' : 'transparent',
                boxShadow: strokeWidth === s ? 'inset 0 0 0 1.5px var(--m-line-2)' : 'none',
              }}
            >
              <span
                style={{
                  width: Math.min(s + 4, 22),
                  height: Math.min(s + 4, 22),
                  borderRadius: '50%',
                  background: 'var(--m-ink)',
                  display: 'block',
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
