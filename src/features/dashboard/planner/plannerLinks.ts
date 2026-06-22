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
import type { CanvasDoc } from '../../../lib/types'

// A Linked Document is a per-user association between a calendar date in the Planner and a Canvas
// (of any kind, including a Daily Planner) — see CONTEXT.md, ADR 0004. Links live under the user's
// own subcollection, `users/{uid}/plannerDays/{isoDate}`, parallel to dayDoodles: ownership is
// pinned by the path, so a user can only address their own day links, and a shared canvas can be
// linked by each member independently. The cached title/kind let the side-panel list render a row
// without first fetching every canvas (existence is verified lazily by resolveLinks).

export interface PlannerLink {
  canvasId: string
  title: string
  kind: string
}

export interface PlannerDayDoc {
  date: string // ISO yyyy-mm-dd (also the doc id)
  links: PlannerLink[]
  updatedAt?: unknown
}

function plannerDaysCol(uid: string) {
  return collection(db, 'users', uid, 'plannerDays')
}

// One day's links (empty when the day has none yet).
export async function loadDayLinks(uid: string, iso: string): Promise<PlannerLink[]> {
  const snap = await getDoc(doc(plannerDaysCol(uid), iso))
  if (!snap.exists()) return []
  return (snap.data() as PlannerDayDoc).links ?? []
}

// The set of dates in [startIso, endIso] that have at least one linked document — one query per
// visible month, used to mark days on the Planner calendar.
export async function loadDayLinksRange(
  uid: string,
  startIso: string,
  endIso: string,
): Promise<Set<string>> {
  const q = query(plannerDaysCol(uid), where('date', '>=', startIso), where('date', '<=', endIso))
  const snap = await getDocs(q)
  const marked = new Set<string>()
  snap.forEach((d) => {
    if (((d.data() as PlannerDayDoc).links?.length ?? 0) > 0) marked.add(d.id)
  })
  return marked
}

// Whole-doc write of a day's links (read-modify-write; per-user so contention is negligible).
async function writeDayLinks(uid: string, iso: string, links: PlannerLink[]): Promise<void> {
  await setDoc(doc(plannerDaysCol(uid), iso), {
    date: iso,
    links,
    updatedAt: serverTimestamp(),
  } satisfies PlannerDayDoc)
}

// Link a canvas to a day. Idempotent on canvasId — re-linking refreshes the cached title/kind.
export async function addDayLink(uid: string, iso: string, link: PlannerLink): Promise<void> {
  const existing = await loadDayLinks(uid, iso)
  const next = [...existing.filter((l) => l.canvasId !== link.canvasId), link]
  await writeDayLinks(uid, iso, next)
}

// Remove a canvas's link from a day (does not touch the canvas itself).
export async function removeDayLink(uid: string, iso: string, canvasId: string): Promise<void> {
  const existing = await loadDayLinks(uid, iso)
  await writeDayLinks(uid, iso, existing.filter((l) => l.canvasId !== canvasId))
}

// A link resolved against its canvas: `canvas` is null when the canvas was deleted elsewhere (a
// dangling link), so the row can render it as unavailable.
export interface ResolvedLink {
  link: PlannerLink
  canvas: CanvasDoc | null
}

// Fetch each linked canvas to detect deletions. One getDoc per link (a day holds only a handful).
export async function resolveLinks(links: PlannerLink[]): Promise<ResolvedLink[]> {
  return Promise.all(
    links.map(async (link) => {
      try {
        const snap = await getDoc(doc(db, 'canvases', link.canvasId))
        return {
          link,
          canvas: snap.exists() ? ({ id: snap.id, ...snap.data() } as CanvasDoc) : null,
        }
      } catch {
        return { link, canvas: null }
      }
    }),
  )
}
