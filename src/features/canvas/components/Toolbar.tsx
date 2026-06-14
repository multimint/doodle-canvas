import type { ToolType } from '../../../lib/types'

interface Props {
  tool: ToolType
  color: string
  strokeWidth: number
  onToolChange: (t: ToolType) => void
  onColorChange: (c: string) => void
  onStrokeWidthChange: (w: number) => void
}

const TOOLS: { id: ToolType; label: string; icon: string }[] = [
  { id: 'pen',     label: 'Pen',       icon: '✏️' },
  { id: 'eraser',  label: 'Eraser',    icon: '🧹' },
  { id: 'line',    label: 'Line',      icon: '╱' },
  { id: 'rect',    label: 'Rectangle', icon: '▭' },
  { id: 'circle',  label: 'Circle',    icon: '○' },
  { id: 'text',    label: 'Text',      icon: 'T' },
]

const PRESET_COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#ec4899',
]

export function Toolbar({ tool, color, strokeWidth, onToolChange, onColorChange, onStrokeWidthChange }: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-section">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => onToolChange(t.id)}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            className={`color-swatch ${color === c ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => onColorChange(c)}
            title={c}
          />
        ))}
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="color-picker"
          title="Custom color"
        />
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section toolbar-section--vertical">
        <label className="stroke-label">Size: {strokeWidth}px</label>
        <input
          type="range"
          min={1}
          max={60}
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
          className="stroke-slider"
        />
      </div>
    </div>
  )
}
