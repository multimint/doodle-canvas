import { descriptorFromStroke, descriptorFromLive } from './strokeDescriptor'
import { buildStrokeData } from '../utils/strokeSerializer'

describe('buildStrokeData', () => {
  it('keeps raw points for freehand tools', () => {
    expect(buildStrokeData('pen', [0, 0, 5, 5], '#abc', 4)).toEqual({
      points: [0, 0, 5, 5],
      stroke: '#abc',
      strokeWidth: 4,
    })
  })

  it('keeps raw points for the marker like other freehand tools', () => {
    expect(buildStrokeData('marker', [0, 0, 5, 5], '#abc', 8)).toEqual({
      points: [0, 0, 5, 5],
      stroke: '#abc',
      strokeWidth: 8,
    })
  })

  it('marks eraser strokes with a destination-out composite op', () => {
    const d = buildStrokeData('eraser', [0, 0, 1, 1], '#000', 8)
    expect(d.globalCompositeOperation).toBe('destination-out')
    expect(d.stroke).toBe('rgba(0,0,0,1)')
  })

  it('normalizes a rect to top-left origin and positive size', () => {
    const d = buildStrokeData('rect', [100, 80, 20, 10], '#f00', 2)
    expect(d).toMatchObject({ x: 20, y: 10, width: 80, height: 70 })
  })

  it('converts a circle drag to centre and radii', () => {
    const d = buildStrokeData('circle', [0, 0, 40, 20], '#f00', 2)
    expect(d).toMatchObject({ x: 20, y: 10, radiusX: 20, radiusY: 10 })
  })

  it('enforces minimum text box dimensions', () => {
    const d = buildStrokeData('text', [0, 0, 5, 5], '#000', 6)
    expect(d.width).toBe(200)
    expect(d.height).toBe(80)
  })
})

describe('descriptor adapters', () => {
  it('produce matching geometry from a committed rect and an equivalent live rect', () => {
    const points = [100, 80, 20, 10]
    const committed = descriptorFromStroke(
      buildStrokeData('rect', points, '#f00', 2),
    )
    const live = descriptorFromLive({
      type: 'rect',
      points,
      color: '#f00',
      strokeWidth: 2,
    })
    expect(live).toEqual(committed)
    expect(live).toMatchObject({ x: 20, y: 10, width: 80, height: 70 })
  })

  it('maps a live "path" back through the pen tool and preserves points', () => {
    const live = descriptorFromLive({
      type: 'path',
      points: [0, 0, 3, 3, 6, 1],
      color: '#123',
      strokeWidth: 5,
    })
    expect(live.points).toEqual([0, 0, 3, 3, 6, 1])
    expect(live.color).toBe('#123')
    expect(live.strokeWidth).toBe(5)
  })

  it('tolerates undefined data (RTDB drops strokes whose data serialized to {})', () => {
    expect(descriptorFromStroke(undefined)).toEqual({
      points: [],
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      radiusX: 0,
      radiusY: 0,
      color: undefined,
      strokeWidth: undefined,
    })
  })

  it('defaults missing fields to zero for legacy data', () => {
    expect(descriptorFromStroke({})).toEqual({
      points: [],
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      radiusX: 0,
      radiusY: 0,
      color: undefined,
      strokeWidth: undefined,
    })
  })
})
