import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';
import { Readable } from 'node:stream';

import { mustGetEnv, getEnv } from './env.js';
import { enforceUidRateLimit } from './rateLimit.js';
import {
  consumeDeviceGardenTicket,
  consumeDeviceMessage,
  getDeviceLimitsSnapshot,
  type LimitsConfig,
} from './deviceFreeLimits.js';

// Cloud Run: use Application Default Credentials (service account).
if (!admin.apps.length) {
  admin.initializeApp();
}

const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

const DEEPSEEK_UPSTREAM_URL = getEnv('DEEPSEEK_UPSTREAM_URL', 'https://api.deepseek.com/v1/chat/completions');
const DEEPSEEK_API_KEY = mustGetEnv('DEEPSEEK_API_KEY');

const RATE_PER_MINUTE = Number(getEnv('RATE_PER_MINUTE', '25'));
const RATE_PER_DAY = Number(getEnv('RATE_PER_DAY', '250'));
const ADMIN_INTERNAL_TOKEN = getEnv('ADMIN_INTERNAL_TOKEN', '');

const FREE_MESSAGES = Number(getEnv('FREE_MESSAGE_LIMIT', '20'));
const FREE_GARDEN_TICKETS = Number(getEnv('FREE_GARDEN_TICKET_LIMIT', '2'));
const FREE_CYCLE_DAYS = Number(getEnv('FREE_CYCLE_DAYS', '30'));

const LIMITS_CFG: LimitsConfig = {
  freeMessages: Number.isFinite(FREE_MESSAGES) && FREE_MESSAGES > 0 ? FREE_MESSAGES : 20,
  freeGardenTickets: Number.isFinite(FREE_GARDEN_TICKETS) && FREE_GARDEN_TICKETS >= 0 ? FREE_GARDEN_TICKETS : 2,
  cycleDays: Number.isFinite(FREE_CYCLE_DAYS) && FREE_CYCLE_DAYS > 0 ? FREE_CYCLE_DAYS : 30,
};

function safeErr(e: any) {
  return {
    name: e?.name,
    message: e?.message,
    stack: e?.stack,
    status: e?.status,
  };
}

