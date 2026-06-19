import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../auth/useAuth';
import { useCanvasList } from './useCanvasList';
import { usePendingInvites } from '../sharing/usePendingInvites';
import { CanvasCard } from './CanvasCard';
import { Icon, MCOLORS } from '../../lib/icons';
import { ConfirmModal } from '../../lib/ConfirmModal';
import { CreatingOverlay } from './CreatingOverlay';
import { EmptyState, NoResultsState } from './DashboardEmptyStates';
import { useIsMobile } from './useIsMobile';
import { useCreateCanvas } from './useCreateCanvas';
import type { CanvasDoc } from '../../lib/types';

type ModalConfig = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  showCancel?: boolean;
};

type NavKey = 'all' | 'shared';

const HEADINGS: Record<NavKey, [string, string]> = {
  all: ['All canvases', 'Everything you and your team are working on'],
  shared: ['Shared with me', 'Canvases your collaborators invited you to'],
};

export function Dashboard() {
  const { user } = useAuth();
  const uid = user!.uid;
  const { owned, shared, loading } = useCanvasList(uid);
  const { creating, creatingId, createCanvas } = useCreateCanvas(uid);
  const [activeNav, setActiveNav] = useState<NavKey>('all');
  const [searchQueries, setSearchQueries] = useState<Record<NavKey, string>>({
    all: '',
    shared: '',
  });
  const searchQuery = searchQueries[activeNav];
  const setSearchQuery = (v: string) =>
    setSearchQueries((prev) => ({ ...prev, [activeNav]: v }));
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const isMobile = useIsMobile();

  usePendingInvites(user!);

  const totalOwned = owned.length;

  // Sync canvasCount if it drifted from the real owned count (e.g. console deletes)
  useEffect(() => {
    if (loading) return
    const userRef = doc(db, 'users', uid)
    getDoc(userRef).then((snap) => {
      const stored = snap.data()?.canvasCount ?? 0
      if (stored !== totalOwned) {
        setDoc(userRef, { canvasCount: totalOwned }, { merge: true }).catch(() => {})
      }
    }).catch(() => {})
  }, [loading, totalOwned, uid])

  const handleSignOut = () => {
    setModal({
      title: 'Sign out?',
      message: 'You will be signed out of your account.',
      confirmLabel: 'Sign out',
      showCancel: true,
      onConfirm: () => {
        setModal(null);
        signOut(auth);
      },
    });
  };

  const handleCreate = () => {
    if (totalOwned >= 10) {
      setModal({
        title: 'Canvas limit reached',
        message:
          'You have reached the maximum of 10 canvases. Delete one to create a new one.',
        confirmLabel: 'Got it',
        onConfirm: () => setModal(null),
      });
      return;
    }
    createCanvas();
  };

  // Determine which canvases to show based on nav + search
  const allCanvases: CanvasDoc[] = (
    activeNav === 'shared' ? shared : [...owned, ...shared]
  ).filter((c) => c.id !== creatingId);

  const q = searchQuery.toLowerCase().trim();
  const filteredCanvases = q
    ? allCanvases.filter((c) => c.title.toLowerCase().includes(q))
    : allCanvases;

  const ownedSet = new Set(owned.map((c) => c.id));

  const userInitial = (user!.displayName ?? user!.email ?? '?')
    .charAt(0)
    .toUpperCase();
  const userColor = MCOLORS[2];

  if (isMobile) {
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
            title={user!.displayName ?? ''}
            style={{ background: userColor, cursor: 'pointer' }}
            onClick={handleSignOut}
          >
            {user!.photoURL ? (
              <img
                src={user!.photoURL}
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
            <EmptyState onCreate={handleCreate} />
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
          onClick={handleCreate}
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

        {modal && (
          <ConfirmModal
            title={modal.title}
            message={modal.message}
            confirmLabel={modal.confirmLabel}
            danger={modal.danger}
            onConfirm={modal.onConfirm}
            onCancel={modal.showCancel ? () => setModal(null) : undefined}
          />
        )}
      </div>
    );
  }

  // Desktop layout
  const [head, sub] = HEADINGS[activeNav];

  return (
    <div
      style={{
        display: 'flex',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--m-bg)',
      }}
    >
      {creating && <CreatingOverlay />}
      {/* Sidebar */}
      <div className='m-sidebar'>
        {/* Logo */}
        <div className='m-row m-g10' style={{ padding: '4px 8px 14px' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: 'var(--m-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name='pen' size={18} color='#fff' />
          </div>
          <span
            style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 18 }}
          >
            Doodle
          </span>
        </div>

        {/* Nav items */}
        {(['all', 'shared'] as NavKey[]).map((k) => (
          <div
            key={k}
            className={'m-nav ' + (activeNav === k ? 'm-nav-on' : '')}
            onClick={() => setActiveNav(k)}
          >
            <Icon name={k === 'all' ? 'grid' : 'users'} size={20} />
            <span>{HEADINGS[k][0]}</span>
            {k === 'all' && owned.length > 0 && (
              <span className='m-nav-count'>{owned.length}</span>
            )}
            {k === 'shared' && shared.length > 0 && (
              <span className='m-nav-count'>{shared.length}</span>
            )}
          </div>
        ))}

        <div style={{ flex: 1 }} />

        {/* Storage meter */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            padding: '10px 12px',
            background: 'var(--m-bg-2)',
            borderRadius: 14,
            marginBottom: 10,
          }}
        >
          <div className='m-row m-between'>
            <span className='m-tiny m-muted m-bold'>Spaces</span>
            <span className='m-tiny m-faint'>{totalOwned} / 10</span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 6,
              background: 'var(--m-line-2)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${totalOwned * 10}%`,
                height: '100%',
                background: 'var(--m-primary)',
                borderRadius: 6,
                transition: 'width .3s ease',
              }}
            />
          </div>
        </div>

        {/* User */}
        <div className='m-row m-g10' style={{ padding: '4px 6px' }}>
          <div
            className='m-ava'
            title={user!.displayName ?? ''}
            style={{ background: userColor, cursor: 'default', flexShrink: 0 }}
          >
            {user!.photoURL ? (
              <img
                src={user!.photoURL}
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              minWidth: 0,
              flex: 1,
            }}
          >
            <span
              className='m-bold'
              style={{
                fontSize: 13.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user!.displayName || user!.email || 'You'}
            </span>
            <span className='m-tiny m-faint'>Free plan</span>
          </div>
          <button
            className='m-tool'
            style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0 }}
            title='Sign out'
            onClick={handleSignOut}
          >
            <Icon name='dots' size={18} color='var(--m-ink-3)' />
          </button>
        </div>
      </div>

      {/* Main area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Top bar */}
        <div
          className='m-row m-between'
          style={{
            padding: '15px 26px',
            borderBottom: '1px solid var(--m-line)',
            flexShrink: 0,
            background: 'var(--m-surface)',
          }}
        >
          <div className='m-input' style={{ width: 320, padding: '9px 14px' }}>
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
          <button
            className='m-btn m-btn-primary'
            onClick={handleCreate}
            disabled={creating || totalOwned >= 10}
          >
            <Icon name='plus' size={18} color='#fff' /> New canvas
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className='spinner' />
        ) : filteredCanvases.length === 0 && !creating ? (
          q ? (
            <NoResultsState query={q} onClear={() => setSearchQuery('')} />
          ) : (
            <EmptyState onCreate={handleCreate} />
          )
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '24px 26px',
              gap: 20,
              flex: 1,
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className='m-h2'>{head}</div>
              <div className='m-tiny m-muted'>{sub}</div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 18,
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
      </div>

      {modal && (
        <ConfirmModal
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          danger={modal.danger}
          onConfirm={modal.onConfirm}
          onCancel={modal.showCancel ? () => setModal(null) : undefined}
        />
      )}
    </div>
  );
}
