import admin from 'firebase-admin';
import type { firestore as FirestoreNS } from 'firebase-admin';

export type DeviceLimitsSnapshot = {
  cycleStartAt: number; // ms
  cycleEndAt: number; // ms
  messagesUsed: number;
  gardenTicketsUsed: number;
};

export type LimitsConfig = {
  freeMessages: number;
  freeGardenTickets: number;
  cycleDays: number;
};

export type ConsumeResult =
  | { ok: true; snapshot: DeviceLimitsSnapshot }
  | { ok: false; snapshot: DeviceLimitsSnapshot; reason: 'message_limit' | 'garden_limit' };

const daysToMs = (d: number) => d * 24 * 60 * 60 * 1000;

function sanitizeNumber(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeSnapshot(v: any, now: number, cfg: LimitsConfig): DeviceLimitsSnapshot {
  const base = typeof v === 'object' && v ? v : {};
  const cycleStartAt = sanitizeNumber(base.cycleStartAt, now);
  const cycleEndAt = sanitizeNumber(base.cycleEndAt, now + daysToMs(cfg.cycleDays));
  const messagesUsed = Math.max(0, Math.floor(sanitizeNumber(base.messagesUsed, 0)));
  const gardenTicketsUsed = Math.max(0, Math.floor(sanitizeNumber(base.gardenTicketsUsed, 0)));
  if (!(cycleEndAt > cycleStartAt)) {
    return {
      cycleStartAt: now,
      cycleEndAt: now + daysToMs(cfg.cycleDays),
      messagesUsed: 0,
      gardenTicketsUsed: 0,
    };
  }
  return { cycleStartAt, cycleEndAt, messagesUsed, gardenTicketsUsed };
}

function freshCycle(now: number, cfg: LimitsConfig): DeviceLimitsSnapshot {
  return {
    cycleStartAt: now,
    cycleEndAt: now + daysToMs(cfg.cycleDays),
    messagesUsed: 0,
    gardenTicketsUsed: 0,
  };
}

function deviceLimitsRef(deviceId: string) {
  // deviceId comes from RevenueCat originalAppUserId (Keychain-stable)
  // and must not contain "/" to be a valid doc id.
  const safeId = String(deviceId || '').replace(/\//g, '_').slice(0, 220);
  return admin.firestore().collection('deviceFreeLimits').doc(safeId);
}

export async function getDeviceLimitsSnapshot(
  deviceId: string,
  cfg: LimitsConfig
): Promise<DeviceLimitsSnapshot> {
  const now = Date.now();
  const ref = deviceLimitsRef(deviceId);
  const snap = await ref.get();
  const current = sanitizeSnapshot(snap.exists ? snap.data() : null, now, cfg);
  if (now >= current.cycleEndAt) {
    const refreshed = freshCycle(now, cfg);
    await ref.set(
      {
        ...refreshed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return refreshed;
  }
  return current;
}

export async function consumeDeviceMessage(
  deviceId: string,
  uid: string,
  cfg: LimitsConfig
): Promise<ConsumeResult> {
  return await consume(deviceId, uid, cfg, 'message');
}

export async function consumeDeviceGardenTicket(
  deviceId: string,
  uid: string,
  cfg: LimitsConfig
): Promise<ConsumeResult> {
  return await consume(deviceId, uid, cfg, 'garden');
}

async function consume(
  deviceId: string,
  uid: string,
  cfg: LimitsConfig,
  kind: 'message' | 'garden'
): Promise<ConsumeResult> {
  const db = admin.firestore();
  const now = Date.now();
  const ref = deviceLimitsRef(deviceId);

  return await db.runTransaction(async (tx: FirestoreNS.Transaction) => {
    const snap = await tx.get(ref);
    const current = sanitizeSnapshot(snap.exists ? snap.data() : null, now, cfg);
    const base = now >= current.cycleEndAt ? freshCycle(now, cfg) : current;

    if (kind === 'message') {
      if (base.messagesUsed >= cfg.freeMessages) {
        tx.set(
          ref,
          {
            ...base,
            uidLastSeen: uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return { ok: false as const, snapshot: base, reason: 'message_limit' as const };
      }
      const updated: DeviceLimitsSnapshot = {
        ...base,
        messagesUsed: Math.min(cfg.freeMessages, base.messagesUsed + 1),
      };
      tx.set(
        ref,
        {
          ...updated,
          uidLastSeen: uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return { ok: true as const, snapshot: updated };
    }

    // garden
    if (base.gardenTicketsUsed >= cfg.freeGardenTickets) {
      tx.set(
        ref,
        {
          ...base,
          uidLastSeen: uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return { ok: false as const, snapshot: base, reason: 'garden_limit' as const };
    }
    const updated: DeviceLimitsSnapshot = {
      ...base,
      gardenTicketsUsed: Math.min(cfg.freeGardenTickets, base.gardenTicketsUsed + 1),
    };
    tx.set(
      ref,
      {
        ...updated,
        uidLastSeen: uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true as const, snapshot: updated };
  });
}

