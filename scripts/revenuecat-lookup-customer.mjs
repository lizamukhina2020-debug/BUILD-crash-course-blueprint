#!/usr/bin/env node
/**
 * Look up a RevenueCat customer by App User ID (same string as Firebase UID in SeedMind).
 *
 * Usage:
 *   REVENUECAT_SECRET_API_KEY="sk_..." node scripts/revenuecat-lookup-customer.mjs <app_user_id>
 *
 * Key: RevenueCat Dashboard → Project → API keys → Secret API key (not the Apple public SDK key).
 */

const appUserId = process.argv[2]?.trim();
const secret = process.env.REVENUECAT_SECRET_API_KEY?.trim();

if (!appUserId) {
  console.error('Usage: REVENUECAT_SECRET_API_KEY=sk_... node scripts/revenuecat-lookup-customer.mjs <app_user_id>');
  process.exit(1);
}
if (!secret) {
  console.error('Missing REVENUECAT_SECRET_API_KEY in environment.');
  process.exit(1);
}

const path = `/v1/subscribers/${encodeURIComponent(appUserId)}`;
const url = `https://api.revenuecat.com${path}`;

const res = await fetch(url, {
  headers: {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  },
});

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = text;
}

if (!res.ok) {
  console.error(`HTTP ${res.status}`, body);
  process.exit(1);
}

const sub = body?.subscriber ?? body;
const ents = sub?.entitlements ?? {};
console.log(JSON.stringify({ app_user_id: appUserId, subscriber: sub }, null, 2));

const active = Object.entries(ents).filter(([, v]) => v?.expires_date === null || new Date(v?.expires_date) > new Date());
if (active.length) {
  console.log('\nActive-looking entitlements:', active.map(([k]) => k).join(', ') || '(none parsed)');
} else {
  console.log('\nNo entitlements parsed as active (check raw subscriber.entitlements above).');
}
