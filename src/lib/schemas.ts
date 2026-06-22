import { z } from 'zod'
import type {
  CanvasDoc,
  Stroke,
  StrokeData,
  CursorPos,
  TextFocus,
  PresenceEntry,
} from './types'

// Runtime validation for everything crossing the Firebase boundary.
//
// `lib/types.ts` stays the source of truth for the domain types; the schemas here
// mirror it and are checked against it with `satisfies` parity assertions at the
// bottom of this file, so the two can't silently drift. Repositories in `src/data/`
// are the only callers — they parse raw snapshots through these instead of casting
// (`as Stroke`), so a malformed record is logged and dropped rather than blowing up
// at render time.

const toolType = z.enum([
  'pen', 'marker', 'eraser', 'rect', 'circle',
  'line', 'text', 'sticker', 'hand', 'select',
])

const marquee = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
})

export const StrokeDataSchema = z.object({
  points: z.array(z.number()).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  radiusX: z.number().optional(),
  radiusY: z.number().optional(),
  text: z.string().optional(),
  fontSize: z.number().optional(),
  rotation: z.number().optional(),
  stickerId: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  fill: z.string().optional(),
  globalCompositeOperation: z.string().optional(),
})

const strokeType = z.enum([
  'path', 'marker', 'rect', 'circle', 'line', 'text', 'sticker', 'eraser',
])

// Strokes are stored in RTDB keyed by their push-id, so the persisted value has no
// `id` field — the repository attaches the key after parsing. This schema validates
// that persisted value.
export const StoredStrokeSchema = z.object({
  type: strokeType,
  authorId: z.string(),
  data: StrokeDataSchema,
  timestamp: z.number(),
})

export const StrokeSchema = StoredStrokeSchema.extend({ id: z.string() })

// Canvas/Day-Doodle documents carry Firestore-specific fields (Timestamp objects on
// `snapshotAt`/`deleteAt`) and may pick up new fields over time, so these are loose:
// unknown keys pass through untouched rather than being stripped (which would drop
// data on round-trip writes).
const canvasDocShape = z.object({
  id: z.string(),
  title: z.string(),
  ownerId: z.string(),
  members: z.array(z.string()),
  pendingInvites: z.array(z.string()),
  kind: z.string().optional(),
  width: z.number(),
  height: z.number(),
  // `createdAt` is written with serverTimestamp(), so on read it's a Firestore Timestamp object,
  // not a number — it's never read client-side, so it isn't modelled here and just passes through
  // the loose schema. (Validating it as z.number() would drop every real canvas doc.)
  updatedAt: z.number(),
  snapshotStrokeIds: z.array(z.string()).optional(),
})

export const CanvasDocSchema = canvasDocShape.loose()

export const CursorPosSchema = z.object({
  x: z.number(),
  y: z.number(),
  color: z.string(),
  tool: toolType.optional(),
  strokeWidth: z.number().optional(),
  marquee: marquee.optional(),
  selectedIds: z.array(z.string()).optional(),
})

export const TextFocusSchema = z.object({
  boxId: z.string(),
  editing: z.boolean(),
  color: z.string(),
  text: z.string().optional(),
  caret: z.number().optional(),
})

export const PresenceEntrySchema = z.object({
  displayName: z.string(),
  photoURL: z.string(),
  color: z.string(),
  joinedAt: z.number(),
})

// Day Doodles are stored inline in one Firestore doc with `updatedAt` written as a serverTimestamp
// (a Timestamp object on read, not a number), so the doc is loose and `updatedAt` is unmodelled.
// Strokes are validated per-element by the loader (`parseStrokeList`) so one bad stroke doesn't
// drop the whole day's drawing.
export const DayDoodleDocSchema = z
  .object({
    date: z.string(),
    strokes: z.array(z.unknown()).optional(),
  })
  .loose()

// Validate an array of *full* (id-bearing) strokes, dropping malformed entries. Used for inline
// stroke arrays stored in Firestore documents (Day Doodles).
export function parseStrokeList(raw: unknown, context: string): Stroke[] {
  if (!Array.isArray(raw)) return []
  const out: Stroke[] = []
  for (const item of raw) {
    const parsed = parseOrNull(StrokeSchema, item, context)
    if (parsed) out.push(parsed)
  }
  return out
}

// Single boundary helper: parse `raw`, returning the validated value or `null`.
// On failure it logs (with `context` so the offending source is identifiable) and
// drops the record, keeping malformed data out of render. Callers filter nulls.
export function parseOrNull<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  context: string,
): T | null {
  const result = schema.safeParse(raw)
  if (result.success) return result.data
  if (import.meta.env?.DEV) {
    console.warn(`[schema] dropped malformed ${context}:`, result.error.issues)
  }
  return null
}

// ---------------------------------------------------------------------------
// Parity assertions: keep these schemas in lockstep with `lib/types.ts`. If a
// domain type changes shape, one of these lines stops compiling. Each line asserts the
// schema's output type is assignable to the domain type. For CanvasDoc we assert against
// the strict base shape (the exported schema is `.loose()`, whose `unknown` index
// signature models the Firestore Timestamp fields not listed here).
// ---------------------------------------------------------------------------
void (({}) as z.infer<typeof StrokeDataSchema> satisfies StrokeData)
void (({}) as z.infer<typeof StrokeSchema> satisfies Stroke)
void (({}) as z.infer<typeof CursorPosSchema> satisfies CursorPos)
void (({}) as z.infer<typeof TextFocusSchema> satisfies TextFocus)
void (({}) as z.infer<typeof PresenceEntrySchema> satisfies PresenceEntry)
void (({}) as z.infer<typeof canvasDocShape> satisfies CanvasDoc)
