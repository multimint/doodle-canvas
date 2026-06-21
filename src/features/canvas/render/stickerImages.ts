import { STICKER_IDS } from '../../../assets/stickers/manifest'

// Loads the sticker SVGs (src/assets/stickers/*.svg) into cached <img> elements the canvas stamps
// via drawImage. The artwork is data now; this is the only code that knows it's an SVG file. The
// images decode asynchronously, so surfaces that paint once (toolbar thumbnails, the cursor
// preview) subscribe to onStickerLoad to repaint; the live canvas's boil loop repaints anyway.

// Vite resolves each SVG to a served URL at build time; the keys are the glob-relative paths.
const urls = import.meta.glob('../../../assets/stickers/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const urlById: Record<string, string> = {}
for (const [path, url] of Object.entries(urls)) {
  const id = path.split('/').pop()!.replace('.svg', '')
  urlById[id] = url
}

const cache = new Map<string, HTMLImageElement>()
const listeners = new Set<() => void>()

function ensure(id: string): HTMLImageElement | null {
  const existing = cache.get(id)
  if (existing) return existing
  const url = urlById[id]
  if (!url || typeof Image === 'undefined') return null
  const img = new Image()
  img.onload = () => listeners.forEach((l) => l())
  img.src = url
  cache.set(id, img)
  return img
}

// Kick off loading every sticker up front so the first stamp/preview isn't blank.
export function preloadStickers(): void {
  for (const id of STICKER_IDS) ensure(id)
}
preloadStickers()

// The (possibly still-decoding) image for a sticker id, falling back to flower for an unknown id.
export function stickerImage(id: string): HTMLImageElement | null {
  return ensure(id) ?? ensure('flower')
}

// Subscribe to "a sticker image finished decoding" so once-drawn surfaces can repaint. Returns
// an unsubscribe function.
export function onStickerLoad(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
