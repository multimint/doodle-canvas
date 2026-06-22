import { useState } from 'react'
import { CanvasCard } from '../CanvasCard'
import { EmptyState, NoResultsState } from '../DashboardEmptyStates'
import { docCols, filterByTitle, byRecent, NewTile } from './shared'
import { useDashboard } from '../DashboardContext'

type DocFilter = 'all' | 'mine' | 'shared'
const FILTERS: [DocFilter, string][] = [['all', 'All'], ['mine', 'Mine'], ['shared', 'Shared']]

// Documents: every canvas, narrowed by an All/Mine/Shared chip and the global search, with a
// "New canvas" tile leading the grid.
export function DocumentsPage() {
  const { uid, owned, shared, ownedSet, searchQuery, setSearchQuery, mobile, onCreate } = useDashboard()
  const [filter, setFilter] = useState<DocFilter>('all')

  const hasAny = owned.length + shared.length > 0
  if (!hasAny) return <EmptyState onCreate={onCreate} />

  const base = filter === 'mine' ? owned : filter === 'shared' ? shared : [...owned, ...shared]
  const docs = filterByTitle(base, searchQuery).sort(byRecent)

  return (
    <div className="m-col" style={{ gap: 18 }}>
      <div className="m-col" style={{ gap: 4 }}>
        <div className="m-h2">Documents</div>
        <span className="m-tiny m-faint">Browse every canvas by sharing or ownership.</span>
      </div>

      <div className="m-row m-wrap m-g8">
        {FILTERS.map(([id, label]) => (
          <div key={id} className={'m-chip ' + (filter === id ? 'm-chip-on' : '')} onClick={() => setFilter(id)}>
            {label}
          </div>
        ))}
      </div>

      {docs.length === 0 ? (
        searchQuery.trim()
          ? <NoResultsState query={searchQuery} onClear={() => setSearchQuery('')} />
          : <div className="m-card m-card-sm" style={{ padding: 30, textAlign: 'center', color: 'var(--m-ink-3)' }}>No documents match this filter.</div>
      ) : (
        <div style={docCols(mobile, 220)}>
          {filter !== 'shared' && <NewTile onNew={onCreate} h={mobile ? 160 : '100%'} />}
          {docs.map((c) => (
            <CanvasCard key={c.id} canvas={c} isOwner={ownedSet.has(c.id)} uid={uid} />
          ))}
        </div>
      )}
      <span className="m-tiny m-faint">{docs.length} document{docs.length === 1 ? '' : 's'} shown.</span>
    </div>
  )
}
