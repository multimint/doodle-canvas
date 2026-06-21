import type { DocumentKind } from './types'

export type { DocumentKind } from './types'

// The document-kind table. Add a template by adding an entry; creation stamps its size/kind and
// the canvas reads its background + defaults from here.
export const DEFAULT_DOCUMENT_KIND = 'canvas'

export const DOCUMENT_KINDS: Record<string, DocumentKind> = {
  canvas: {
    id: 'canvas',
    label: 'Canvas',
    width: 1920,
    height: 1080,
    background: 'dot-grid',
    defaultTool: 'pen',
  },
}

// The descriptor for a stored kind id, falling back to the default for an unknown/missing kind
// (older documents created before the `kind` field existed).
export function documentKind(id?: string): DocumentKind {
  return DOCUMENT_KINDS[id ?? DEFAULT_DOCUMENT_KIND] ?? DOCUMENT_KINDS[DEFAULT_DOCUMENT_KIND]
}
