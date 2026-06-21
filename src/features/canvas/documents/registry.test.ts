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
})
