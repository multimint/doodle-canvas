import { CanvasCard } from '../CanvasCard'
import { NoResultsState } from '../DashboardEmptyStates'
import { docCols, filterByTitle, byRecent } from './shared'
import { useDashboard } from '../DashboardContext'

// Shared: canvases other people invited you to. Always rendered as non-owner cards.
export function SharedPage() {
  const { uid, shared, searchQuery, setSearchQuery, mobile } = useDashboard()
  const docs = filterByTitle(shared, searchQuery).sort(byRecent)

  return (
    <div className="m-col" style={{ gap: 18 }}>
      <div className="m-col" style={{ gap: 4 }}>
        <div className="m-h2">Shared with me</div>
        <span className="m-tiny m-faint">Canvases your collaborators invited you to.</span>
      </div>

      {docs.length === 0 ? (
        searchQuery.trim()
          ? <NoResultsState query={searchQuery} onClear={() => setSearchQuery('')} />
          : <div className="m-card m-card-sm" style={{ padding: 30, textAlign: 'center', color: 'var(--m-ink-3)' }}>Nothing shared with you yet.</div>
      ) : (
        <div style={docCols(mobile, 220)}>
          {docs.map((c) => (
            <CanvasCard key={c.id} canvas={c} isOwner={false} uid={uid} />
          ))}
        </div>
      )}
    </div>
  )
}
