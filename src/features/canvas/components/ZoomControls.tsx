import { Icon } from '../../../lib/icons'
import type { NavHandle } from '../hooks/useCamera'
import type { MinimapHandle } from './Minimap'

const MM_H = 101
const H = 32

interface Props {
  navHandle: React.MutableRefObject<NavHandle | null>
  viewport: { zoom: number; pan: { x: number; y: number } }
  minimapHandle?: React.MutableRefObject<MinimapHandle | null>
  // On mobile there is no minimap, so sit just above the bottom toolbar instead of stacking
  // above the (absent) minimap.
  mobile?: boolean
}

// Zoom in/out/reset buttons + percentage. Drives the camera through the NavHandle (stepZoom /
// resetView) instead of reading a Konva stage, so it carries no rendering-backend dependency.
export function ZoomControls({ navHandle, viewport, minimapHandle, mobile = false }: Props) {
  const step = (dir: 1 | -1) => navHandle.current?.stepZoom(dir)
  const reset = () => {
    navHandle.current?.resetView()
    minimapHandle?.current?.resetCenter()
  }

  const pct = Math.round(viewport.zoom * 100)

  const base: React.CSSProperties = {
    height: H,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: 'var(--ui)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--m-ink-2)',
    transition: 'background .14s',
  }
  const iconBtn: React.CSSProperties = { ...base, width: H }
  const textBtn: React.CSSProperties = { ...base, padding: '0 9px' }
  const sep = <div style={{ width: 1, height: H, background: 'var(--m-line)', flexShrink: 0 }} />

  const hover = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'var(--m-bg-2)'
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'transparent'
    },
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: mobile ? 16 : 20 + MM_H + 8,
        right: mobile ? 16 : 20,
        height: H,
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 10,
        background: 'var(--m-surface)',
        border: '1.5px solid var(--m-line)',
        borderRadius: 'var(--m-r-sm)',
        boxShadow: 'var(--m-shadow)',
        overflow: 'hidden',
      }}
    >
      <button style={iconBtn} title='Zoom out' onClick={() => step(-1)} {...hover}>
        <Icon name='zoom-out' size={16} />
      </button>
      {sep}
      <div
        style={{
          width: 46,
          height: H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--ui)',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--m-ink-2)',
          userSelect: 'none',
          letterSpacing: '0.02em',
          flexShrink: 0,
        }}
      >
        {pct}%
      </div>
      {sep}
      <button style={iconBtn} title='Zoom in' onClick={() => step(1)} {...hover}>
        <Icon name='zoom-in' size={16} />
      </button>
      {sep}
      <button style={textBtn} title='Reset to 100%' onClick={reset} {...hover}>
        Reset
      </button>
    </div>
  )
}
