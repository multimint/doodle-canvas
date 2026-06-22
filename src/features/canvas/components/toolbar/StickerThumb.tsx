import { useEffect, useRef, useState } from 'react'
import { STICKER_LABELS, drawSticker, onStickerLoad } from '../../render/stickerLibrary'

// Small canvas thumbnail for a single sticker in the sticker panel.
export function StickerThumb({
  id,
  selected,
  onClick,
}: {
  id: string
  selected: boolean
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Repaint when the sticker SVG finishes decoding (it loads async).
  const [ready, setReady] = useState(0)
  useEffect(() => onStickerLoad(() => setReady((n) => n + 1)), [])
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const dpr = window.devicePixelRatio || 1
    el.width = 36 * dpr
    el.height = 36 * dpr
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.translate(18, 18)
    drawSticker(ctx, id, 14, '#333333')
    ctx.restore()
  }, [id, ready])

  return (
    <button
      title={STICKER_LABELS[id]}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        borderRadius: 9,
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: selected ? 'var(--m-bg-2)' : 'transparent',
        boxShadow: selected ? 'inset 0 0 0 2px var(--m-accent)' : 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        width={36}
        height={36}
        style={{ display: 'block', width: 36, height: 36 }}
      />
    </button>
  )
}
