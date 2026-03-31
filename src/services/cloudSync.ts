import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type { User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, setDoc } from 'firebase/firestore';

import { getFirebaseAuth, getFirestoreDb, isFirebaseConfigured } from './firebase';

// AsyncStorage keys (must match existing local storage modules)
const CHAT_KEYS = {
  CONVERSATIONS: 'seedmind_conversations',
  ACTIVE_CHAT_ID: 'seedmind_active_chat_id',
};

const MEDITATION_KEYS = {
  MEDITATION_HISTORY: 'seedmind_meditation_history',
  SEEDS_GARDEN: 'seedmind_seeds_garden',
  MEDITATION_STREAK: 'seedmind_meditation_streak',
  SOUND_SETTINGS: 'seedmind_sound_settings',
  HARVEST_STORIES: 'seedmind_harvest_stories',
  VOICE_PREFERENCE: 'seedmind_voice_preference',
  FIRST_SEEDLING_NOTIFIED: 'seedmind_first_seedling_notified',
  BLOOM_NOTIFIED_SEEDS: 'seedmind_bloom_notified_seeds',
  CONVERSATION_STYLE: 'seedmind_conversation_style',
  COMPLETED_CONVERSATIONS_COUNT: 'seedmind_completed_conversations_count',
  // We intentionally do NOT sync pending meditation.
};

const SYNC_META_DOC_ID = 'sync';
const ALLOW_EMPTY_CHAT_SYNC_UNTIL_KEY = 'seedmind_allow_empty_chat_snapshot_sync_until_v1';
const ALLOW_EMPTY_SNAPSHOT_SYNC_UNTIL_PREFIX = 'seedmind_allow_empty_snapshot_sync_until_v1_';
const RESTORE_DONE_UID_KEY = 'seedmind_cloud_restore_done_uid_v1';

type SyncMeta = {
  schemaVersion: number;
  migratedAt?: string;
  lastRestoreAt?: string;
  lastSyncAt?: string;
};

const SCHEMA_VERSION = 1;
const SNAPSHOT_SCHEMA_VERSION = 1;

// Store the exact AsyncStorage payload as a string in Firestore (so we can enforce size limits in rules).
// Firestore hard limit is ~1 MiB per document; keep some headroom for fields/overhead.
const MAX_RAW_CHARS = 900_000;

let scheduledSyncTimer: ReturnType<typeof setTimeout> | null = null;
let scheduledSyncInFlight: Promise<void> | null = null;
let restoreDoneUidCache: string | null = null;
let restoreDoneUidCacheLoadStarted = false;

export async function shouldRunCloudRestore(uid: string): Promise<boolean> {
  // Only do an expensive Cloud->Local restore when it’s actually needed.
  // Otherwise, users see a “Restoring…” flash on every app open/tab mount.
  try {
    const [doneUidRaw, chatsRaw, seedsRaw, meditationRaw] = await Promise.all([
      AsyncStorage.getItem(RESTORE_DONE_UID_KEY),
      AsyncStorage.getItem(CHAT_KEYS.CONVERSATIONS),
      AsyncStorage.getItem(MEDITATION_KEYS.SEEDS_GARDEN),
      AsyncStorage.getItem(MEDITATION_KEYS.MEDITATION_HISTORY),
    ]);

    const alreadyDoneForUid = String(doneUidRaw || '') === uid;
    const hasAnyLocalData =
      !isEmptyLocalJson(chatsRaw) || !isEmptyLocalJson(seedsRaw) || !isEmptyLocalJson(meditationRaw);

    // Restore if we’ve never restored for this uid OR if local snapshots look empty/missing.
    return !alreadyDoneForUid || !hasAnyLocalData;
  } catch {
    // If we can't read storage reliably, it's safer to attempt a restore.
    return true;
  }
}

function getCurrentUidOrNull(): string | null {
  if (!isFirebaseConfigured()) return null;
  try {
    const u = getFirebaseAuth().currentUser;
    return u?.uid ?? null;
  } catch {
    return null;
  }
}

function userDocRef(uid: string) {
  return doc(getFirestoreDb(), 'users', uid);
}

function userMetaRef(uid: string) {
  return doc(getFirestoreDb(), 'users', uid, 'meta', SYNC_META_DOC_ID);
}

function userCollection(uid: string, name: string) {
  return collection(getFirestoreDb(), 'users', uid, name);
}

function getProxyBaseUrlOrNull(): string | null {
  // We reuse the same Cloud Run service that proxies DeepSeek.
  // In app.config.js extra: deepseekProxyUrl points to `${base}/v1/chat/completions`.
  const u = (Constants.expoConfig?.extra as any)?.deepseekProxyUrl || '';
  const url = String(u || '').trim();
  if (!url) return null;
  return url.replace(/\/v1\/chat\/completions\/?$/i, '');
}

