import { isoDate, parseIsoDate, sameDay, monthGrid } from './calendar'

describe('isoDate', () => {
  it('formats a date as yyyy-mm-dd with zero padding', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(isoDate(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('parseIsoDate', () => {
  it('round-trips with isoDate', () => {
    const d = new Date(2026, 5, 22)
    expect(isoDate(parseIsoDate(isoDate(d))!)).toBe('2026-06-22')
  })

  it('rejects malformed or invalid strings', () => {
    expect(parseIsoDate('2026-6-2')).toBeNull()
    expect(parseIsoDate('not-a-date')).toBeNull()
    expect(parseIsoDate('2026-13-01')).toBeNull()
  })
})

describe('sameDay', () => {
  it('ignores the time of day', () => {
    expect(sameDay(new Date(2026, 5, 22, 9), new Date(2026, 5, 22, 23))).toBe(true)
  })
  it('distinguishes different days', () => {
    expect(sameDay(new Date(2026, 5, 22), new Date(2026, 5, 23))).toBe(false)
  })
})

describe('monthGrid', () => {
  it('returns a 42-cell Monday-first grid', () => {
    const grid = monthGrid(new Date(2026, 5, 15)) // June 2026
    expect(grid).toHaveLength(42)
    expect(grid[0].getDay()).toBe(1) // Monday
  })

  it('starts on or before the first of the month and covers it', () => {
    const grid = monthGrid(new Date(2026, 5, 15))
    const first = new Date(2026, 5, 1)
    expect(grid[0].getTime()).toBeLessThanOrEqual(first.getTime())
    expect(grid.some((d) => sameDay(d, first))).toBe(true)
  })
})