function extractBearer(req: express.Request): string | null {
  const h = req.header('authorization') || req.header('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function extractDeviceId(req: express.Request): string | null {
  const h = req.header('x-seedmind-device-id') || req.header('X-SeedMind-Device-Id') || '';
  const v = String(h || '').trim();
  if (!v) return null;
  // Firestore doc id can't contain '/', keep it safe.
  return v.replace(/\//g, '_').slice(0, 220);
}

async function requireUid(req: express.Request): Promise<string> {
  const token = extractBearer(req);
  if (!token) {
    const err: any = new Error('Missing Authorization bearer token');
    err.status = 401;
    throw err;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (!decoded?.uid) {
      const err: any = new Error('Invalid token');
      err.status = 401;
      throw err;
    }
    return decoded.uid;
  } catch (e) {
    const err: any = new Error('Invalid token');
    err.status = 401;
    throw err;
  }
}

app.get('/health', (_req: express.Request, res: express.Response) => {
  res.status(200).json({ ok: true });
});

// Device-scoped free limits (uninstall-resistant via RevenueCat originalAppUserId).
app.get('/v1/limits', async (req: express.Request, res: express.Response) => {
  try {
    const uid = await requireUid(req);
    const deviceId = extractDeviceId(req) || uid;
    const snap = await getDeviceLimitsSnapshot(deviceId, LIMITS_CFG);
    res.status(200).json({
      ok: true,
      deviceId,
      limits: {
        freeMessages: LIMITS_CFG.freeMessages,
        freeGardenTickets: LIMITS_CFG.freeGardenTickets,
        cycleDays: LIMITS_CFG.cycleDays,
      },
      snapshot: snap,
    });
  } catch (e: any) {
    console.error('[seedmind-cloudrun] /v1/limits failed', safeErr(e));
    const status = e?.status || 500;
    res.status(status).json({ ok: false, error: 'request_failed', message: e?.message || 'unknown' });
  }
});

app.post('/v1/limits/consume/message', async (req: express.Request, res: express.Response) => {
  try {
    const uid = await requireUid(req);
    const deviceId = extractDeviceId(req) || uid;
    const r = await consumeDeviceMessage(deviceId, uid, LIMITS_CFG);
    if (!r.ok) {
      res.status(402).json({
        ok: false,
        error: 'free_limit_reached',
        reason: r.reason,
        deviceId,
        limits: {
          freeMessages: LIMITS_CFG.freeMessages,
          freeGardenTickets: LIMITS_CFG.freeGardenTickets,
          cycleDays: LIMITS_CFG.cycleDays,
        },
        snapshot: r.snapshot,
      });
      return;
    }
    res.status(200).json({
      ok: true,
      deviceId,
      limits: {
        freeMessages: LIMITS_CFG.freeMessages,
        freeGardenTickets: LIMITS_CFG.freeGardenTickets,
        cycleDays: LIMITS_CFG.cycleDays,
      },
      snapshot: r.snapshot,
    });
  } catch (e: any) {
    console.error('[seedmind-cloudrun] /v1/limits/consume/message failed', safeErr(e));
    const status = e?.status || 500;
    res.status(status).json({ ok: false, error: 'request_failed', message: e?.message || 'unknown' });
  }
});

app.post('/v1/limits/consume/garden', async (req: express.Request, res: express.Response) => {
  try {
    const uid = await requireUid(req);
    const deviceId = extractDeviceId(req) || uid;
    const r = await consumeDeviceGardenTicket(deviceId, uid, LIMITS_CFG);
    if (!r.ok) {
      res.status(402).json({
        ok: false,
        error: 'free_limit_reached',
        reason: r.reason,
        deviceId,
        limits: {
          freeMessages: LIMITS_CFG.freeMessages,
          freeGardenTickets: LIMITS_CFG.freeGardenTickets,
          cycleDays: LIMITS_CFG.cycleDays,
        },
        snapshot: r.snapshot,
      });
      return;
    }
    res.status(200).json({
      ok: true,
      deviceId,
      limits: {
        freeMessages: LIMITS_CFG.freeMessages,
        freeGardenTickets: LIMITS_CFG.freeGardenTickets,
        cycleDays: LIMITS_CFG.cycleDays,
      },
      snapshot: r.snapshot,
    });
  } catch (e: any) {
    console.error('[seedmind-cloudrun] /v1/limits/consume/garden failed', safeErr(e));
    const status = e?.status || 500;
    res.status(status).json({ ok: false, error: 'request_failed', message: e?.message || 'unknown' });
  }
});

// Restore SeedMind snapshots (Cloud -> Local).
// This is used as a fallback when Firestore client reads are blocked (e.g. overly-strict rules).
app.get('/v1/sync/snapshots', async (req: express.Request, res: express.Response) => {
  try {
    const uid = await requireUid(req);

    const rl = await enforceUidRateLimit(uid, { perMinute: RATE_PER_MINUTE, perDay: RATE_PER_DAY });
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      res.status(429).json({
        error: 'rate_limited',
        scope: rl.scope,
        retryAfterSeconds: rl.retryAfterSeconds,
      });
      return;
    }

    const db = admin.firestore();
    const syncDocIds = [
      'chatSnapshot',
      'activeChatId',
      'gardenSeedsSnapshot',
      'meditationHistorySnapshot',
      'soundSettings',
      'harvestStories',
      'voicePreference',
      'firstSeedlingNotified',
      'bloomNotifiedSeeds',
      'conversationStyle',
      'completedConversationsCount',
    ];
    const statsDocIds = ['meditation'];

    const syncRefs = syncDocIds.map((id) => db.doc(`users/${uid}/sync/${id}`));
    const statsRefs = statsDocIds.map((id) => db.doc(`users/${uid}/stats/${id}`));

    const [syncSnaps, statsSnaps] = await Promise.all([
      db.getAll(...syncRefs),
      db.getAll(...statsRefs),
    ]);

    const sync: Record<string, any> = {};
    for (const s of syncSnaps) {
      if (!s.exists) continue;
      sync[s.id] = s.data();
    }

    const stats: Record<string, any> = {};
    for (const s of statsSnaps) {
      if (!s.exists) continue;
      stats[s.id] = s.data();
    }

    res.status(200).json({ ok: true, sync, stats });
  } catch (e: any) {
    // Log full error for debugging 500s (request logs alone don't show the underlying exception).
    console.error('[seedmind-cloudrun] /v1/sync/snapshots failed', safeErr(e));
    const status = e?.status || 500;
    res.status(status).json({ error: 'request_failed', message: e?.message || 'unknown' });
  }
});



// INTERNAL: admin-only snapshot fetch by uid (for debugging recovery).
// Protected by a long random token passed via Secret Manager.
app.get('/internal/v1/sync/snapshots', async (req: express.Request, res: express.Response) => {
  try {
    if (!ADMIN_INTERNAL_TOKEN) {
      res.status(503).json({ error: 'internal_not_configured' });
      return;
    }
    const token = String(req.header('x-seedmind-admin') || '').trim();
    if (!token || token !== ADMIN_INTERNAL_TOKEN) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const uid = String(req.query.uid || '').trim();
    if (!uid) {
      res.status(400).json({ error: 'missing_uid' });
      return;
    }

    const db = admin.firestore();
    const syncDocIds = [
      'chatSnapshot',
      'activeChatId',
      'gardenSeedsSnapshot',
      'meditationHistorySnapshot',
      'soundSettings',
      'harvestStories',
      'voicePreference',
      'firstSeedlingNotified',
      'bloomNotifiedSeeds',
      'conversationStyle',
      'completedConversationsCount',
    ];
    const statsDocIds = ['meditation'];
    const syncRefs = syncDocIds.map((id) => db.doc(`users/${uid}/sync/${id}`));
    const statsRefs = statsDocIds.map((id) => db.doc(`users/${uid}/stats/${id}`));
    const [syncSnaps, statsSnaps] = await Promise.all([db.getAll(...syncRefs), db.getAll(...statsRefs)]);

    const sync: Record<string, any> = {};
    for (const s of syncSnaps) {
      if (!s.exists) continue;
      sync[s.id] = s.data();
    }

    const stats: Record<string, any> = {};
    for (const s of statsSnaps) {
      if (!s.exists) continue;
      stats[s.id] = s.data();
    }

    
    // Legacy: older builds stored per-conversation docs in a subcollection.
    let legacyConversationsSampleIds: string[] = [];
    let legacyConversationsSampleCount = 0;
    let legacyConversationsHasMore = false;
    try {
      const legacySnap = await db.collection(`users/${uid}/conversations`).orderBy('updatedAt', 'desc').limit(25).get();
      legacyConversationsSampleCount = legacySnap.size;
      legacyConversationsHasMore = legacySnap.size >= 25;
      legacyConversationsSampleIds = legacySnap.docs.slice(0, 5).map((d) => d.id);
    } catch {
      // ignore
    }

    res.status(200).json({
      ok: true,
      uid,
      sync,
      stats,
      legacyConversationsSampleCount,
      legacyConversationsHasMore,
      legacyConversationsSampleIds,
    });

  } catch (e: any) {
    console.error('[seedmind-cloudrun] /internal/v1/sync/snapshots failed', safeErr(e));
    res.status(500).json({ error: 'request_failed', message: e?.message || 'unknown' });
  }
});


// INTERNAL: fetch one legacy conversation doc by id.
app.get('/internal/v1/legacy/conversation', async (req: express.Request, res: express.Response) => {
  try {
    if (!ADMIN_INTERNAL_TOKEN) {
      res.status(503).json({ error: 'internal_not_configured' });
      return;
    }
    const token = String(req.header('x-seedmind-admin') || '').trim();
    if (!token || token !== ADMIN_INTERNAL_TOKEN) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const uid = String(req.query.uid || '').trim();
    const id = String(req.query.id || '').trim();
    if (!uid || !id) {
      res.status(400).json({ error: 'missing_uid_or_id' });
      return;
    }

    const db = admin.firestore();
    const ref = db.doc(`users/${uid}/conversations/${id}`);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    res.status(200).json({ ok: true, uid, id, data: snap.data() });
  } catch (e: any) {
    console.error('[seedmind-cloudrun] /internal/v1/legacy/conversation failed', safeErr(e));
    res.status(500).json({ error: 'request_failed', message: e?.message || 'unknown' });
  }
});
// Proxy DeepSeek chat completions (supports SSE streaming when stream=true).
app.post('/v1/chat/completions', async (req: express.Request, res: express.Response) => {
  const abort = new AbortController();
  // IMPORTANT: don't abort upstream fetch just because the request finished uploading.
  // Abort only when the client actually disconnects.
  req.on('aborted', () => abort.abort());
  res.on('close', () => abort.abort());

  try {
    const uid = await requireUid(req);
    const deviceId = extractDeviceId(req) || uid;
    const consumeMessage = String(req.header('x-seedmind-consume-message') || '').trim() === '1';

    const rl = await enforceUidRateLimit(uid, { perMinute: RATE_PER_MINUTE, perDay: RATE_PER_DAY });
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      res.status(429).json({
        error: 'rate_limited',
        scope: rl.scope,
        retryAfterSeconds: rl.retryAfterSeconds,
      });
      return;
    }

    const body = req.body || {};
    const wantsStream = !!body.stream;

    // Enforce device-scoped free message limits before calling DeepSeek.
    // This prevents uninstall/reinstall bypass and any client-side counter resets.
    if (consumeMessage) {
      try {
        const r = await consumeDeviceMessage(deviceId, uid, LIMITS_CFG);
        if (!r.ok) {
          // If the client requested streaming, return an SSE-shaped response so the UI still works.
          if (wantsStream) {
            res.status(200);
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders?.();
            const msg =
              `You’ve reached the free message limit for this cycle. Please upgrade to continue.`;
            res.write(
              `data: ${JSON.stringify({
                choices: [{ delta: { content: msg } }],
                seedmind: {
                  error: 'free_limit_reached',
                  reason: r.reason,
                  deviceId,
                  snapshot: r.snapshot,
                  limits: {
                    freeMessages: LIMITS_CFG.freeMessages,
                    freeGardenTickets: LIMITS_CFG.freeGardenTickets,
                    cycleDays: LIMITS_CFG.cycleDays,
                  },
                },
              })}\n\n`
            );
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }

          res.status(402).json({
            ok: false,
            error: 'free_limit_reached',
            reason: r.reason,
            deviceId,
            limits: {
              freeMessages: LIMITS_CFG.freeMessages,
              freeGardenTickets: LIMITS_CFG.freeGardenTickets,
              cycleDays: LIMITS_CFG.cycleDays,
            },
            snapshot: r.snapshot,
          });
          return;
        }
      } catch (e: any) {
        // If limiter fails, fail open so chat doesn't break.
        console.error('[seedmind-cloudrun] consumeDeviceMessage failed (fail open)', safeErr(e));
      }
    }

    let upstream: Response;
    try {
      upstream = await fetch(DEEPSEEK_UPSTREAM_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: wantsStream ? 'text/event-stream' : 'application/json',
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
    } catch (e: any) {
      console.error('[seedmind-cloudrun] upstream fetch failed', safeErr(e));
      res.status(502).json({ error: 'upstream_unreachable', message: e?.message || 'upstream fetch failed' });
      return;
    }

    // Forward status errors as JSON.
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      console.error('[seedmind-cloudrun] upstream not ok', {
        status: upstream.status,
        body: text?.slice?.(0, 800),
      });
      res.status(upstream.status).json({ error: 'upstream_error', status: upstream.status, body: text });
      return;
    }

    if (wantsStream) {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      if (!upstream.body) {
        res.end();
        return;
      }

      // Pipe the upstream SSE bytes as-is so the mobile EventSource sees the same framing.
      // Some Node runtimes can throw on fromWeb; fall back to raw text passthrough.
      let nodeStream: any;
      try {
        nodeStream = Readable.fromWeb(upstream.body as any);
      } catch (e: any) {
        console.error('[seedmind-cloudrun] Readable.fromWeb failed', safeErr(e));
        const text = await upstream.text().catch(() => '');
        res.write(text);
        res.end();
        return;
      }

      nodeStream.on('data', (chunk: any) => {
        try {
          res.write(chunk);
        } catch {
          // client disconnected
          abort.abort();
        }
      });
      nodeStream.on('end', () => res.end());
      nodeStream.on('error', (e: any) => {
        console.error('[seedmind-cloudrun] upstream stream error', safeErr(e));
        // If upstream stream errors mid-way, end gracefully.
        try {
          res.end();
        } catch {}
      });
      return;
    }

    // Non-streaming JSON pass-through.
    let json: any;
    try {
      json = await upstream.json();
    } catch (e: any) {
      const text = await upstream.text().catch(() => '');
      console.error('[seedmind-cloudrun] upstream json parse failed', { err: safeErr(e), body: text?.slice?.(0, 800) });
      res.status(502).json({ error: 'upstream_invalid_json', body: text });
      return;
    }
    res.status(200).json(json);
  } catch (e: any) {
    console.error('[seedmind-cloudrun] /v1/chat/completions failed', safeErr(e));
    const status = e?.status || 500;
    res.status(status).json({ error: 'request_failed', message: e?.message || 'unknown' });
  }
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[seedmind-cloudrun] listening on :${PORT}`);
});

