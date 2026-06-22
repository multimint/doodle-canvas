import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../../lib/icons'
import type { Stroke } from '../../../lib/types'
import { useDashboard } from '../DashboardContext'
import { loadDoodleRange } from '../planner/dayDoodle'
import { DayDoodleModal } from '../planner/DayDoodleModal'
import { DayDoodleThumbnail } from '../planner/DayDoodleThumbnail'
import { DateBadge } from '../planner/DateBadge'
import { useSharedBoil } from '../planner/useSharedBoil'
import { loadDayLinks, loadDayLinksRange, resolveLinks, type ResolvedLink } from '../planner/plannerLinks'
import { LinkedDocRow } from '../planner/LinkedDocRow'
import { AddDocumentModal } from '../planner/AddDocumentModal'

// ----------------------------------------------------------------- date helpers ---
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
// 6-week (42-cell) Monday-first grid covering the given month.
function monthGrid(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

const fmtShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const fmtFull = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const fmtMonthYear = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Planner: a month calendar whose date cards are drawable. Each date can hold a Day Doodle — a
// small personal drawing (see CONTEXT.md). The header "Edit canvas" button toggles an edit mode;
// while active, clicking a date opens its doodle modal. Saved doodles render back on the cards as
// thumbnails, all animated by one shared boil loop. The side panel lists the selected day's Linked
// Documents and lets the user add more (link an existing canvas, or create a new Daily Planner /
// blank Canvas) via the Add-document modal.
export function PlannerPage() {
  const { mobile, uid, owned } = useDashboard()
  const today = new Date()
  // Restore the day the user last had selected (e.g. before opening a linked canvas) so coming back
  // returns to it rather than jumping to today. Scoped to the tab session.
  const [selected, setSelected] = useState(() => {
    const saved = sessionStorage.getItem('plannerSelectedDate')
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) {
      const [y, m, d] = saved.split('-').map(Number)
      const dt = new Date(y, m - 1, d)
      if (!Number.isNaN(dt.getTime())) return dt
    }
    return new Date(today.getFullYear(), today.getMonth(), today.getDate())
  })
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1))
  const [editMode, setEditMode] = useState(false)
  const [openDate, setOpenDate] = useState<Date | null>(null)
  // Linked Documents for the selected day (see CONTEXT.md), and the Add-document modal toggle.
  const [links, setLinks] = useState<ResolvedLink[]>([])
  const [linksLoading, setLinksLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const linksTokenRef = useRef(0)
  // ISO dates in the visible grid that have at least one linked document — drives the calendar dot.
  const [linkedDays, setLinkedDays] = useState<Set<string>>(new Set())
  const markersTokenRef = useRef(0)
  const [markersVersion, setMarkersVersion] = useState(0)
  // Day Doodles for the visible range, keyed by ISO date. Reloaded on month change + modal close.
  const [doodles, setDoodles] = useState<Map<string, Stroke[]>>(new Map())
  const reloadRef = useRef(0)
  const [reloadKey, setReloadKey] = useState(0)
  const frame = useSharedBoil(true)
  // Stack the day panel under the calendar when the available width is tight — independent of the
  // `mobile` prop (which is fixed by the desktop-vs-mobile dashboard), so a narrow desktop window
  // reflows too.
  const splitRef = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  const stack = mobile || narrow

  // Drop whole weeks that fall entirely outside the current month.
  const visibleDays = (() => {
    const grid = monthGrid(month)
    const weeks: Date[][] = []
    for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7))
    return weeks.filter((w) => w.some((d) => d.getMonth() === month.getMonth())).flat()
  })()

  // Load every doodle covering the visible grid (one Firestore query per month / reload).
  useEffect(() => {
    if (visibleDays.length === 0) return
    const start = isoDate(visibleDays[0])
    const end = isoDate(visibleDays[visibleDays.length - 1])
    const token = ++reloadRef.current
    loadDoodleRange(uid, start, end)
      .then((map) => {
        if (token === reloadRef.current) setDoodles(map)
      })
      .catch((e) => console.error('Failed to load doodles', e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, month, reloadKey])

  // Load (and resolve against their canvases) the selected day's Linked Documents. Reloaded on day
  // change and after the Add-document modal closes or a row mutates.
  const reloadLinks = () => {
    const iso = isoDate(selected)
    const token = ++linksTokenRef.current
    setLinksLoading(true)
    loadDayLinks(uid, iso)
      .then(resolveLinks)
      .then((resolved) => {
        if (token === linksTokenRef.current) { setLinks(resolved); setLinksLoading(false) }
      })
      .catch((e) => {
        console.error('Failed to load day links', e)
        if (token === linksTokenRef.current) setLinksLoading(false)
      })
  }
  useEffect(() => {
    reloadLinks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, selected])

  // Remember the selected day across navigation (returning from a canvas re-selects it).
  useEffect(() => {
    sessionStorage.setItem('plannerSelectedDate', isoDate(selected))
  }, [selected])

  // Load which visible days have linked documents (one query per month / mutation) for the calendar
  // marker. Bumped via markersVersion after a link is added/removed.
  useEffect(() => {
    if (visibleDays.length === 0) return
    const start = isoDate(visibleDays[0])
    const end = isoDate(visibleDays[visibleDays.length - 1])
    const token = ++markersTokenRef.current
    loadDayLinksRange(uid, start, end)
      .then((set) => {
        if (token === markersTokenRef.current) setLinkedDays(set)
      })
      .catch((e) => console.error('Failed to load day markers', e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, month, markersVersion])

  // A linked-doc mutation (add/remove/delete) refreshes both the selected-day list and the markers.
  const onDayChanged = () => {
    reloadLinks()
    setMarkersVersion((v) => v + 1)
  }

  // Reflow the calendar/panel split based on the row's own width (not the viewport). The 1180px
  // row threshold corresponds to roughly a 1400px screen on the desktop dashboard (236px sidebar +
  // ~52px padding), so the panel drops below the calendar at/under ~1400px and stays beside it on
  // wider screens.
  useEffect(() => {
    const el = splitRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 1180))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const goToday = () => {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelected(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  }

  const calendar = (
    <div className="m-card" style={{ padding: 20, flex: stack ? 'none' : '1 1 auto' }}>
      <div className="m-row m-between" style={{ alignItems: 'center', marginBottom: 18 }}>
        <div className="m-row m-g12" style={{ alignItems: 'center' }}>
          <div className="m-display" style={{ fontSize: 24 }}>{fmtMonthYear.format(month)}</div>
          <button className="m-btn m-btn-sm m-btn-outline m-btn-pill" onClick={goToday}>Today</button>
        </div>
        <div className="m-row m-g8" style={{ alignItems: 'center' }}>
          <div className="m-row m-g4">
            <button className="m-tool" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <Icon name="back" size={18} />
            </button>
            <button className="m-tool" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <Icon name="back" size={18} style={{ transform: 'rotate(180deg)' }} />
            </button>
          </div>
          <button
            className={editMode ? 'm-btn m-btn-sm m-btn-primary' : 'm-btn m-btn-sm m-btn-outline'}
            onClick={() => setEditMode((v) => !v)}
            title={editMode ? 'Done editing' : 'Edit: click a day to draw on it'}
          >
            <Icon name="pen" size={14} color={editMode ? '#fff' : undefined} />
            <span>{editMode ? 'Done' : 'Edit canvas'}</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 9, marginBottom: 8 }}>
        {DOW.map((d) => (
          <div key={d} className="m-eyebrow" style={{ fontSize: 10.5, textAlign: 'center', letterSpacing: '.08em' }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 9 }}>
        {visibleDays.map((d) => {
          const out = d.getMonth() !== month.getMonth()
          const isSel = sameDay(d, selected)
          const isToday = sameDay(d, today)
          const iso = isoDate(d)
          const dayStrokes = doodles.get(iso)
          const hasDocs = linkedDays.has(iso)
          const onClick = () => {
            setSelected(new Date(d))
            // Only in-month days are drawable; next/prev-month spillover cards never open the modal.
            if (editMode && !out) setOpenDate(new Date(d))
          }
          return (
            <button
              key={iso}
              className="m-day"
              onClick={onClick}
              title={editMode && !out ? `Draw on ${fmtFull.format(d)}` : fmtFull.format(d)}
              style={{
                // Lock every card to the doodle frame's 4:3 ratio so the drawing maps perfectly,
                // at any screen size, with no letterboxing.
                position: 'relative', aspectRatio: '4 / 3', containerType: 'inline-size',
                borderRadius: 14, cursor: 'pointer', overflow: 'hidden', border: 'none',
                transition: 'transform .12s ease, box-shadow .14s ease, background .14s ease',
                background: isSel ? 'color-mix(in oklab, var(--m-primary) 12%, var(--m-surface))' : 'var(--m-surface)',
                opacity: out ? 0.45 : 1,
                boxShadow: isSel
                  ? 'inset 0 0 0 2px var(--m-primary)'
                  : isToday
                    ? 'inset 0 0 0 1.5px var(--m-primary)'
                    : 'inset 0 0 0 1.5px var(--m-line)',
              }}
            >
              {/* Saved doodle fills the card, behind the date; animated by the shared boil frame. */}
              {dayStrokes && dayStrokes.length > 0 && (
                <DayDoodleThumbnail strokes={dayStrokes} frame={frame} />
              )}
              <DateBadge
                day={d.getDate()}
                color={out ? 'var(--m-ink-3)' : (isToday && !isSel) ? 'var(--m-primary)' : 'var(--m-ink)'}
              />
              {editMode && !out && (
                <Icon
                  name="pen"
                  size={12}
                  style={{ position: 'absolute', top: '6%', right: '8%', zIndex: 1, opacity: 0.5 }}
                />
              )}
              {/* Marker: this day has at least one linked document. */}
              {hasDocs && (
                <span
                  aria-hidden
                  title="Has linked documents"
                  style={{
                    position: 'absolute', bottom: '8%', left: '50%', transform: 'translateX(-50%)',
                    width: '6cqw', height: '6cqw', minWidth: 4, minHeight: 4, maxWidth: 8, maxHeight: 8,
                    borderRadius: '50%', background: 'var(--m-primary)', zIndex: 1,
                    boxShadow: '0 0 0 2px var(--m-surface)',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )

  const info = (
    <div className="m-card" style={{ padding: 18, flex: stack ? 'none' : '0 0 300px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="m-row m-between" style={{ alignItems: 'flex-start', gap: 8 }}>
        <div className="m-col" style={{ gap: 3 }}>
          <div className="m-h3">{fmtShort.format(selected)}</div>
          <span className="m-tiny m-faint">{fmtFull.format(selected)}</span>
        </div>
        <button
          className="m-btn m-btn-sm m-btn-primary"
          style={{ padding: '7px 12px', flex: '0 0 auto' }}
          onClick={() => setAddOpen(true)}
        >
          <Icon name="plus" size={14} color="#fff" /><span>Add document</span>
        </button>
      </div>
      {linksLoading ? (
        <div className="m-col m-g8">
          {/* Skeleton rows shaped like LinkedDocRow while the day's documents load. */}
          {[0, 1].map((i) => (
            <div key={i} className="m-card m-card-sm" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 11 }}>
              <div className="m-skeleton" style={{ width: 34, height: 34, borderRadius: 10, flex: '0 0 auto' }} />
              <div className="m-col m-grow" style={{ gap: 6, minWidth: 0 }}>
                <div className="m-skeleton" style={{ height: 11, width: '70%' }} />
                <div className="m-skeleton" style={{ height: 9, width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : links.length === 0 ? (
        <div
          className="m-tiny"
          style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--m-ink-3)', borderRadius: 14, border: '1.5px dashed var(--m-line-2)' }}
        >
          No documents linked to this day yet.
        </div>
      ) : (
        <div className="m-col m-g8">
          {links.map((r) => (
            <LinkedDocRow key={r.link.canvasId} resolved={r} uid={uid} iso={isoDate(selected)} onChanged={onDayChanged} />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="m-col" style={{ gap: 18 }}>
      <div className="m-col" style={{ gap: 4 }}>
        <div className="m-h2">Planner</div>
        <span className="m-tiny m-faint">Pick a day to plan around it — doodle on it, or link documents to it.</span>
      </div>
      <div ref={splitRef} style={{ display: 'flex', flexDirection: stack ? 'column' : 'row', gap: 16, alignItems: 'stretch' }}>
        {calendar}{info}
      </div>

      {openDate && (
        <DayDoodleModal
          uid={uid}
          date={openDate}
          isoDate={isoDate(openDate)}
          onClose={() => {
            setOpenDate(null)
            setReloadKey((k) => k + 1) // refresh thumbnails with any new strokes
          }}
        />
      )}

      {addOpen && (
        <AddDocumentModal
          uid={uid}
          iso={isoDate(selected)}
          dateLabel={fmtFull.format(selected)}
          totalOwned={owned.length}
          onClose={(changed) => {
            setAddOpen(false)
            if (changed) onDayChanged()
          }}
        />
      )}
    </div>
  )
}