async function restoreCloudToLocalViaProxy(uid: string): Promise<void> {
  const base = getProxyBaseUrlOrNull();
  if (!base) throw new Error('PROXY_NOT_CONFIGURED');

  if (!isFirebaseConfigured()) throw new Error('FIREBASE_NOT_CONFIGURED');
  const user = getFirebaseAuth().currentUser;
  if (!user || user.uid !== uid) throw new Error('AUTH_REQUIRED');

  // Force refresh so restore works reliably right after sign-in.
  const token = await user.getIdToken(true);
  if (!token) throw new Error('AUTH_REQUIRED');

  const fetchSnapshots = async (attempt: number): Promise<Response> => {
    const ts = Date.now() + Math.max(0, attempt);
    // IMPORTANT: this endpoint must never be cached. We’ve observed iOS/URLSession doing
    // conditional requests that cause Cloud Run to return 304, which breaks JSON restore.
    return await fetch(`${base}/v1/sync/snapshots?ts=${ts}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  };

  let resp = await fetchSnapshots(0);
  if (resp.status === 304) {
    // Retry once with a fresh cache-buster.
    resp = await fetchSnapshots(1);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`PROXY_RESTORE_FAILED_${resp.status}_${text.slice(0, 120)}`);
  }
  const json = (await resp.json()) as any;
  const sync = json?.sync || {};
  const stats = json?.stats || {};

  const setIfRawString = async (raw: unknown, storageKey: string) => {
    if (typeof raw !== 'string') return;
    await AsyncStorage.setItem(storageKey, raw);
  };

  await Promise.all([
    setIfRawString(sync?.chatSnapshot?.raw, CHAT_KEYS.CONVERSATIONS),
    setIfRawString(sync?.activeChatId?.raw, CHAT_KEYS.ACTIVE_CHAT_ID),

    setIfRawString(sync?.gardenSeedsSnapshot?.raw, MEDITATION_KEYS.SEEDS_GARDEN),
    setIfRawString(sync?.meditationHistorySnapshot?.raw, MEDITATION_KEYS.MEDITATION_HISTORY),
    setIfRawString(stats?.meditation?.raw, MEDITATION_KEYS.MEDITATION_STREAK),

    setIfRawString(sync?.soundSettings?.raw, MEDITATION_KEYS.SOUND_SETTINGS),
    setIfRawString(sync?.harvestStories?.raw, MEDITATION_KEYS.HARVEST_STORIES),
    setIfRawString(sync?.voicePreference?.raw, MEDITATION_KEYS.VOICE_PREFERENCE),
    setIfRawString(sync?.firstSeedlingNotified?.raw, MEDITATION_KEYS.FIRST_SEEDLING_NOTIFIED),
    setIfRawString(sync?.bloomNotifiedSeeds?.raw, MEDITATION_KEYS.BLOOM_NOTIFIED_SEEDS),
    setIfRawString(sync?.conversationStyle?.raw, MEDITATION_KEYS.CONVERSATION_STYLE),
    setIfRawString(sync?.completedConversationsCount?.raw, MEDITATION_KEYS.COMPLETED_CONVERSATIONS_COUNT),
  ]);
}

async function collectionHasAnyDoc(uid: string, name: string): Promise<boolean> {
  const snap = await getDocs(query(userCollection(uid, name), limit(1)));
  return !snap.empty;
}

function safeJsonParse(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isEmptyLocalJson(raw: string | null): boolean {
  if (!raw) return true;
  const parsed = safeJsonParse(raw);
  if (parsed === null) return true;
  if (Array.isArray(parsed)) return parsed.length === 0;
  if (typeof parsed === 'object') return Object.keys(parsed).length === 0;
  return false;
}

function isEmptySnapshotRaw(raw: string | null): boolean {
  const trimmed = String(raw ?? '').trim();
  return trimmed === '' || trimmed === '[]' || trimmed === '{}' || trimmed === 'null';
}

async function isEmptySnapshotSyncAllowed(storageKey: string): Promise<boolean> {
  if (!storageKey) return false;
  // Backward compat: chat uses the legacy single key.
  if (storageKey === CHAT_KEYS.CONVERSATIONS) {
    const untilRaw = await AsyncStorage.getItem(ALLOW_EMPTY_CHAT_SYNC_UNTIL_KEY);
    const until = untilRaw ? Number(untilRaw) : 0;
    return !!until && Number.isFinite(until) && Date.now() <= until;
  }
  const untilRaw = await AsyncStorage.getItem(`${ALLOW_EMPTY_SNAPSHOT_SYNC_UNTIL_PREFIX}${storageKey}`);
  const until = untilRaw ? Number(untilRaw) : 0;
  return !!until && Number.isFinite(until) && Date.now() <= until;
}

async function setJsonDoc(uid: string, collectionName: string, docId: string, value: any) {
  await setDoc(doc(getFirestoreDb(), 'users', uid, collectionName, docId), value, { merge: true });
}

async function setRawSingleton(uid: string, collectionName: string, docId: string, storageKey: string) {
  const raw = await AsyncStorage.getItem(storageKey);
  if (raw == null) return;
  // Prevent accidental cloud wipes: never sync an empty snapshot unless the user explicitly cleared it.
  // This is especially important on account switching, fresh installs, or restore failures.
  if (isEmptySnapshotRaw(raw)) {
    const allowed = await isEmptySnapshotSyncAllowed(storageKey);
    if (!allowed) {
      console.warn(`[cloudSync] skip ${collectionName}/${docId}: empty local snapshot (guarded)`);
      return;
    }
  }
  if (raw.length > MAX_RAW_CHARS) {
    console.warn(`[cloudSync] skip ${collectionName}/${docId}: payload too large (${raw.length} chars)`);
    return;
  }
  await setJsonDoc(uid, collectionName, docId, {
    raw,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Allow syncing an empty chat snapshot for a short window.
 * This is used only for explicit user actions like "Clear Chat History".
 */
export async function allowEmptyChatSnapshotSyncForMs(ms: number = 5 * 60 * 1000): Promise<void> {
  const until = Date.now() + Math.max(30_000, ms);
  await AsyncStorage.setItem(ALLOW_EMPTY_CHAT_SYNC_UNTIL_KEY, String(until));
}

/**
 * Allow syncing an empty snapshot for a short window.
 * Use this only for explicit user actions like "Reset all data".
 */
export async function allowEmptySnapshotSyncForKeyForMs(
  storageKey: string,
  ms: number = 5 * 60 * 1000
): Promise<void> {
  const key = String(storageKey || '').trim();
  if (!key) return;
  // Keep chat's legacy key updated too.
  if (key === CHAT_KEYS.CONVERSATIONS) {
    await allowEmptyChatSnapshotSyncForMs(ms);
    return;
  }
  const until = Date.now() + Math.max(30_000, ms);
  await AsyncStorage.setItem(`${ALLOW_EMPTY_SNAPSHOT_SYNC_UNTIL_PREFIX}${key}`, String(until));
}

async function restoreJsonSingleton(uid: string, collectionName: string, docId: string, storageKey: string) {
  const snap = await getDoc(doc(getFirestoreDb(), 'users', uid, collectionName, docId));
  if (!snap.exists()) return;
  const data = snap.data() as any;
  if (!data) return;
  if (typeof data.raw === 'string') {
    await AsyncStorage.setItem(storageKey, data.raw);
    return;
  }
  // Backward compat: older docs stored parsed JSON under "value".
  if (data.value === undefined) return;
  await AsyncStorage.setItem(storageKey, JSON.stringify(data.value));
}

/**
 * Ensure `/users/{uid}` exists. Safe to call on every login.
 */
export async function ensureUserDoc(user: User): Promise<void> {
  const uid = user.uid;
  await setDoc(
    userDocRef(uid),
    {
      email: user.email ?? null,
      lastLoginAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Ensure meta doc exists too
  await setDoc(
    userMetaRef(uid),
    {
      schemaVersion: SCHEMA_VERSION,
    } satisfies SyncMeta,
    { merge: true }
  );
}

/**
 * Local -> Cloud migration.
 *
 * Rules:
 * - If cloud already has any data, we DO NOT upload local data (avoid overwriting).
 * - If cloud is empty and local has data, we upload local snapshots.
 */
export async function migrateLocalToCloudIfNeeded(uid: string): Promise<void> {
  // We use a dedicated meta marker + our snapshot docs to decide migration.
  // This prevents manually-created placeholder docs from blocking migration.
  const metaSnap = await getDoc(userMetaRef(uid));
  const meta = metaSnap.exists() ? (metaSnap.data() as SyncMeta) : null;
  if (meta?.migratedAt) return;

  const [chatSnap, gardenSnap, statsSnap] = await Promise.all([
    getDoc(doc(getFirestoreDb(), 'users', uid, 'sync', 'chatSnapshot')),
    getDoc(doc(getFirestoreDb(), 'users', uid, 'sync', 'gardenSeedsSnapshot')),
    getDoc(doc(getFirestoreDb(), 'users', uid, 'stats', 'meditation')),
  ]);
  const hasOurSnapshots = chatSnap.exists() || gardenSnap.exists() || statsSnap.exists();
  if (hasOurSnapshots) return;

  // Determine if local has anything worth migrating.
  const [localConvos, localGardenSeeds, localStreak, localHistory] = await Promise.all([
    AsyncStorage.getItem(CHAT_KEYS.CONVERSATIONS),
    AsyncStorage.getItem(MEDITATION_KEYS.SEEDS_GARDEN),
    AsyncStorage.getItem(MEDITATION_KEYS.MEDITATION_STREAK),
    AsyncStorage.getItem(MEDITATION_KEYS.MEDITATION_HISTORY),
  ]);

  const localHasData =
    !isEmptyLocalJson(localConvos) ||
    !isEmptyLocalJson(localGardenSeeds) ||
    !isEmptyLocalJson(localStreak) ||
    !isEmptyLocalJson(localHistory);

  if (!localHasData) {
    await setDoc(
      userMetaRef(uid),
      { migratedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION } satisfies SyncMeta,
      { merge: true }
    );
    return;
  }

  // Upload snapshots as "single doc" blobs for a safe MVP (no heavy per-message writes yet).
  await setRawSingleton(uid, 'sync', 'chatSnapshot', CHAT_KEYS.CONVERSATIONS);
  await setRawSingleton(uid, 'sync', 'activeChatId', CHAT_KEYS.ACTIVE_CHAT_ID);

  await setRawSingleton(uid, 'sync', 'gardenSeedsSnapshot', MEDITATION_KEYS.SEEDS_GARDEN);
  await setRawSingleton(uid, 'sync', 'meditationHistorySnapshot', MEDITATION_KEYS.MEDITATION_HISTORY);
  await setRawSingleton(uid, 'stats', 'meditation', MEDITATION_KEYS.MEDITATION_STREAK);

  await Promise.all([
    setRawSingleton(uid, 'sync', 'soundSettings', MEDITATION_KEYS.SOUND_SETTINGS),
    setRawSingleton(uid, 'sync', 'harvestStories', MEDITATION_KEYS.HARVEST_STORIES),
    setRawSingleton(uid, 'sync', 'voicePreference', MEDITATION_KEYS.VOICE_PREFERENCE),
    setRawSingleton(uid, 'sync', 'firstSeedlingNotified', MEDITATION_KEYS.FIRST_SEEDLING_NOTIFIED),
    setRawSingleton(uid, 'sync', 'bloomNotifiedSeeds', MEDITATION_KEYS.BLOOM_NOTIFIED_SEEDS),
    setRawSingleton(uid, 'sync', 'conversationStyle', MEDITATION_KEYS.CONVERSATION_STYLE),
    setRawSingleton(uid, 'sync', 'completedConversationsCount', MEDITATION_KEYS.COMPLETED_CONVERSATIONS_COUNT),
  ]);

  await setDoc(
    userMetaRef(uid),
    { migratedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION } satisfies SyncMeta,
    { merge: true }
  );
}

/**
 * Cloud -> Local restore.
 *
 * For MVP we restore from the same "snapshot doc" blobs.
 * If docs don't exist, we do nothing.
 */
export async function restoreCloudToLocal(uid: string): Promise<void> {
  try {
    await Promise.all([
      restoreJsonSingleton(uid, 'sync', 'chatSnapshot', CHAT_KEYS.CONVERSATIONS),
      restoreJsonSingleton(uid, 'sync', 'activeChatId', CHAT_KEYS.ACTIVE_CHAT_ID),

      restoreJsonSingleton(uid, 'sync', 'gardenSeedsSnapshot', MEDITATION_KEYS.SEEDS_GARDEN),
      restoreJsonSingleton(uid, 'sync', 'meditationHistorySnapshot', MEDITATION_KEYS.MEDITATION_HISTORY),
      restoreJsonSingleton(uid, 'stats', 'meditation', MEDITATION_KEYS.MEDITATION_STREAK),

      restoreJsonSingleton(uid, 'sync', 'soundSettings', MEDITATION_KEYS.SOUND_SETTINGS),
      restoreJsonSingleton(uid, 'sync', 'harvestStories', MEDITATION_KEYS.HARVEST_STORIES),
      restoreJsonSingleton(uid, 'sync', 'voicePreference', MEDITATION_KEYS.VOICE_PREFERENCE),
      restoreJsonSingleton(uid, 'sync', 'firstSeedlingNotified', MEDITATION_KEYS.FIRST_SEEDLING_NOTIFIED),
      restoreJsonSingleton(uid, 'sync', 'bloomNotifiedSeeds', MEDITATION_KEYS.BLOOM_NOTIFIED_SEEDS),
      restoreJsonSingleton(uid, 'sync', 'conversationStyle', MEDITATION_KEYS.CONVERSATION_STYLE),
      restoreJsonSingleton(uid, 'sync', 'completedConversationsCount', MEDITATION_KEYS.COMPLETED_CONVERSATIONS_COUNT),
    ]);
  } catch (e) {
    console.warn('[cloudSync] direct restore failed; falling back to proxy', e);
    // Fallback: fetch snapshots via Cloud Run (admin) using the user's Firebase ID token.
    await restoreCloudToLocalViaProxy(uid);
  }

  await setDoc(
    userMetaRef(uid),
    { lastRestoreAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION } satisfies SyncMeta,
    { merge: true }
  );

  // Gate all background snapshot writes until the first restore completes for this uid.
  // This prevents a "fresh install + immediate message" from overwriting cloud history
  // before the restore has had a chance to populate AsyncStorage.
  restoreDoneUidCache = uid;
  await AsyncStorage.setItem(RESTORE_DONE_UID_KEY, uid);
}

/**
 * Ongoing snapshots sync (Local -> Cloud).
 *
 * This is NOT one-time migration; it can be called repeatedly to keep snapshots updated.
 */
export async function syncLocalSnapshotsToCloud(uid: string): Promise<void> {
  await Promise.all([
    setRawSingleton(uid, 'sync', 'chatSnapshot', CHAT_KEYS.CONVERSATIONS),
    setRawSingleton(uid, 'sync', 'activeChatId', CHAT_KEYS.ACTIVE_CHAT_ID),

    setRawSingleton(uid, 'sync', 'gardenSeedsSnapshot', MEDITATION_KEYS.SEEDS_GARDEN),
    setRawSingleton(uid, 'sync', 'meditationHistorySnapshot', MEDITATION_KEYS.MEDITATION_HISTORY),
    setRawSingleton(uid, 'stats', 'meditation', MEDITATION_KEYS.MEDITATION_STREAK),

    setRawSingleton(uid, 'sync', 'soundSettings', MEDITATION_KEYS.SOUND_SETTINGS),
    setRawSingleton(uid, 'sync', 'harvestStories', MEDITATION_KEYS.HARVEST_STORIES),
    setRawSingleton(uid, 'sync', 'voicePreference', MEDITATION_KEYS.VOICE_PREFERENCE),
    setRawSingleton(uid, 'sync', 'firstSeedlingNotified', MEDITATION_KEYS.FIRST_SEEDLING_NOTIFIED),
    setRawSingleton(uid, 'sync', 'bloomNotifiedSeeds', MEDITATION_KEYS.BLOOM_NOTIFIED_SEEDS),
    setRawSingleton(uid, 'sync', 'conversationStyle', MEDITATION_KEYS.CONVERSATION_STYLE),
    setRawSingleton(uid, 'sync', 'completedConversationsCount', MEDITATION_KEYS.COMPLETED_CONVERSATIONS_COUNT),
  ]);

  await setDoc(
    userMetaRef(uid),
    { lastSyncAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION } satisfies SyncMeta,
    { merge: true }
  );
}

/**
 * Debounced local snapshot sync for "real app" behavior.
 * Safe to call very frequently from storage writes.
 */
export function scheduleSnapshotSync(reason?: string): void {
  const uid = getCurrentUidOrNull();
  if (!uid) return;

  // Prevent accidental cloud overwrites before Cloud->Local restore completes.
  if (restoreDoneUidCache !== uid) {
    if (!restoreDoneUidCacheLoadStarted) {
      restoreDoneUidCacheLoadStarted = true;
      AsyncStorage.getItem(RESTORE_DONE_UID_KEY)
        .then((v) => {
          restoreDoneUidCache = v || null;
        })
        .catch(() => {});
    }
    return;
  }

  if (scheduledSyncTimer) clearTimeout(scheduledSyncTimer);
  scheduledSyncTimer = setTimeout(() => {
    scheduledSyncTimer = null;
    if (scheduledSyncInFlight) return;

    scheduledSyncInFlight = Promise.resolve()
      .then(() => syncLocalSnapshotsToCloud(uid))
      .catch((e) => console.warn('[cloudSync] snapshot sync failed', reason ?? 'unknown', e))
      .finally(() => {
        scheduledSyncInFlight = null;
      });
  }, 1200);
}

