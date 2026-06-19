import { Icon } from '../../lib/icons'
import { CanvasCard } from './CanvasCard'
import { CreatingOverlay } from './CreatingOverlay'
import { EmptyState, NoResultsState } from './DashboardEmptyStates'
import type { DashboardViewProps, NavKey } from './DashboardView'

// The narrow-viewport Dashboard: stacked header, search, filter chips, a two-column
// card grid, and a floating create button.
export function DashboardMobile({
  user,
  uid,
  userInitial,
  userColor,
  loading,
  creating,
  filteredCanvases,
  ownedSet,
  q,
  activeNav,
  setActiveNav,
  searchQuery,
  setSearchQuery,
  totalOwned,
  onSignOut,
  onCreate,
}: DashboardViewProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--m-bg)',
        position: 'relative',
      }}
    >
      {creating && <CreatingOverlay />}
      {/* Mobile header */}
      <div className='m-row m-between' style={{ padding: '18px 18px 12px' }}>
        <div className='m-row m-g10'>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'var(--m-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name='pen' size={18} color='#fff' />
          </div>
          <div className='m-h3'>Your canvases</div>
        </div>
        <div
          className='m-ava'
          title={user.displayName ?? ''}
          style={{ background: userColor, cursor: 'pointer' }}
          onClick={onSignOut}
        >
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt=''
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          ) : (
            userInitial
          )}
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 18px 12px' }}>
        <div className='m-input' style={{ padding: '11px 14px' }}>
          <Icon name='search' size={17} color='var(--m-ink-3)' />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Search canvases…'
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--ui)',
              fontSize: 15,
              color: 'var(--m-ink)',
              background: 'transparent',
            }}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div
        className='m-row m-g8'
        style={{ padding: '0 18px 14px', overflowX: 'auto', flexShrink: 0 }}
      >
        {(['all', 'shared'] as NavKey[]).map((k) => (
          <button
            key={k}
            className={'m-chip ' + (activeNav === k ? 'm-chip-on' : '')}
            style={{ fontSize: 13 }}
            onClick={() => setActiveNav(k)}
          >
            {k === 'all' ? 'All' : 'Shared'}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className='spinner' />
      ) : filteredCanvases.length === 0 && !creating ? (
        q ? (
          <NoResultsState query={q} onClear={() => setSearchQuery('')} />
        ) : (
          <EmptyState onCreate={onCreate} />
        )
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 96px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
            }}
          >
            {filteredCanvases.map((c) => (
              <CanvasCard
                key={c.id}
                canvas={c}
                isOwner={ownedSet.has(c.id)}
                uid={uid}
              />
            ))}
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        className='m-btn m-btn-primary'
        onClick={onCreate}
        disabled={creating || totalOwned >= 10}
        style={{
          position: 'absolute',
          right: 18,
          bottom: 22,
          width: 56,
          height: 56,
          borderRadius: 18,
          padding: 0,
          boxShadow:
            '0 12px 26px color-mix(in oklab,var(--m-primary) 45%,transparent)',
          zIndex: 20,
        }}
      >
        <Icon name='plus' size={26} color='#fff' />
      </button>
    </div>
  )
}
