import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../auth/useAuth';
import { useCanvasList } from './useCanvasList';
import { usePendingInvites } from '../sharing/usePendingInvites';
import { MCOLORS } from '../../lib/icons';
import { ConfirmModal } from '../../lib/ConfirmModal';
import { useIsMobile } from './useIsMobile';
import { useCreateCanvas } from './useCreateCanvas';
import { DashboardMobile } from './DashboardMobile';
import { DashboardDesktop } from './DashboardDesktop';
import type { DashboardViewProps, NavKey } from './DashboardView';

type ModalConfig = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  showCancel?: boolean;
};

export function Dashboard() {
  const { user } = useAuth();
  const uid = user!.uid;
  const { owned, shared, loading } = useCanvasList(uid);
  const { creating, creatingId, createCanvas } = useCreateCanvas(uid);
  // Remember the active tab across navigation (e.g. opening a canvas and coming back) so the user
  // returns to the tab they left from rather than always landing on Home. Scoped to the tab session.
  const [activeNav, setActiveNav] = useState<NavKey>(() => {
    const saved = sessionStorage.getItem('dashboardNav') as NavKey | null;
    return saved && ['home', 'documents', 'planner', 'shared'].includes(saved) ? saved : 'home';
  });
  useEffect(() => {
    sessionStorage.setItem('dashboardNav', activeNav);
  }, [activeNav]);
  const [searchQuery, setSearchQuery] = useState('');
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

  // Exclude the canvas currently being created (it gets an optimistic placeholder via the
  // CreatingOverlay) from the lists the pages render.
  const visibleOwned = owned.filter((c) => c.id !== creatingId);
  const visibleShared = shared.filter((c) => c.id !== creatingId);
  const ownedSet = new Set(owned.map((c) => c.id));

  const userInitial = (user!.displayName ?? user!.email ?? '?')
    .charAt(0)
    .toUpperCase();
  const userColor = MCOLORS[2];

  const viewProps: DashboardViewProps = {
    user: user!,
    uid,
    userInitial,
    userColor,
    owned: visibleOwned,
    shared: visibleShared,
    ownedSet,
    loading,
    creating,
    searchQuery,
    setSearchQuery,
    totalOwned,
    activeNav,
    setActiveNav,
    onSignOut: handleSignOut,
    onCreate: handleCreate,
  };

  return (
    <>
      {isMobile ? (
        <DashboardMobile {...viewProps} />
      ) : (
        <DashboardDesktop {...viewProps} />
      )}
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
    </>
  );
}
