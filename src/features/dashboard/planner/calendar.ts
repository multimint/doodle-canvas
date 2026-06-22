// Pure calendar/date helpers for the Planner. Kept separate from the page component so the grid
// and date math can be unit-tested without rendering, and so the ISO date format used as the
// Firestore doc id lives in one place.

// ISO yyyy-mm-dd in local time. Used as the doc id for dayDoodles / plannerDays and to key the
// calendar's per-day lookups.
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Parse a yyyy-mm-dd string back to a local-time Date, or null if it isn't a real calendar date.
// Verifies by round-trip so out-of-range parts (month 13, day 30 of Feb) that JS Date would
// silently roll over are rejected.
export function parseIsoDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return !Number.isNaN(dt.getTime()) && isoDate(dt) === s ? dt : null
}

// True when two dates fall on the same calendar day (local time).
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// The 6-week (42-cell) Monday-first grid of dates covering the month containing `date`.
export function monthGrid(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}
