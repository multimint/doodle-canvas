import { DOCUMENT_KINDS, DEFAULT_DOCUMENT_KIND, documentKind } from './registry'

describe('document-kind registry', () => {
  it('ships the default canvas kind', () => {
    expect(DOCUMENT_KINDS[DEFAULT_DOCUMENT_KIND]).toBeDefined()
    expect(documentKind('canvas').width).toBe(1920)
    expect(documentKind('canvas').height).toBe(1080)
  })

  it('falls back to the default for a missing or unknown kind', () => {
    expect(documentKind(undefined).id).toBe(DEFAULT_DOCUMENT_KIND)
    expect(documentKind('does-not-exist').id).toBe(DEFAULT_DOCUMENT_KIND)
  })

  it('ships the daily-planner kind as a bounded, image-backed portrait sheet', () => {
    const planner = documentKind('daily-planner')
    expect(planner.id).toBe('daily-planner')
    expect(planner.view).toBe('bounded')
    expect(planner.background).toBe('image')
    expect(planner.backgroundImage).toBeTruthy()
    // Portrait, sized to the template's printed proportions.
    expect(planner.height).toBeGreaterThan(planner.width)
    expect(planner.width).toBe(1080)
    expect(planner.height).toBe(1396)
    expect(planner.defaultTitle).toBe('My Day')
  })
})
