import { stickerImage } from './stickerImages'

// The sticker render seam. Artwork now lives as SVG files under src/assets/stickers/ (loaded by
// stickerImages.ts); this module just stamps the cached image. `drawSticker` keeps its old
// signature so every caller (the canvas stamp, the toolbar thumbnail, the cursor preview) is
// unchanged. The per-user outline tint is intentionally dropped — an SVG bakes its own colours,
// so stickers are fixed colourful stamps (see the architecture plan's documented tradeoff).
export {
  STICKER_IDS,
  STICKER_LABELS,
} from '../../../assets/stickers/manifest'
export { onStickerLoad, preloadStickers } from './stickerImages'

// Draw a sticker centred at the origin, spanning ±`size` (so `size` is the half-width). The
// caller has already applied the world transform + any rotation. No-op until the image decodes.
export function drawSticker(
  ctx: CanvasRenderingContext2D,
  id: string,
  size: number,
  _strokeColor?: string,
): void {
  const img = stickerImage(id)
  if (!img || !img.complete || img.naturalWidth === 0) return
  ctx.drawImage(img, -size, -size, size * 2, size * 2)
}
