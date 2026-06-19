import { STROKE_SIZES, stepStrokeWidth } from './strokeSize'

describe('stepStrokeWidth', () => {
  it('steps up and down through the listed sizes', () => {
    expect(stepStrokeWidth(3, 1)).toBe(6)
    expect(stepStrokeWidth(6, 1)).toBe(12)
    expect(stepStrokeWidth(12, -1)).toBe(6)
  })

  it('clamps at the ends', () => {
    expect(stepStrokeWidth(3, -1)).toBe(3)
    expect(stepStrokeWidth(22, 1)).toBe(22)
  })

  it('snaps an off-list value to the nearest size before stepping', () => {
    expect(stepStrokeWidth(7, 1)).toBe(12) // nearest is 6 -> up to 12
    expect(stepStrokeWidth(10, -1)).toBe(6) // nearest is 12 -> down to 6
  })

  it('exposes exactly the toolbar sizes', () => {
    expect(STROKE_SIZES).toEqual([3, 6, 12, 22])
  })
})
