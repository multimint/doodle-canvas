import { cursorForTool } from './cursorForTool'

describe('cursorForTool', () => {
  it('keeps hand and select cursors regardless of disabled', () => {
    expect(cursorForTool('hand', true)).toBe('grab')
    expect(cursorForTool('select', true)).toBe('default')
  })

  it('shows not-allowed for drawing tools when disabled', () => {
    expect(cursorForTool('pen', true)).toBe('not-allowed')
    expect(cursorForTool('eraser', true)).toBe('not-allowed')
  })

  it('maps each drawing tool to its cursor when enabled', () => {
    expect(cursorForTool('eraser', false)).toBe('cell')
    expect(cursorForTool('text', false)).toBe('text')
    expect(cursorForTool('pen', false)).toBe('crosshair')
  })
})
