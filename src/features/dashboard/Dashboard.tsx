import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import { auth, db, rtdb } from '../../lib/firebase';
import { useAuth } from '../auth/useAuth';
import { useCanvasList } from './useCanvasList';
import { usePendingInvites } from '../sharing/usePendingInvites';
import { CanvasCard } from './CanvasCard';
import { Icon, MCOLORS } from '../../lib/icons';
import { ConfirmModal } from '../../lib/ConfirmModal';
import type { CanvasDoc } from '../../lib/types';

function CreatingOverlay() {
  return (
    <div className='m-creating-overlay'>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div className='m-creating-ring' />
        <div className='m-creating-orb'>
          <Icon name='pen' size={30} color='#fff' />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <div className='m-bold' style={{ fontSize: 17, color: 'var(--m-ink)' }}>
          Creating canvas…
        </div>
        <div className='m-tiny m-faint'>Just a moment</div>
      </div>
    </div>
  );
}

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

function useIsMobile(bp = 760) {
  const [m, setM] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < bp : false,
  );
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [bp]);
  return m;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        textAlign: 'center',
        gap: 20,
        padding: '36px 20px',
      }}
    >
      <div style={{ position: 'relative', width: 168, height: 132 }}>
        <div
          className='m-blob'
          style={{
            left: 4,
            top: 6,
            width: 38,
            height: 38,
            background: MCOLORS[2],
            opacity: 0.55,
            ['--rot' as string]: '-8deg',
          }}
        />
        <div
          className='m-blob'
          style={{
            right: 0,
            top: 26,
            width: 26,
            height: 26,
            background: MCOLORS[1],
            opacity: 0.55,
            ['--rot' as string]: '12deg',
          }}
        />
        <div
          className='m-blob'
          style={{
            left: 30,
            bottom: 0,
            width: 22,
            height: 22,
            background: MCOLORS[3],
            opacity: 0.5,
            ['--rot' as string]: '6deg',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '16px 30px',
            borderRadius: 22,
            border: '2.5px dashed var(--m-line-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,.6)',
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 16,
              background: 'var(--m-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow:
                '0 10px 22px color-mix(in oklab,var(--m-primary) 40%,transparent)',
            }}
          >
            <Icon name='plus' size={28} color='#fff' />
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          maxWidth: 380,
        }}
      >
        <div className='m-h2' style={{ fontSize: 25 }}>
          Nothing here yet
        </div>
        <div className='m-lead' style={{ fontSize: 15 }}>
          Your canvases will show up here. Start a fresh one and invite your
          team to think out loud together.
        </div>
      </div>
      <button className='m-btn m-btn-primary m-btn-lg' onClick={onCreate}>
        <Icon name='plus' size={18} color='#fff' /> New canvas
      </button>
    </div>
  );
}

function NoResultsState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        textAlign: 'center',
        gap: 20,
        padding: '36px 20px',
      }}
    >
      <div style={{ position: 'relative', width: 168, height: 132 }}>
        <span
          style={{
            position: 'absolute',
            left: 4,
            top: 6,
            fontSize: 64,
            fontFamily: 'var(--disp)',
            fontWeight: 700,
            color: MCOLORS[6],
            opacity: 0.55,
            transform: 'rotate(-18deg)',
            lineHeight: 1,
          }}
        >
          ?
        </span>
        <span
          style={{
            position: 'absolute',
            right: 0,
            top: 26,
            fontSize: 44,
            fontFamily: 'var(--disp)',
            fontWeight: 700,
            color: MCOLORS[4],
            opacity: 0.55,
            transform: 'rotate(14deg)',
            lineHeight: 1,
          }}
        >
          ?
        </span>
        <span
          style={{
            position: 'absolute',
            left: 30,
            bottom: 0,
            fontSize: 36,
            fontFamily: 'var(--disp)',
            fontWeight: 700,
            color: MCOLORS[0],
            opacity: 0.5,
            transform: 'rotate(-6deg)',
            lineHeight: 1,
          }}
        >
          ?
        </span>
        <div
          style={{
            position: 'absolute',
            inset: '16px 30px',
            borderRadius: 22,
            border: '2.5px dashed var(--m-line-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,.6)',
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 16,
              background: 'var(--m-ink-3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 22px rgba(0,0,0,.12)',
            }}
          >
            <Icon name='search' size={26} color='#fff' />
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          maxWidth: 380,
        }}
      >
        <div className='m-h2' style={{ fontSize: 25 }}>
          No results for "{query}"
        </div>
        <div className='m-lead' style={{ fontSize: 15 }}>
          Try a different name, or clear the search to see all your canvases.
        </div>
      </div>
      <button
        onClick={onClear}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--m-primary)',
          fontFamily: 'var(--ui)',
          fontSize: 15,
          fontWeight: 600,
          padding: 0,
        }}
      >
        Clear search
      </button>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user!.uid;
  const { owned, shared, loading } = useCanvasList(uid);
  const [creating, setCreating] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
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

  const handleCreate = async () => {
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
    setCreating(true);
    try {
      const canvasRef = doc(collection(db, 'canvases'));
      setCreatingId(canvasRef.id);
      const batch = writeBatch(db);
      batch.set(canvasRef, {
        title: 'Untitled Canvas',
        ownerId: uid,
        members: [],
        pendingInvites: [],
        width: 1920,
        height: 1080,
        createdAt: serverTimestamp(),
        updatedAt: Date.now(),
      });
      batch.update(doc(db, 'users', uid), { canvasCount: increment(1) });

      await Promise.all([
        batch
          .commit()
          .then(() =>
            Promise.all([
              set(ref(rtdb, `canvases/${canvasRef.id}/access/ownerId`), uid),
              set(
                ref(rtdb, `canvases/${canvasRef.id}/access/members/${uid}`),
                true,
              ),
            ]),
          ),
        new Promise((resolve) => setTimeout(resolve, 900)),
      ]);

      navigate(`/canvas/${canvasRef.id}`);
    } finally {
      setCreating(false);
      setCreatingId(null);
    }
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
