import type { ToolType } from '../../../lib/types'

interface Props {
  tool: ToolType
  color: string
  strokeWidth: number
  onToolChange: (t: ToolType) => void
  onColorChange: (c: string) => void
  onStrokeWidthChange: (w: number) => void
}

const TOOLS: { id: ToolType; icon: string; label: string }[] = [
  { id: 'pen',    icon: '✏️', label: 'Pen' },
  { id: 'eraser', icon: '🧹', label: 'Eraser' },
  { id: 'line',   icon: '╱',  label: 'Line' },
  { id: 'rect',   icon: '▭',  label: 'Rectangle' },
  { id: 'circle', icon: '○',  label: 'Circle' },
  { id: 'text',   icon: 'T',  label: 'Text' },
]

const PRESET_COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#ec4899',
]

export function Toolbar({ tool, color, strokeWidth, onToolChange, onColorChange, onStrokeWidthChange }: Props) {
  return (
    <div
      className="flex flex-col items-center gap-3 px-2 py-4 bg-white border-r-[3px] border-ink w-14 min-w-14 overflow-y-auto shrink-0"
      style={{ borderRight: '3px solid #2d2d2d' }}
    >
      {/* Tools */}
      <div className="flex flex-col items-center gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.label}
            onClick={() => onToolChange(t.id)}
            className={`w-9 h-9 flex items-center justify-center text-base border-2 border-ink transition-all duration-100 font-body
              ${tool === t.id
                ? 'bg-ink text-paper shadow-hard-sm translate-x-[1px] translate-y-[1px]'
                : 'bg-white text-ink hover:bg-muted'
              }`}
            style={{ borderRadius: '8px 20px 8px 20px / 20px 8px 20px 8px' }}
          >
            {t.icon}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-8 h-[2px] bg-ink/20 border-0 border-dashed" style={{ borderTop: '2px dashed #2d2d2d44' }} />

      {/* Color swatches */}
      <div className="flex flex-col items-center gap-1">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => onColorChange(c)}
            className={`w-6 h-6 border-2 border-ink transition-all duration-100 rounded-full
              ${color === c ? 'scale-125 shadow-hard-sm' : 'hover:scale-110'}`}
            style={{ background: c }}
          />
        ))}
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="color-picker mt-1"
          title="Custom color"
        />
      </div>

      {/* Divider */}
      <div className="w-8" style={{ borderTop: '2px dashed #2d2d2d44' }} />

      {/* Stroke width */}
      <div className="flex flex-col items-center gap-1">
        <span className="font-body text-[9px] text-ink/50 text-center">{strokeWidth}px</span>
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
