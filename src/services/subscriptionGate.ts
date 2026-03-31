import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { isRevenueCatPremiumForUid } from './revenueCat';
import { getFirebaseAuth, isFirebaseConfigured } from './firebase';
import { getInstallationId } from './installationId';

// Phase 1 gating (pre-RevenueCat): local limits + dev "Force Premium" toggle.
// Later we will merge this with RevenueCat entitlement state.

const STORAGE_KEYS = {
  DEV_FORCE_PREMIUM: 'seedmind_dev_force_premium_v1',
  DEV_FORCE_FREE: 'seedmind_dev_force_free_v1',
  // Device-wide free limits (shared across accounts on this device).
  FREE_LIMITS_DEVICE: 'seedmind_free_limits_v1',
};

export const FREE_MESSAGE_LIMIT = 20; // user-sent messages per free cycle
export const FREE_GARDEN_TICKET_LIMIT = 2; // per free cycle
export const FREE_CYCLE_DAYS = 30; // rolling from first use

export const PREMIUM_MESSAGE_LIMIT = 1000; // per billing cycle (Phase 2)

export type LimitsSnapshot = {
  cycleStartAt: number; // ms
  cycleEndAt: number; // ms
  messagesUsed: number;
  gardenTicketsUsed: number;
};

const nowMs = () => Date.now();
const daysToMs = (days: number) => days * 24 * 60 * 60 * 1000;
function getLimitsBaseUrlOrNull(): string | null {
  // We reuse the same Cloud Run service that proxies DeepSeek.
  // In app.config.js extra: deepseekProxyUrl points to `${base}/v1/chat/completions`.
  const u = (Constants.expoConfig?.extra as any)?.deepseekProxyUrl || '';
  const url = String(u || '').trim();
  if (!url) return null;
  return url.replace(/\/v1\/chat\/completions\/?$/i, '');
}

function createNewFreeCycle(startAtMs: number): LimitsSnapshot {
  return {
    cycleStartAt: startAtMs,
    cycleEndAt: startAtMs + daysToMs(FREE_CYCLE_DAYS),
    messagesUsed: 0,
    gardenTicketsUsed: 0,
  };
}

