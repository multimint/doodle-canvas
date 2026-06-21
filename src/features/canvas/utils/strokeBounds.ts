import type { Stroke } from '../../../lib/types'
import type { AABB } from './textBoxGeometry'
import { strokeKind } from '../tools/registry'

// World-space bounding box of a stroke, padded so neither its width nor its boil jitter can clip
// at the viewport edge. Returns null for kinds we never cull (text, sticker, unknown geometry) —
// the caller treats null as "always render". Used for viewport culling: off-screen strokes are
// dropped from the scene entirely, so they cost nothing to boil. The per-kind geometry now lives
// in the stroke-kind adapters (tools/strokeKinds.ts); this is a thin delegator over the registry.
export function strokeBounds(stroke: Stroke): AABB | null {
  return strokeKind(stroke.type).bounds(stroke.data ?? {})
}
