import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  StrokeSchema,
  StoredStrokeSchema,
  CanvasDocSchema,
  parseOrNull,
  parseStrokeList,
} from './schemas'
import type { Stroke } from './types'

const wellFormedStored = {
  type: 'path',
  authorId: 'u1',
  data: { points: [0, 0, 1, 1], stroke: '#000', strokeWidth: 4 },
  timestamp: 1000,
}

const wellFormedStroke: Stroke = { id: 's1', ...wellFormedStored } as Stroke

describe('parseOrNull', () => {
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
  afterEach(() => { warn.mockRestore() })

  it('returns the parsed value for valid input', () => {
    expect(parseOrNull(StoredStrokeSchema, wellFormedStored, 'stroke')).toEqual(wellFormedStored)
  })

  it('returns null and warns for invalid input', () => {
    const bad = { ...wellFormedStored, timestamp: 'nope' }
    expect(parseOrNull(StoredStrokeSchema, bad, 'stroke')).toBeNull()
  })

  it('returns null for missing required fields', () => {
    expect(parseOrNull(StoredStrokeSchema, { type: 'path' }, 'stroke')).toBeNull()
  })
})

describe('StrokeSchema', () => {
  it('requires an id', () => {
    expect(StrokeSchema.safeParse(wellFormedStroke).success).toBe(true)
    expect(StrokeSchema.safeParse(wellFormedStored).success).toBe(false)
  })

  it('rejects an unknown stroke type', () => {
    expect(StrokeSchema.safeParse({ ...wellFormedStroke, type: 'spline' }).success).toBe(false)
  })
})

describe('CanvasDocSchema', () => {
  const doc = {
    id: 'c1', title: 'T', ownerId: 'u1', members: ['u1'], pendingInvites: [],
    width: 1920, height: 1080, createdAt: 1, updatedAt: 2,
  }

  it('parses a valid doc', () => {
    expect(CanvasDocSchema.safeParse(doc).success).toBe(true)
  })

  it('passes unknown fields through untouched (loose)', () => {
    const withExtra = { ...doc, snapshotAt: { toMillis: () => 5 }, kind: 'daily-planner' }
    const parsed = CanvasDocSchema.parse(withExtra)
    expect(parsed.kind).toBe('daily-planner')
    expect((parsed as Record<string, unknown>).snapshotAt).toBeDefined()
  })

  it('accepts a Firestore Timestamp createdAt (serverTimestamp resolves to a Timestamp, not a number)', () => {
    // Regression: validating createdAt as a number dropped every real canvas doc.
    const withTimestamp = { ...doc, createdAt: { seconds: 1, nanoseconds: 0, toMillis: () => 1000 } }
    expect(CanvasDocSchema.safeParse(withTimestamp).success).toBe(true)
  })

  it('rejects a doc missing required fields', () => {
    const { ownerId: _omit, ...missing } = doc
    expect(CanvasDocSchema.safeParse(missing).success).toBe(false)
  })
})

describe('parseStrokeList', () => {
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
  afterEach(() => { vi.restoreAllMocks() })

  it('keeps valid strokes and drops malformed ones', () => {
    const raw = [wellFormedStroke, { id: 'x', type: 'path' }, { ...wellFormedStroke, id: 's2' }]
    const out = parseStrokeList(raw, 'test')
    expect(out.map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('returns [] for non-array input', () => {
    expect(parseStrokeList(undefined, 'test')).toEqual([])
    expect(parseStrokeList(null, 'test')).toEqual([])
  })
})