function getUidOrNull(): string | null {
  try {
    return getFirebaseAuth().currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

function sanitizeSnapshot(v: any, now: number): LimitsSnapshot {
  const base = typeof v === 'object' && v ? v : {};
  const cycleStartAt = Number(base.cycleStartAt);
  const cycleEndAt = Number(base.cycleEndAt);
  const messagesUsed = Number(base.messagesUsed);
  const gardenTicketsUsed = Number(base.gardenTicketsUsed);
  const snap: LimitsSnapshot = {
    cycleStartAt: Number.isFinite(cycleStartAt) ? cycleStartAt : now,
    cycleEndAt: Number.isFinite(cycleEndAt) ? cycleEndAt : now + daysToMs(FREE_CYCLE_DAYS),
    messagesUsed: Number.isFinite(messagesUsed) ? Math.max(0, Math.floor(messagesUsed)) : 0,
    gardenTicketsUsed: Number.isFinite(gardenTicketsUsed) ? Math.max(0, Math.floor(gardenTicketsUsed)) : 0,
  };
  if (!(snap.cycleEndAt > snap.cycleStartAt)) return createNewFreeCycle(now);
  return snap;
}

async function waitForFirebaseUser(maxWaitMs: number = 1800): Promise<ReturnType<typeof getFirebaseAuth>['currentUser']> {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const u = getFirebaseAuth().currentUser;
    if (u) return u;
    await new Promise<void>((r) => setTimeout(r, 120));
  }
  return getFirebaseAuth().currentUser;
}

async function getAuthBearerForLimits(): Promise<string> {
  if (!isFirebaseConfigured()) throw new Error('FIREBASE_NOT_CONFIGURED');
  // On iOS, right after sign-in there can be a short window where currentUser is still null.
  // Wait briefly to avoid returning stale 0/20 after reinstall/login.
  const u = getFirebaseAuth().currentUser || (await waitForFirebaseUser());
  if (!u) throw new Error('AUTH_REQUIRED');
  const token = await u.getIdToken(true);
  if (!token) throw new Error('AUTH_REQUIRED');
  return token;
}

async function getDeviceIdForLimits(): Promise<string | null> {
  try {
    return await getInstallationId();
  } catch {
    return null;
  }
}

async function fetchLimitsSnapshotFromServer(): Promise<LimitsSnapshot | null> {
  const base = getLimitsBaseUrlOrNull();
  if (!base) return null;
  const deviceId = await getDeviceIdForLimits();
  if (!deviceId) return null;
  const bearer = await getAuthBearerForLimits();

  const ts = Date.now();
  const res = await fetch(`${base}/v1/limits?ts=${ts}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'x-seedmind-device-id': deviceId,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
  if (!res.ok) return null;
  const json: any = await res.json().catch(() => null);
  const snap = sanitizeSnapshot(json?.snapshot ?? null, nowMs());
  return snap;
}

// Force-refresh from server (for UI sync).
export async function refreshFreeLimitsFromServer(): Promise<LimitsSnapshot | null> {
  try {
    const snap = await fetchLimitsSnapshotFromServer();
    if (!snap) return null;
    await writeJson(STORAGE_KEYS.FREE_LIMITS_DEVICE, snap).catch(() => {});
    return snap;
  } catch {
    return null;
  }
}

async function consumeFromServer(kind: 'message' | 'garden'): Promise<{ ok: boolean; snapshot: LimitsSnapshot | null }> {
  const base = getLimitsBaseUrlOrNull();
  if (!base) return { ok: false, snapshot: null };
  const deviceId = await getDeviceIdForLimits();
  if (!deviceId) return { ok: false, snapshot: null };
  const bearer = await getAuthBearerForLimits();

  const res = await fetch(`${base}/v1/limits/consume/${kind}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      'x-seedmind-device-id': deviceId,
    },
    body: JSON.stringify({}),
  });

  const json: any = await res.json().catch(() => null);
  const snap = sanitizeSnapshot(json?.snapshot ?? null, nowMs());
  if (res.status === 402) return { ok: false, snapshot: snap };
  if (!res.ok) return { ok: false, snapshot: null };
  return { ok: true, snapshot: snap };
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: any): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getDevForcePremium(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.DEV_FORCE_PREMIUM);
  return raw === '1';
}

export async function setDevForcePremium(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.DEV_FORCE_PREMIUM, enabled ? '1' : '0');
}

export async function getDevForceFree(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.DEV_FORCE_FREE);
  return raw === '1';
}

export async function setDevForceFree(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.DEV_FORCE_FREE, enabled ? '1' : '0');
}

/**
 * Returns the effective premium status for gating.
 * Phase 1: dev-only toggle can force premium.
 */
export async function getEffectivePremiumFlag(): Promise<boolean> {
  // In dev builds, allow manual override for testing.
  if (__DEV__) {
    const forceFree = await getDevForceFree();
    if (forceFree) return false;
    const forced = await getDevForcePremium();
    if (forced) return true;
  }

  // Phase 2: RevenueCat is the source of truth in production/dev builds.
  // IMPORTANT: never let premium checks break core app flows (e.g. sending chat messages).
  // If RevenueCat is temporarily unavailable, treat as free and continue.
  try {
    const uid = getUidOrNull();
    // Strict Option C: Premium must belong to this SeedMind account.
    return uid ? await isRevenueCatPremiumForUid(uid) : false;
  } catch {
    return false;
  }
}

export async function getFreeLimitsSnapshot(): Promise<LimitsSnapshot> {
  const now = nowMs();

  const isPremium = await getEffectivePremiumFlag();
  if (isPremium) return createNewFreeCycle(now);

  // Prefer server snapshot (device-scoped, uninstall-resistant).
  try {
    const remote = await fetchLimitsSnapshotFromServer();
    if (remote) {
      await writeJson(STORAGE_KEYS.FREE_LIMITS_DEVICE, remote).catch(() => {});
      return remote;
    }
  } catch {
    // fall back to local
  }

  // Local fallback (offline / proxy not configured).
  const existing = await readJson<LimitsSnapshot>(STORAGE_KEYS.FREE_LIMITS_DEVICE);
  const snapshot = existing ? sanitizeSnapshot(existing, now) : createNewFreeCycle(now);
  if (now >= snapshot.cycleEndAt) {
    const refreshed = createNewFreeCycle(now);
    await writeJson(STORAGE_KEYS.FREE_LIMITS_DEVICE, refreshed).catch(() => {});
    return refreshed;
  }
  if (!existing) await writeJson(STORAGE_KEYS.FREE_LIMITS_DEVICE, snapshot).catch(() => {});
  return snapshot;
}

