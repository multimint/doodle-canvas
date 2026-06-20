import { useLayoutEffect, useRef } from 'react'
import { drawSticker } from '../render/stickerLibrary'
import { MIN_STICKER_SIZE } from '../utils/strokeSerializer'

interface Props {
  stickerId: string
  color: string
  zoom: number
}

// The ghost a sticker stamp leaves under the cursor before it's placed. It draws the picked
// sticker onto a canvas at the exact size + center a click would commit (a MIN_STICKER_SIZE
// world-unit square, scaled by zoom), so the preview is a faithful 1:1 of the result. The
// canvas is DPR-scaled for crispness; its root is the `<span>` the `.tool-cursor` rule centers
// on the pointer, and the `.tool-cursor-sticker` class fades it to read as a preview.
const BOX = MIN_STICKER_SIZE // world units — matches buildStrokeData('sticker') / drawStickerStroke

export function StickerPreview({ stickerId, color, zoom }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const cssBox = BOX * zoom
    // Setting width/height resets the backing store (and its transform), so size first.
    cv.width = Math.max(1, Math.round(cssBox * dpr))
    cv.height = cv.width
    cv.style.width = `${cssBox}px`
    cv.style.height = `${cssBox}px`
    // World → device px, origin at the box center (drawSticker draws centered at the origin).
    const s = zoom * dpr
    ctx.setTransform(s, 0, 0, s, (BOX / 2) * s, (BOX / 2) * s)
    drawSticker(ctx, stickerId, BOX / 2, color)
  }, [stickerId, color, zoom])

  return (
    <span className='tool-cursor-sticker'>
      <canvas ref={canvasRef} />
    </span>
  )
}
