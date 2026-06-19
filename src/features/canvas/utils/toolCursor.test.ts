import {
  MIN_CURSOR_SIZE,
  toolCursorSize,
  toolCursorVariant,
  usesToolCursor,
} from './toolCursor'

describe('toolCursorVariant', () => {
  it('uses a filled dot for the color free-draw tools', () => {
    expect(toolCursorVariant('pen')).toBe('filled')
    expect(toolCursorVariant('brush')).toBe('filled')
  })

  it('uses a hollow ring for the eraser', () => {
    expect(toolCursorVariant('eraser')).toBe('ring')
  })

  it('uses a crosshair for the drag-sized shape tools', () => {
    expect(toolCursorVariant('line')).toBe('crosshair')
    expect(toolCursorVariant('rect')).toBe('crosshair')
    expect(toolCursorVariant('circle')).toBe('crosshair')
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
    expect(usesToolCursor('eraser')).toBe(true)
    expect(usesToolCursor('rect')).toBe(true)
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
})