export async function getFreeRemaining(): Promise<{
  remainingMessages: number;
  remainingGardenTickets: number;
  cycleEndAt: number;
}> {
  const snap = await getFreeLimitsSnapshot();
  return {
    remainingMessages: Math.max(0, FREE_MESSAGE_LIMIT - snap.messagesUsed),
    remainingGardenTickets: Math.max(0, FREE_GARDEN_TICKET_LIMIT - snap.gardenTicketsUsed),
    cycleEndAt: snap.cycleEndAt,
  };
}

export async function canSendUserMessage(): Promise<{
  allowed: boolean;
  remainingAfter: number;
  cycleEndAt: number;
  isPremium: boolean;
}> {
  const isPremium = await getEffectivePremiumFlag();
  if (isPremium) {
    return { allowed: true, remainingAfter: Number.POSITIVE_INFINITY, cycleEndAt: nowMs(), isPremium };
  }
  const snap = await getFreeLimitsSnapshot();
  const allowed = snap.messagesUsed < FREE_MESSAGE_LIMIT;
  return {
    allowed,
    remainingAfter: Math.max(0, FREE_MESSAGE_LIMIT - (snap.messagesUsed + 1)),
    cycleEndAt: snap.cycleEndAt,
    isPremium,
  };
}

export async function recordUserMessageSent(): Promise<LimitsSnapshot> {
  const now = nowMs();
  const isPremium = await getEffectivePremiumFlag();
  if (isPremium) return createNewFreeCycle(now);

  const snap = await getFreeLimitsSnapshot();
  const next: LimitsSnapshot = { ...snap, messagesUsed: Math.min(FREE_MESSAGE_LIMIT, snap.messagesUsed + 1) };
  await writeJson(STORAGE_KEYS.FREE_LIMITS_DEVICE, next).catch(() => {});
  // Best-effort sync: the proxy may have already consumed server-side.
  // Refresh in background so reinstall/login always converges to server truth.
  refreshFreeLimitsFromServer().catch(() => {});
  return next;
}

export async function canSpendGardenTicket(): Promise<{
  allowed: boolean;
  remainingAfter: number;
  cycleEndAt: number;
  isPremium: boolean;
}> {
  const isPremium = await getEffectivePremiumFlag();
  if (isPremium) {
    return { allowed: true, remainingAfter: Number.POSITIVE_INFINITY, cycleEndAt: nowMs(), isPremium };
  }
  const snap = await getFreeLimitsSnapshot();
  const allowed = snap.gardenTicketsUsed < FREE_GARDEN_TICKET_LIMIT;
  return {
    allowed,
    remainingAfter: Math.max(0, FREE_GARDEN_TICKET_LIMIT - (snap.gardenTicketsUsed + 1)),
    cycleEndAt: snap.cycleEndAt,
    isPremium,
  };
}

export async function recordGardenTicketSpent(): Promise<LimitsSnapshot> {
  const now = nowMs();
  const isPremium = await getEffectivePremiumFlag();
  if (isPremium) return createNewFreeCycle(now);

  try {
    const r = await consumeFromServer('garden');
    if (r.snapshot) {
      await writeJson(STORAGE_KEYS.FREE_LIMITS_DEVICE, r.snapshot).catch(() => {});
      return r.snapshot;
    }
  } catch {
    // fall through
  }

  const snap = await getFreeLimitsSnapshot();
  const next: LimitsSnapshot = { ...snap, gardenTicketsUsed: Math.min(FREE_GARDEN_TICKET_LIMIT, snap.gardenTicketsUsed + 1) };
  await writeJson(STORAGE_KEYS.FREE_LIMITS_DEVICE, next).catch(() => {});
  return next;
}

