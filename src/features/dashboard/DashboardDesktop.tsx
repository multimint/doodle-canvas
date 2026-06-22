import { Icon } from '../../lib/icons'
import { CreatingOverlay } from './CreatingOverlay'
import { HomePage } from './pages/HomePage'
import { DocumentsPage } from './pages/DocumentsPage'
import { SharedPage } from './pages/SharedPage'
import { PlannerPage } from './pages/PlannerPage'
import { useDashboard } from './DashboardContext'
import type { NavKey } from './DashboardView'

const NAV_ITEMS: [NavKey, string, string][] = [
  ['home', 'home', 'Home'],
  ['documents', 'folder', 'Documents'],
  ['planner', 'calendar', 'Planner'],
  ['shared', 'users', 'Shared'],
]

// The wide-viewport Dashboard: a sidebar (4-page nav + storage meter + user) beside the main
// area (a top bar with search/create, hidden on the Planner page, and the active page).
export function DashboardDesktop() {
  const {
    user, userInitial, userColor, owned, shared, loading, creating,
    searchQuery, setSearchQuery, totalOwned, activeNav, setActiveNav, onSignOut, onCreate,
  } = useDashboard()

  const counts: Partial<Record<NavKey, number>> = {
    documents: owned.length + shared.length,
    shared: shared.length,
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--m-bg)' }}>
      {creating && <CreatingOverlay />}

      {/* Sidebar */}
      <div className='m-sidebar'>
        {/* Logo */}
        <div className='m-row m-g10' style={{ padding: '4px 8px 14px' }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--m-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name='pen' size={18} color='#fff' />
          </div>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 18 }}>Doodle</span>
        </div>

        {/* Nav items */}
        {NAV_ITEMS.map(([key, icon, label]) => (
          <div key={key} className={'m-nav ' + (activeNav === key ? 'm-nav-on' : '')} onClick={() => setActiveNav(key)}>
            <Icon name={icon} size={20} />
            <span>{label}</span>
            {counts[key] != null && counts[key]! > 0 && <span className='m-nav-count'>{counts[key]}</span>}
          </div>
        ))}

        <div style={{ flex: 1 }} />

        {/* Storage meter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 12px', background: 'var(--m-bg-2)', borderRadius: 14, marginBottom: 10 }}>
          <div className='m-row m-between'>
            <span className='m-tiny m-muted m-bold'>Spaces</span>
            <span className='m-tiny m-faint'>{totalOwned} / 10</span>
          </div>
          <div style={{ height: 6, borderRadius: 6, background: 'var(--m-line-2)', overflow: 'hidden' }}>
            <div style={{ width: `${totalOwned * 10}%`, height: '100%', background: 'var(--m-primary)', borderRadius: 6, transition: 'width .3s ease' }} />
          </div>
        </div>

        {/* User */}
        <div className='m-row m-g10' style={{ padding: '4px 6px' }}>
          <div className='m-ava' title={user.displayName ?? ''} style={{ background: userColor, cursor: 'default', flexShrink: 0 }}>
            {user.photoURL ? (
              <img src={user.photoURL} alt='' style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              userInitial
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
            <span className='m-bold' style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.displayName || user.email || 'You'}
            </span>
            <span className='m-tiny m-faint'>Free plan</span>
          </div>
          <button className='m-tool' style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0 }} title='Sign out' onClick={onSignOut}>
            <Icon name='dots' size={18} color='var(--m-ink-3)' />
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
        {/* Top bar — hidden on the Planner page */}
        {activeNav !== 'planner' && (
          <div
            className='m-row m-between'
            style={{ padding: '15px 26px', borderBottom: '1px solid var(--m-line)', flexShrink: 0, background: 'var(--m-surface)' }}
          >
            <div className='m-input' style={{ width: 320, padding: '9px 14px' }}>
              <Icon name='search' size={17} color='var(--m-ink-3)' />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search canvases…'
                style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'var(--ui)', fontSize: 15, color: 'var(--m-ink)', background: 'transparent' }}
              />
            </div>
            <button className='m-btn m-btn-primary' onClick={onCreate} disabled={creating || totalOwned >= 10}>
              <Icon name='plus' size={18} color='#fff' /> New canvas
            </button>
          </div>
        )}

        {/* Active page */}
        {loading ? (
          <div className='spinner' />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', padding: '24px 26px', flex: 1, overflowY: 'auto' }}>
            {activeNav === 'home' && <HomePage />}
            {activeNav === 'documents' && <DocumentsPage />}
            {activeNav === 'shared' && <SharedPage />}
            {activeNav === 'planner' && <PlannerPage />}
          </div>
        )}
      </div>
    </div>
  )
}
