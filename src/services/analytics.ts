import analytics from '@react-native-firebase/analytics';

// Privacy-first analytics:
// - Never send user email, chat text, or other PII.
// - Keep string params short (Firebase has limits).
// - Prefer buckets + IDs.

type ParamValue = string | number | boolean | null | undefined;
type Params = Record<string, ParamValue>;

function clampString(v: string, max = 80): string {
  const s = v.trim();
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function sanitizeParams(params?: Params): Record<string, string | number> | undefined {
  if (!params) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'boolean') {
      out[k] = v ? 1 : 0;
      continue;
    }
    if (typeof v === 'number') {
      out[k] = Number.isFinite(v) ? v : 0;
      continue;
    }
    // strings
    out[k] = clampString(v);
  }
  return Object.keys(out).length ? out : undefined;
}

export function bucketTextLength(text: string): string {
  const n = (text || '').length;
  if (n <= 0) return '0';
  if (n <= 20) return '1-20';
  if (n <= 50) return '21-50';
  if (n <= 100) return '51-100';
  if (n <= 200) return '101-200';
  return '200+';
}

export async function analyticsSetUserId(uid: string | null): Promise<void> {
  try {
    await analytics().setUserId(uid);
  } catch (e) {
    console.warn('[analytics] setUserId failed', e);
  }
}

export async function analyticsSetUserProperties(props: Params): Promise<void> {
  try {
    const sanitized = sanitizeParams(props);
    if (!sanitized) return;
    // Firebase expects string values for user properties.
    const asString: Record<string, string> = {};
    for (const [k, v] of Object.entries(sanitized)) asString[k] = String(v);
    await analytics().setUserProperties(asString);
  } catch (e) {
    console.warn('[analytics] setUserProperties failed', e);
  }
}

export async function trackEvent(name: string, params?: Params): Promise<void> {
  try {
    await analytics().logEvent(name, sanitizeParams(params));
  } catch (e) {
    console.warn('[analytics] logEvent failed', name, e);
  }
}

export async function trackScreen(screenName: string, params?: Params): Promise<void> {
  try {
    const sanitized = sanitizeParams(params);
    await analytics().logScreenView({
      screen_name: clampString(screenName, 80),
      screen_class: clampString(screenName, 80),
      ...(sanitized ?? {}),
    } as any);
  } catch (e) {
    console.warn('[analytics] logScreenView failed', screenName, e);
  }
}

