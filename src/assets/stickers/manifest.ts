// The sticker catalogue as data. Each entry's artwork is the matching SVG file in this folder —
// the vector assets live here, separate from rendering code. Add a sticker by dropping in
// `<id>.svg` and adding one line below; the loader (render/stickerImages.ts) discovers the file
// by id and everything downstream (toolbar, preview, canvas stamp) picks it up.

export interface StickerEntry {
  id: string
  label: string
}

export const STICKERS: StickerEntry[] = [
  { id: 'flower', label: 'Flower' },
  { id: 'sun', label: 'Sun' },
  { id: 'moon', label: 'Moon' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'cat', label: 'Cat' },
  { id: 'frog', label: 'Frog' },
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'boba', label: 'Boba' },
  { id: 'bear', label: 'Bear' },
  { id: 'mushroom', label: 'Mushroom' },
  { id: 'star', label: 'Star' },
]

export const STICKER_IDS = STICKERS.map((s) => s.id)

export const STICKER_LABELS: Record<string, string> = Object.fromEntries(
  STICKERS.map((s) => [s.id, s.label]),
)
