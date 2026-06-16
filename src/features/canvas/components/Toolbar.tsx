import { useState } from 'react'
import { Icon } from '../../../lib/icons'
import type { ToolType } from '../../../lib/types'

interface Props {
  tool: ToolType
  color: string
  strokeWidth: number
  onToolChange: (t: ToolType) => void
  onColorChange: (c: string) => void
  onStrokeWidthChange: (w: number) => void
  onClear: () => void
}

const DRAW_TOOLS: { id: ToolType; icon: string; label: string }[] = [
  { id: 'pen',    icon: 'pen',    label: 'Pen' },
  { id: 'brush',  icon: 'brush',  label: 'Brush' },
  { id: 'line',   icon: 'line',   label: 'Line' },
  { id: 'rect',   icon: 'square', label: 'Rectangle' },
  { id: 'circle', icon: 'circle', label: 'Circle' },
  { id: 'text',   icon: 'text',   label: 'Text' },
]

const PALETTE = ['#14151c', '#3d5afe', '#12c2e9', '#15cf7f', '#ffb01f', '#ff5d73', '#ff62b0', '#9b5de5', '#ffffff']
const SIZES   = [3, 6, 12, 22]

export function Toolbar({ tool, color, strokeWidth, onToolChange, onColorChange, onStrokeWidthChange, onClear }: Props) {
  const [showPicker, setShowPicker] = useState(false)

  return (
    <div
      className="m-col m-center"
      style={{
        width: 64, flex: '0 0 64px', height: '100%',
        borderRight: '1px solid var(--m-line)',
        background: 'var(--m-surface)',
        padding: '12px 0', gap: 4, zIndex: 5, position: 'relative', overflow: 'visible',
      }}
    >
      {/* Drawing tools */}
      {DRAW_TOOLS.map(({ id, icon, label }) => (
        <button
          key={id}
          title={label}
          onClick={() => { onToolChange(id); setShowPicker(false) }}
          className={'m-tool ' + (tool === id ? 'm-tool-on' : '')}
        >
          <Icon name={icon} size={20} />
        </button>
      ))}

      {/* Divider */}
      <div style={{ width: 30, height: 1, background: 'var(--m-line)', margin: '6px 0', flexShrink: 0 }} />

      {/* Color swatch → opens color+size popover */}
      <button
        className="m-tool"
        title="Color & size"
        onClick={() => setShowPicker(v => !v)}
        style={{ position: 'relative' }}
      >
        <span style={{
          width: 24, height: 24, borderRadius: 8, background: color, flexShrink: 0, display: 'block',
          boxShadow: color === '#ffffff' ? 'inset 0 0 0 1.5px var(--m-line-2)' : 'none',
        }} />
      </button>

      {/* Eraser */}
      <button
        title="Eraser"
        onClick={() => { onToolChange('eraser'); setShowPicker(false) }}
        className={'m-tool ' + (tool === 'eraser' ? 'm-tool-on' : '')}
      >
        <Icon name="eraser" size={20} />
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Clear */}
      <button
        title="Clear canvas"
        onClick={() => { onClear(); setShowPicker(false) }}
        className="m-tool"
        style={{ fontFamily: 'var(--ui)', fontSize: 11, fontWeight: 600, color: 'var(--m-ink-3)' }}
      >
        Clear
      </button>

      {/* Color + size popover */}
      {showPicker && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9 }}
            onClick={() => setShowPicker(false)}
          />
          <div
            className="m-card"
            style={{ position: 'absolute', left: 72, top: 168, padding: 12, zIndex: 20, borderRadius: 16, boxShadow: 'var(--m-shadow-lg)', minWidth: 158 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Colors */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 9 }}>
              {PALETTE.map(c => (
                <button
                  key={c}
                  className="m-swatch"
                  onClick={() => {
                    onColorChange(c)
                    if (tool === 'eraser') onToolChange('pen')
                  }}
                  style={{
                    width: 24, height: 24, borderRadius: 8, background: c, border: 'none', cursor: 'pointer',
                    boxShadow: c === color
                      ? '0 0 0 2.5px var(--m-ink)'
                      : c === '#ffffff' ? 'inset 0 0 0 1.5px var(--m-line-2)' : 'none',
                  }}
                />
              ))}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--m-line)', margin: '11px 0' }} />

            {/* Stroke sizes */}
            <div className="m-row" style={{ justifyContent: 'space-between' }}>
              {SIZES.map(s => (
                <button
                  key={s}
                  onClick={() => onStrokeWidthChange(s)}
                  style={{
                    width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', cursor: 'pointer', border: 'none',
                    background: strokeWidth === s ? 'var(--m-bg-2)' : 'transparent',
                    boxShadow: strokeWidth === s ? 'inset 0 0 0 1.5px var(--m-line-2)' : 'none',
                  }}
                >
                  <span style={{
                    width: Math.min(s + 4, 22), height: Math.min(s + 4, 22),
                    borderRadius: '50%', background: 'var(--m-ink)', display: 'block',
                  }} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
