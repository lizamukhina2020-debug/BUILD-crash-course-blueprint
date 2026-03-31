import admin from 'firebase-admin';
import type { firestore as FirestoreNS } from 'firebase-admin';

type Limits = {
  perMinute: number;
  perDay: number;
};

type Result =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number; scope: 'minute' | 'day' };

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function utcMinuteKey(d: Date) {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(
    d.getUTCHours()
  )}${pad2(d.getUTCMinutes())}`;
}

function utcDayKey(d: Date) {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

function secondsUntilNextMinute(d: Date) {
  const sec = d.getUTCSeconds();
  return Math.max(1, 60 - sec);
}

function secondsUntilNextDay(d: Date) {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0));
  return Math.max(60, Math.floor((next.getTime() - d.getTime()) / 1000));
}

export async function enforceUidRateLimit(uid: string, limits: Limits): Promise<Result> {
  const db = admin.firestore();
  const now = new Date();

  const minuteKey = utcMinuteKey(now);
  const dayKey = utcDayKey(now);

  const minuteRef = db.collection('rateLimits').doc(`m_${uid}_${minuteKey}`);
  const dayRef = db.collection('rateLimits').doc(`d_${uid}_${dayKey}`);

  try {
    await db.runTransaction(async (tx: FirestoreNS.Transaction) => {
      const [mSnap, dSnap] = await Promise.all([tx.get(minuteRef), tx.get(dayRef)]);
      const mCount = (mSnap.exists ? (mSnap.data()?.count as number) : 0) || 0;
      const dCount = (dSnap.exists ? (dSnap.data()?.count as number) : 0) || 0;

      if (mCount >= limits.perMinute) {
        throw Object.assign(new Error('RATE_MINUTE'), { scope: 'minute' as const });
      }
      if (dCount >= limits.perDay) {
        throw Object.assign(new Error('RATE_DAY'), { scope: 'day' as const });
      }

      const increment = admin.firestore.FieldValue.increment(1);
      const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();

      // Store short TTL hints (optional; you can enable Firestore TTL later).
      const minuteExpiresAt = admin.firestore.Timestamp.fromMillis(now.getTime() + 2 * 60 * 1000);
      const dayExpiresAt = admin.firestore.Timestamp.fromMillis(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      tx.set(
        minuteRef,
        {
          uid,
          scope: 'minute',
          count: increment,
          createdAt: serverTimestamp,
          expiresAt: minuteExpiresAt,
        },
        { merge: true }
      );
      tx.set(
        dayRef,
        {
          uid,
          scope: 'day',
          count: increment,
          createdAt: serverTimestamp,
          expiresAt: dayExpiresAt,
        },
        { merge: true }
      );
    });

    return { ok: true };
  } catch (e: any) {
    const scope = e?.scope as 'minute' | 'day' | undefined;
    if (scope === 'minute') {
      return { ok: false, scope: 'minute', retryAfterSeconds: secondsUntilNextMinute(now) };
    }
    if (scope === 'day') {
      return { ok: false, scope: 'day', retryAfterSeconds: secondsUntilNextDay(now) };
    }
    // If rate limiter fails (e.g. Firestore unavailable), fail open to avoid breaking chat.
    return { ok: true };
  }
}

