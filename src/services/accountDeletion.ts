import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

import { getFirestoreDb, isFirebaseConfigured } from './firebase';

async function wipeSnapshotCollection(uid: string, collectionName: 'sync' | 'stats') {
  const db = getFirestoreDb();
  const snap = await getDocs(collection(db, 'users', uid, collectionName));
  if (snap.empty) return;

  const now = new Date().toISOString();
  const docs = snap.docs;

  // Batch writes (max 500 ops).
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 450)) {
      batch.set(
        d.ref,
        { raw: '{}', updatedAt: now, schemaVersion: 1 },
        { merge: false }
      );
    }
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

async function deleteAllDocsInSubcollection(uid: string, name: string) {
  const db = getFirestoreDb();
  const snap = await getDocs(collection(db, 'users', uid, name));
  if (snap.empty) return;

  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 450)) batch.delete(d.ref);
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

/**
 * Wipe all SeedMind cloud data for a user.
 *
 * NOTE: Some subcollections are protected by snapshot-schema rules that may not allow delete.
 * For those buckets we overwrite the snapshot with empty `{}` (still satisfying schema).
 */
export async function wipeSeedMindCloudData(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) return;

  // 1) Wipe snapshot buckets (schema-restricted).
  await Promise.all([wipeSnapshotCollection(uid, 'sync'), wipeSnapshotCollection(uid, 'stats')]);

  // 2) Remove legacy test buckets (safe to delete).
  await Promise.all([
    deleteAllDocsInSubcollection(uid, 'conversations').catch(() => {}),
    deleteAllDocsInSubcollection(uid, 'gardenSeeds').catch(() => {}),
  ]);

  // 3) Delete the top-level user doc (best-effort).
  try {
    await deleteDoc(doc(getFirestoreDb(), 'users', uid));
  } catch {
    // ignore
  }
}

/**
 * Removes all AsyncStorage keys that belong to SeedMind.
 * This gives a true "fresh install" state after account deletion.
 */
export async function wipeSeedMindLocalData(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    // Keep device-scoped anti-abuse state even across account switching / deletion.
    // This prevents creating multiple accounts on the same device to reset free limits.
    const DEVICE_SCOPED_KEYS_TO_KEEP = new Set<string>([
      'seedmind_free_limits_v1',
      'seedmind_rc_device_id_v1',
      'seedmind_installation_id_v1',
      // Onboarding -> Auth marker; must survive account-switch wipes briefly to avoid double-onboarding.
      'seedmind_post_onboarding_auth_ts_v1',
    ]);

    const seedmindKeys = keys
      .filter((k) => k.startsWith('seedmind_'))
      .filter((k) => !DEVICE_SCOPED_KEYS_TO_KEEP.has(k));
    if (seedmindKeys.length) {
      await AsyncStorage.multiRemove(seedmindKeys);
    }
  } catch {
    // ignore
  }
}

