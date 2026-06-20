import {
  MIN_CURSOR_SIZE,
  toolCursorSize,
  toolCursorVariant,
  toolFootprintScale,
  usesToolCursor,
} from './toolCursor'

describe('toolCursorVariant', () => {
  it('gives each free-draw tool its own footprint-matched visual', () => {
    expect(toolCursorVariant('pen')).toBe('pen')
    expect(toolCursorVariant('brush')).toBe('spray')
    expect(toolCursorVariant('marker')).toBe('marker')
  })

  it('uses a hollow ring for the eraser', () => {
    expect(toolCursorVariant('eraser')).toBe('ring')
  })

  it('uses a crosshair for the drag-sized shape tools', () => {
    expect(toolCursorVariant('line')).toBe('crosshair')
    expect(toolCursorVariant('rect')).toBe('crosshair')
    expect(toolCursorVariant('circle')).toBe('crosshair')
  })

  it('previews the stamp with a sticker follower', () => {
    expect(toolCursorVariant('sticker')).toBe('sticker')
  })

  it('has no follower for text / hand / select', () => {
    expect(toolCursorVariant('text')).toBe('none')
    expect(toolCursorVariant('hand')).toBe('none')
    expect(toolCursorVariant('select')).toBe('none')
  })
})

describe('usesToolCursor', () => {
  it('is true for every drawing tool and false otherwise', () => {
    expect(usesToolCursor('pen')).toBe(true)
    expect(usesToolCursor('marker')).toBe(true)
    expect(usesToolCursor('eraser')).toBe(true)
    expect(usesToolCursor('rect')).toBe(true)
    expect(usesToolCursor('sticker')).toBe(true)
    expect(usesToolCursor('text')).toBe(false)
    expect(usesToolCursor('hand')).toBe(false)
    expect(usesToolCursor('select')).toBe(false)
  })
})

describe('toolCursorSize', () => {
  it('scales the painted width by zoom above the floor', () => {
    expect(toolCursorSize(22, 2)).toBe(44)
    expect(toolCursorSize(12, 1)).toBe(12)
  })

  it('never renders smaller than the minimum', () => {
    expect(toolCursorSize(3, 0.5)).toBe(MIN_CURSOR_SIZE)
    expect(toolCursorSize(6, 1)).toBe(MIN_CURSOR_SIZE) // exactly at the floor
  })

  it('applies the tool footprint multiplier to the diameter', () => {
    expect(toolCursorSize(10, 1, 3)).toBe(30) // marker: 3× width
    expect(toolCursorSize(10, 1, 5)).toBe(50) // spray: ~5× cloud
  })
})

describe('toolFootprintScale', () => {
  it('mirrors each tool real painted width', () => {
    expect(toolFootprintScale('pen')).toBe(1)
    expect(toolFootprintScale('marker')).toBe(3)
    expect(toolFootprintScale('brush')).toBe(5)
  })
})
