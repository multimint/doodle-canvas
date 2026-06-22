import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import { parseStrokeList } from '../../../lib/schemas'
import type { Stroke } from '../../../lib/types'

// A Day Doodle is a small, personal drawing pinned to one calendar date — distinct from a Canvas
// (see CONTEXT.md). It is non-collaborative, so unlike Canvas strokes (which live in RTDB per
// ADR 0001) the whole drawing is stored inline in a single Firestore document under the user's
// own subcollection: `users/{uid}/dayDoodles/{isoDate}`. Ownership is therefore pinned by the
// path — a user can't even address another user's doodles. See docs/adr/0003.

// The fixed coordinate space every doodle is drawn against (4:3). Strokes are stored in these
// units and scaled to fit the modal / calendar card, which keep the same ratio so the drawing
// always maps 1:1 with no letterboxing. The world is deliberately larger than the on-screen card
// so the canvas's default element sizes (sticker, text box, stroke width) sit sensibly within the
// frame rather than dwarfing it. Kept here (not in the canvas DOCUMENT_KINDS registry) to keep the
// Day-Doodle-vs-Canvas concept boundary clean.
export const DAY_FRAME = { width: 640, height: 480 } as const

// Conservative guard against Firestore's 1 MiB document limit. A dense freehand path dominates
// the inline payload, so cap on total point count rather than stroke count.
export const MAX_DOODLE_POINTS = 12000

export interface DayDoodleDoc {
  date: string // ISO yyyy-mm-dd (also the doc id)
  strokes: Stroke[]
  updatedAt?: unknown
}

function doodlesCol(uid: string) {
  return collection(db, 'users', uid, 'dayDoodles')
}

// Total stored point count — used to enforce MAX_DOODLE_POINTS before a save.
export function doodlePointCount(strokes: Stroke[]): number {
  let n = 0
  for (const s of strokes) n += s.data.points?.length ?? 0
  return n
}

const byTimestamp = (a: Stroke, b: Stroke) => a.timestamp - b.timestamp

// One day's strokes (empty array when the day has no doodle yet).
export async function loadDoodle(uid: string, date: string): Promise<Stroke[]> {
  const snap = await getDoc(doc(doodlesCol(uid), date))
  if (!snap.exists()) return []
  return parseStrokeList(snap.data().strokes, `dayDoodle ${date}`).sort(byTimestamp)
}

// Overwrite a day's doodle with the given strokes (whole-doc write — see ADR 0003 trade-offs).
export async function saveDoodle(uid: string, date: string, strokes: Stroke[]): Promise<void> {
  await setDoc(doc(doodlesCol(uid), date), {
    date,
    strokes,
    updatedAt: serverTimestamp(),
  } satisfies DayDoodleDoc)
}

// Every doodle whose date falls in [startIso, endIso] inclusive, keyed by ISO date — one query
// per visible month for the calendar thumbnails.
export async function loadDoodleRange(
  uid: string,
  startIso: string,
  endIso: string,
): Promise<Map<string, Stroke[]>> {
  const q = query(doodlesCol(uid), where('date', '>=', startIso), where('date', '<=', endIso))
  const snap = await getDocs(q)
  const map = new Map<string, Stroke[]>()
  snap.forEach((d) => {
    map.set(d.id, parseStrokeList(d.data().strokes, `dayDoodle ${d.id}`).sort(byTimestamp))
  })
  return map
}
