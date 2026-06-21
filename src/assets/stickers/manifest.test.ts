import { STICKERS, STICKER_IDS, STICKER_LABELS } from './manifest'

// Vite resolves the sibling SVGs to URLs; the keys tell us which files exist on disk.
const svgFiles = import.meta.glob('./*.svg', { eager: true, query: '?url', import: 'default' })
const fileIds = Object.keys(svgFiles).map((p) => p.split('/').pop()!.replace('.svg', ''))

describe('sticker manifest', () => {
  it('has a label for every id', () => {
    for (const id of STICKER_IDS) expect(STICKER_LABELS[id]).toBeTruthy()
  })

  it('matches the SVG files on disk one-to-one', () => {
    expect([...STICKER_IDS].sort()).toEqual([...fileIds].sort())
  })

  it('derives ids and labels from the same entries', () => {
    expect(STICKER_IDS).toEqual(STICKERS.map((s) => s.id))
  })
})
