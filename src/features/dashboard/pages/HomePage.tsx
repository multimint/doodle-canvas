import { useNavigate } from 'react-router-dom'
import { Icon } from '../../../lib/icons'
import { CanvasCard } from '../CanvasCard'
import { CanvasListRow } from '../CanvasListRow'
import { EmptyState, NoResultsState } from '../DashboardEmptyStates'
import { type PageProps, docCols, filterByTitle, byRecent, SectionHead } from './shared'

// Home: greeting hero + "current focus" card, a "Continue working" grid of the most recent
// canvases, and a "Recent documents" list of the rest. All fed from real canvases.
export function HomePage({ user, uid, owned, shared, ownedSet, searchQuery, setSearchQuery, mobile, onCreate }: PageProps) {
  const navigate = useNavigate()

  const all = [...owned, ...shared].sort(byRecent)
  if (all.length === 0) return <EmptyState onCreate={onCreate} />

  const filtered = filterByTitle(all, searchQuery)
  const cont = filtered.slice(0, 4)
  const recent = filtered.slice(4)

  const focus = all[0]
  const focusOwner = ownedSet.has(focus.id)
  const focusDate = new Date(focus.updatedAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  const firstName = (user.displayName ?? user.email ?? 'there').split(/[\s@]/)[0]

  return (
    <div className="m-col" style={{ gap: 22 }}>
      {/* Hero */}
      <div
        className="m-card"
        style={{
          padding: mobile ? 20 : 26, display: 'flex', flexDirection: mobile ? 'column' : 'row',
          justifyContent: 'space-between', gap: 18, alignItems: mobile ? 'stretch' : 'flex-start',
        }}
      >
        <div className="m-col" style={{ gap: 10 }}>
          <div className="m-h2">Good morning, {firstName}</div>
          <div className="m-lead" style={{ maxWidth: '52ch' }}>
            Pick up where you left off — your canvases, planner and shared boards all live in one cozy place.
          </div>
        </div>
        <div
          className="m-col"
          style={{
            flex: '0 0 auto', minWidth: mobile ? 'auto' : 220, gap: 8, padding: 16,
            borderRadius: 18, background: 'var(--m-bg-2)',
          }}
        >
          <span className="m-eyebrow">Current focus</span>
          <div className="m-bold" style={{ fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {focus.title}
          </div>
          <div className="m-tiny m-faint">{focusOwner ? 'private' : 'shared'} · updated {focusDate}</div>
          <button
            className="m-btn m-btn-primary m-btn-sm"
            style={{ marginTop: 6, alignSelf: 'flex-start' }}
            onClick={() => navigate(`/canvas/${focus.id}`)}
          >
            <Icon name="pen" size={15} color="#fff" /><span>Open</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <NoResultsState query={searchQuery} onClear={() => setSearchQuery('')} />
      ) : (
        <>
          {/* Continue working */}
          <div className="m-col" style={{ gap: 14 }}>
            <SectionHead title="Continue working" hint="recently opened" />
            <div style={docCols(mobile, 220)}>
              {cont.map((c) => (
                <CanvasCard key={c.id} canvas={c} isOwner={ownedSet.has(c.id)} uid={uid} />
              ))}
            </div>
          </div>

          {/* Recent documents */}
          {recent.length > 0 && (
            <div className="m-col" style={{ gap: 14 }}>
              <SectionHead title="Recent documents" hint="latest edits" />
              <div className="m-col" style={{ gap: 12 }}>
                {recent.map((c) => (
                  <CanvasListRow key={c.id} canvas={c} isOwner={ownedSet.has(c.id)} uid={uid} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
