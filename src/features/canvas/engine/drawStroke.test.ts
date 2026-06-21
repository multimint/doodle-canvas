import { drawSimpleStroke, drawStickerStroke, type DrawOpts } from './drawStroke'
import type { ShapeDescriptor } from '../render/strokeDescriptor'

// Minimal recording stand-in for CanvasRenderingContext2D: logs the calls we assert on and
// snapshots the style props that matter at paint time (composite op for the eraser).
function mockCtx() {
  const ops: { op: string; args: number[] }[] = []
  let saves = 0
  let restores = 0
  let gcoAtStroke = ''
  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    globalCompositeOperation: 'source-over',
    save() {
      saves++
    },
    restore() {
      restores++
      this.globalCompositeOperation = 'source-over'
    },
    beginPath() {
      ops.push({ op: 'beginPath', args: [] })
    },
    moveTo(x: number, y: number) {
      ops.push({ op: 'moveTo', args: [x, y] })
    },
    lineTo(x: number, y: number) {
      ops.push({ op: 'lineTo', args: [x, y] })
    },
    closePath() {
      ops.push({ op: 'closePath', args: [] })
    },
    stroke() {
      gcoAtStroke = this.globalCompositeOperation
      ops.push({ op: 'stroke', args: [] })
    },
    fill() {
      ops.push({ op: 'fill', args: [] })
    },
    rect(x: number, y: number, w: number, h: number) {
      ops.push({ op: 'rect', args: [x, y, w, h] })
    },
    arc() {
      ops.push({ op: 'arc', args: [] })
    },
    ellipse() {
      ops.push({ op: 'ellipse', args: [] })
    },
    translate(x: number, y: number) {
      ops.push({ op: 'translate', args: [x, y] })
    },
    rotate(a: number) {
      ops.push({ op: 'rotate', args: [a] })
    },
    drawImage() {
      ops.push({ op: 'drawImage', args: [] })
    },
  }
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    ops,
    counts: () => ({ saves, restores }),
    gcoAtStroke: () => gcoAtStroke,
  }
}

const baseOpts: DrawOpts = { frame: 0, salt: 7, wiggle: false }

function desc(over: Partial<ShapeDescriptor>): ShapeDescriptor {
  return {
    points: [],
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    radiusX: 0,
    radiusY: 0,
    color: '#123',
    strokeWidth: 4,
    ...over,
  }
}

describe('drawSimpleStroke', () => {
  it('traces a polyline and strokes for a path, balancing save/restore', () => {
    const m = mockCtx()
    drawSimpleStroke(m.ctx, 'path', desc({ points: [0, 0, 10, 5, 20, 0] }), baseOpts)
    const names = m.ops.map((o) => o.op)
    expect(names).toContain('moveTo')
    expect(names.filter((n) => n === 'lineTo')).toHaveLength(2)
    expect(names).toContain('stroke')
    expect(m.counts().saves).toBe(m.counts().restores)
  })

  it('draws clean base points when wiggle is off', () => {
    const m = mockCtx()
    drawSimpleStroke(m.ctx, 'path', desc({ points: [0, 0, 10, 10] }), baseOpts)
    const move = m.ops.find((o) => o.op === 'moveTo')!
    const line = m.ops.find((o) => o.op === 'lineTo')!
    expect(move.args).toEqual([0, 0])
    expect(line.args).toEqual([10, 10])
  })

  it('jitters vertices off their base when wiggle is on', () => {
    const m = mockCtx()
    drawSimpleStroke(m.ctx, 'path', desc({ points: [0, 0, 10, 10] }), {
      ...baseOpts,
      wiggle: true,
      frame: 1,
    })
    const move = m.ops.find((o) => o.op === 'moveTo')!
    expect(move.args).not.toEqual([0, 0])
  })

  it('paints the eraser with destination-out, then restores source-over', () => {
    const m = mockCtx()
    drawSimpleStroke(m.ctx, 'eraser', desc({ points: [0, 0, 5, 5] }), baseOpts)
    expect(m.gcoAtStroke()).toBe('destination-out')
    expect(m.ctx.globalCompositeOperation).toBe('source-over')
  })

  it('closes the outline for rect and circle', () => {
    const r = mockCtx()
    drawSimpleStroke(r.ctx, 'rect', desc({ x: 0, y: 0, width: 40, height: 20 }), baseOpts)
    expect(r.ops.map((o) => o.op)).toContain('closePath')

    const c = mockCtx()
    drawSimpleStroke(c.ctx, 'circle', desc({ x: 0, y: 0, radiusX: 30, radiusY: 10 }), baseOpts)
    expect(c.ops.map((o) => o.op)).toContain('closePath')
  })
})

describe('drawStickerStroke', () => {
  it('translates to the sticker center and balances save/restore', () => {
    const m = mockCtx()
    drawStickerStroke(m.ctx, { x: 100, y: 100, width: 120, height: 120, stickerId: 'star' })
    const translate = m.ops.find((o) => o.op === 'translate')!
    expect(translate.args).toEqual([160, 160]) // center = x + w/2
    expect(m.counts().saves).toBe(m.counts().restores)
  })
})
