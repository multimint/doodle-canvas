import { Icon } from '../../lib/icons'
import { CreatingOverlay } from './CreatingOverlay'
import { HomePage } from './pages/HomePage'
import { DocumentsPage } from './pages/DocumentsPage'
import { SharedPage } from './pages/SharedPage'
import { PlannerPage } from './pages/PlannerPage'
import type { PageProps } from './pages/shared'
import type { DashboardViewProps, NavKey } from './DashboardView'

const TABS: [NavKey, string, string][] = [
  ['home', 'home', 'Home'],
  ['documents', 'folder', 'Docs'],
  ['planner', 'calendar', 'Planner'],
  ['shared', 'users', 'Shared'],
]

// The narrow-viewport Dashboard: stacked header, search (hidden on Planner), the active page,
// a bottom tab bar, and a floating create button.
export function DashboardMobile(props: DashboardViewProps) {
  const {
    user, uid, userInitial, userColor, owned, shared, ownedSet, loading, creating,
    searchQuery, setSearchQuery, totalOwned, activeNav, setActiveNav, onSignOut, onCreate,
  } = props

  const pageProps: PageProps = {
    user, uid, owned, shared, ownedSet, searchQuery, setSearchQuery, mobile: true, onCreate,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--m-bg)', position: 'relative' }}>
      {creating && <CreatingOverlay />}

      {/* Header */}
      <div className='m-row m-between' style={{ padding: '18px 18px 12px' }}>
        <div className='m-row m-g10'>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--m-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name='pen' size={18} color='#fff' />
          </div>
          <div className='m-h3'>Doodle</div>
        </div>
        <div
          className='m-ava'
          title={user.displayName ?? ''}
          style={{ background: userColor, cursor: 'pointer' }}
          onClick={onSignOut}
        >
          {user.photoURL ? (
            <img src={user.photoURL} alt='' style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            userInitial
          )}
        </div>
      </div>

      {/* Search — hidden on Planner */}
      {activeNav !== 'planner' && (
        <div style={{ padding: '0 18px 12px' }}>
          <div className='m-input' style={{ padding: '11px 14px' }}>
            <Icon name='search' size={17} color='var(--m-ink-3)' />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Search canvases…'
              style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'var(--ui)', fontSize: 15, color: 'var(--m-ink)', background: 'transparent' }}
            />
          </div>
        </div>
      )}

      {/* Active page */}
      {loading ? (
        <div className='spinner' />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 96px', display: 'flex', flexDirection: 'column' }}>
          {activeNav === 'home' && <HomePage {...pageProps} />}
          {activeNav === 'documents' && <DocumentsPage {...pageProps} />}
          {activeNav === 'shared' && <SharedPage {...pageProps} />}
          {activeNav === 'planner' && <PlannerPage mobile={true} uid={pageProps.uid} />}
        </div>
      )}

      {/* Bottom tab bar */}
      <div
        className='m-row'
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'space-around',
          padding: '8px 10px calc(10px + env(safe-area-inset-bottom))', background: 'var(--m-surface)',
          borderTop: '1px solid var(--m-line)', zIndex: 30,
        }}
      >
        {TABS.map(([key, icon, label]) => (
          <div
            key={key}
            className='m-col m-center'
            onClick={() => setActiveNav(key)}
            style={{ gap: 3, padding: '4px 14px', cursor: 'pointer', color: activeNav === key ? 'var(--m-primary)' : 'var(--m-ink-3)' }}
          >
            <Icon name={icon} size={22} />
            <span className='m-tiny' style={{ fontSize: 10.5, fontWeight: 600 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* FAB — hidden on Planner */}
      {activeNav !== 'planner' && (
        <button
          className='m-btn m-btn-primary'
          onClick={onCreate}
          disabled={creating || totalOwned >= 10}
          style={{
            position: 'absolute', right: 18, bottom: 'calc(78px + env(safe-area-inset-bottom))',
            width: 54, height: 54, borderRadius: 18, padding: 0,
            boxShadow: '0 12px 26px color-mix(in oklab,var(--m-primary) 45%,transparent)', zIndex: 31,
          }}
        >
          <Icon name='plus' size={26} color='#fff' />
        </button>
      )}
    </div>
  )
}
