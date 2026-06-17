import type Konva from 'konva'
import { Icon } from '../../../lib/icons'
import type { NavHandle } from './DrawingStage'
import type { MinimapHandle } from './Minimap'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 3
const CANVAS_W = 1920
const CANVAS_H = 1080
const MM_H     = 101
const H        = 32

interface Props {
  navHandle:      React.MutableRefObject<NavHandle | null>
  stageRef:       React.RefObject<Konva.Stage>
  viewport:       { zoom: number; pan: { x: number; y: number } }
  minimapHandle?: React.MutableRefObject<MinimapHandle | null>
}

export function ZoomControls({ navHandle, stageRef, viewport, minimapHandle }: Props) {
  const apply = (next: number) => {
    const nav   = navHandle.current
    const stage = stageRef.current
    if (!nav || !stage) return
    const ratio = next / stage.scaleX()
    const cx    = stage.width()  / 2
    const cy    = stage.height() / 2
    nav.applyViewport(next, {
      x: cx - (cx - stage.x()) * ratio,
      y: cy - (cy - stage.y()) * ratio,
    })
  }

  const step = (dir: 1 | -1) => {
    const cur = stageRef.current?.scaleX() ?? 1
    apply(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((cur + dir * 0.1) * 10) / 10)))
  }

  const reset = () => {
    const nav   = navHandle.current
    const stage = stageRef.current
    if (!nav || !stage) return
    const w = stage.width()
    const h = stage.height()
    nav.applyViewport(1, {
      x: (w - CANVAS_W) / 2,
      y: (h - CANVAS_H) / 2,
    })
    minimapHandle?.current?.resetCenter()
  }

  const pct = Math.round(viewport.zoom * 100)

  const base: React.CSSProperties = {
    height: H, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', background: 'transparent', cursor: 'pointer',
    fontFamily: 'var(--ui)', fontSize: 11, fontWeight: 600,
    color: 'var(--m-ink-2)',
    transition: 'background .14s',
  }
  const iconBtn: React.CSSProperties = { ...base, width: H }
  const textBtn: React.CSSProperties = { ...base, padding: '0 9px' }
  const sep = <div style={{ width: 1, height: H, background: 'var(--m-line)', flexShrink: 0 }} />

  const hover = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--m-bg-2)' },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'transparent' },
  }

  return (
    <div style={{
      position: 'absolute', bottom: 20 + MM_H + 8, right: 20,
      height: H,
      display: 'flex', alignItems: 'stretch',
      zIndex: 10,
      background: 'var(--m-surface)',
      border: '1.5px solid var(--m-line)',
      borderRadius: 'var(--m-r-sm)',
      boxShadow: 'var(--m-shadow)',
      overflow: 'hidden',
    }}>
      <button style={iconBtn} title="Zoom out" onClick={() => step(-1)} {...hover}>
        <Icon name="zoom-out" size={16} />
      </button>
      {sep}
      <div style={{
        width: 46, height: H,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--ui)', fontSize: 11, fontWeight: 600,
        color: 'var(--m-ink-2)', userSelect: 'none', letterSpacing: '0.02em',
        flexShrink: 0,
      }}>
        {pct}%
      </div>
      {sep}
      <button style={iconBtn} title="Zoom in"       onClick={() => step(1)}  {...hover}>
        <Icon name="zoom-in" size={16} />
      </button>
      {sep}
      <button style={textBtn} title="Reset to 100%" onClick={reset}     {...hover}>Reset</button>
    </div>
  )
}
