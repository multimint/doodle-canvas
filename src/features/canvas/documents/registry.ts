import type { DocumentKind } from './types'
import myDaySvg from './templates/myDay.svg'

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
    view: 'free',
    defaultTool: 'pen',
  },
  // The Daily Planner: a portrait Canvas pre-printed with the "My Day" sheet. Sized to the
  // template's printed proportions so default stroke/text sizes match a regular Canvas. Its
  // bounded view fits the whole sheet and clamps panning to its edges (see CONTEXT.md, ADR 0004).
  'daily-planner': {
    id: 'daily-planner',
    label: 'Daily Planner',
    width: 1080,
    height: 1396,
    background: 'image',
    backgroundImage: myDaySvg,
    view: 'bounded',
    defaultTool: 'pen',
    defaultTitle: 'My Day',
  },
}

// The descriptor for a stored kind id, falling back to the default for an unknown/missing kind
// (older documents created before the `kind` field existed).
export function documentKind(id?: string): DocumentKind {
  return DOCUMENT_KINDS[id ?? DEFAULT_DOCUMENT_KIND] ?? DOCUMENT_KINDS[DEFAULT_DOCUMENT_KIND]
}
