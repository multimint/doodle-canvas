import { TOOLS, TOOL_LIST, STROKE_KINDS, strokeKind, strokeKindForTool } from './registry'
import type { Stroke, ToolType } from '../../../lib/types'

const ALL_TOOLS: ToolType[] = [
  'pen', 'marker', 'eraser', 'rect', 'circle', 'line', 'text', 'sticker', 'hand', 'select',
]
const ALL_TYPES: Stroke['type'][] = [
  'path', 'marker', 'rect', 'circle', 'line', 'text', 'sticker', 'eraser',
]

describe('tool registry', () => {
  it('has a descriptor for every ToolType', () => {
    for (const t of ALL_TOOLS) {
      expect(TOOLS[t]).toBeDefined()
      expect(TOOLS[t].id).toBe(t)
    }
  })

  it('produces a registered stroke kind for every drawing tool', () => {
    for (const t of ALL_TOOLS) {
      const produces = TOOLS[t].produces
      if (produces) expect(STROKE_KINDS[produces]).toBeDefined()
    }
  })

  it('maps pen to the path stroke kind and hand/select to none', () => {
    expect(strokeKindForTool('pen')?.type).toBe('path')
    expect(strokeKindForTool('hand')).toBeNull()
    expect(strokeKindForTool('select')).toBeNull()
  })

  it('lists only toolbar tools, in order, via TOOL_LIST', () => {
    const toolbar = TOOL_LIST.filter((t) => t.inToolbar).map((t) => t.id)
    expect(toolbar).toEqual(['pen', 'marker', 'line', 'rect', 'circle', 'text', 'sticker'])
  })
})

describe('stroke-kind registry', () => {
  it('has an adapter for every Stroke type', () => {
    for (const ty of ALL_TYPES) {
      expect(STROKE_KINDS[ty]).toBeDefined()
      expect(strokeKind(ty).type).toBe(ty)
    }
  })

  it('routes the eraser to the mask layer (cuts both raster layers)', () => {
    expect(strokeKind('eraser').layer).toBe('mask')
    expect(strokeKind('marker').layer).toBe('marker')
    expect(strokeKind('text').layer).toBe('last')
    expect(strokeKind('sticker').layer).toBe('last')
    expect(strokeKind('path').layer).toBe('main')
  })

  it('never culls text or stickers (bounds null)', () => {
    expect(strokeKind('text').bounds({ x: 0, y: 0, width: 200, height: 80 })).toBeNull()
    expect(strokeKind('sticker').bounds({ x: 0, y: 0, width: 120, height: 120 })).toBeNull()
  })

  it('bounds a pen stroke around its points, padded by width', () => {
    const b = strokeKind('path').bounds({ points: [0, 0, 100, 50], strokeWidth: 6 })!
    expect(b).not.toBeNull()
    expect(b.minX).toBeLessThan(0)
    expect(b.maxX).toBeGreaterThan(100)
    expect(b.maxY).toBeGreaterThan(50)
  })
})
