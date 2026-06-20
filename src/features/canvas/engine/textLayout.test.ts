import {
  layoutText,
  caretRect,
  type TextLayoutOpts,
  type Measure,
} from './textLayout'

// Synthetic metric: every char is 10px wide. Makes wrapping deterministic without real fonts.
const measure: Measure = (s) => s.length * 10

function opts(over: Partial<TextLayoutOpts> = {}): TextLayoutOpts {
  return {
    fontSize: 20,
    fontFamily: 'test',
    width: 100, // fits 10 chars
    height: 100,
    lineHeight: 1,
    align: 'center',
    verticalAlign: 'middle',
    ...over,
  }
}

describe('layoutText', () => {
  it('keeps a short line on one row', () => {
    const l = layoutText('hello', opts(), measure)
    expect(l.lines.map((x) => x.text)).toEqual(['hello'])
    expect(l.lines[0].width).toBe(50)
  })

  it('word-wraps on the box width, dropping the boundary space', () => {
    // "aaaa bbbb cccc" = 14 chars; width fits 10 → "aaaa bbbb" (9) then "cccc".
    const l = layoutText('aaaa bbbb cccc', opts(), measure)
    expect(l.lines.map((x) => x.text)).toEqual(['aaaa bbbb', 'cccc'])
  })

  it('char-wraps a single word longer than the box', () => {
    const l = layoutText('abcdefghijklmno', opts(), measure) // 15 chars, width 10
    expect(l.lines.map((x) => x.text)).toEqual(['abcdefghij', 'klmno'])
  })

  it('honours hard line breaks', () => {
    const l = layoutText('a\nb', opts(), measure)
    expect(l.lines.map((x) => x.text)).toEqual(['a', 'b'])
  })

  it('computes total height from line count × line height', () => {
    const l = layoutText('aaaa bbbb cccc', opts(), measure)
    expect(l.totalHeight).toBe(2 * 20)
  })
})

describe('caretRect', () => {
  it('places the caret after N chars on the centered first line', () => {
    const text = 'hello'
    const l = layoutText(text, opts(), measure)
    const c = caretRect(l, text, 3, opts(), measure)
    // line width 50, centered in 100 → left 25; 3 chars × 10 = 30 → x 55.
    expect(c.x).toBe(25 + 30)
    // single line, block height 20 centered in 100 → top 40, line 0.
    expect(c.y).toBe(40)
    expect(c.h).toBe(20)
  })

  it('moves to the second line for a caret past the wrap', () => {
    const text = 'aaaa bbbb cccc'
    const l = layoutText(text, opts(), measure)
    // caret at end (14) → second line "cccc", col 4.
    const c = caretRect(l, text, 14, opts(), measure)
    expect(c.y).toBe((100 - 40) / 2 + 20) // block top + 1 line
  })

  it('clamps an out-of-range caret to the text length', () => {
    const text = 'hi'
    const l = layoutText(text, opts(), measure)
    const c = caretRect(l, text, 999, opts(), measure)
    expect(c.x).toBeCloseTo((100 - 20) / 2 + 20)
  })
})
