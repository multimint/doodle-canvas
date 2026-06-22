import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

// Repository for user profile documents at `users/{uid}`. The only module that reads/writes them.

export interface UserProfile {
  displayName: string
  email: string
  photoURL: string
}

// A member's display profile, with uid fallbacks for missing fields / missing docs.
export async function getUserProfile(uid: string): Promise<UserProfile> {
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (snap.exists()) {
      const d = snap.data()
      return {
        displayName: d.displayName ?? uid,
        email: d.email ?? '',
        photoURL: d.photoURL ?? '',
      }
    }
  } catch {
    // fall through to default
  }
  return { displayName: uid, email: '', photoURL: '' }
}

// The uid of the user with this email, or null when none exists.
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)))
  return snap.empty ? null : snap.docs[0].id
}

// Create the user's profile doc on first sign-in, or refresh its mutable fields on later sign-ins.
export async function ensureUserDoc(profile: {
  uid: string
  email: string
  displayName: string
  photoURL: string
}): Promise<void> {
  const ref = doc(db, 'users', profile.uid)
  const snap = await getDoc(ref)
  const fields = {
    email: profile.email,
    displayName: profile.displayName,
    photoURL: profile.photoURL,
  }
  if (!snap.exists()) {
    await setDoc(ref, { ...fields, canvasCount: 0, createdAt: serverTimestamp() })
  } else {
    await setDoc(ref, fields, { merge: true })
  }
}

// Reconcile a possibly-drifted canvasCount (e.g. after console deletes) with the real owned count.
export async function reconcileCanvasCount(uid: string, actualCount: number): Promise<void> {
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  const stored = snap.data()?.canvasCount ?? 0
  if (stored !== actualCount) {
    await setDoc(ref, { canvasCount: actualCount }, { merge: true })
  }
}
