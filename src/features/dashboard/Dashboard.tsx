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
import type { CanvasDoc } from '../../lib/types';

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

  const viewProps: DashboardViewProps = {
    user: user!,
    uid,
    userInitial,
    userColor,
    owned,
    shared,
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
