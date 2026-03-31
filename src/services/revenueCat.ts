import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, LOG_LEVEL, PurchasesOffering, PurchasesOfferings } from 'react-native-purchases';

type RevenueCatExtra = {
  revenueCat?: {
    appleApiKey?: string;
    googleApiKey?: string;
    entitlementId?: string;
  };
};

function getExtra(): RevenueCatExtra {
  const extra =
    (Constants.expoConfig?.extra as RevenueCatExtra | undefined) ??
    // Legacy Expo manifests
    ((Constants as any).manifest?.extra as RevenueCatExtra | undefined) ??
    // Some Expo Go/dev-client shapes
    ((Constants as any).manifest2?.extra?.expoClient?.extra as RevenueCatExtra | undefined) ??
    {};
  return extra;
}

function getApiKeyForPlatform(): string {
  const rc = getExtra().revenueCat ?? {};
  if (Platform.OS === 'ios') return typeof rc.appleApiKey === 'string' ? rc.appleApiKey.trim() : '';
  if (Platform.OS === 'android') return typeof rc.googleApiKey === 'string' ? rc.googleApiKey.trim() : '';
  return '';
}

export function getRevenueCatEntitlementId(): string {
  const rc = getExtra().revenueCat ?? {};
  return typeof rc.entitlementId === 'string' ? rc.entitlementId.trim() : '';
}

let initPromise: Promise<void> | null = null;
let listenerAttached = false;
let cachedCustomerInfo: CustomerInfo | null = null;
let cachedIsPremium: boolean | null = null;
let currentAppUserId: string | null = null;
const RC_DEVICE_ID_CACHE_KEY = 'seedmind_rc_device_id_v1';

function isAnonymousAppUserId(id: string | null | undefined): boolean {
  if (!id) return true;
  // RevenueCat anonymous IDs typically look like "$RCAnonymousID:xxxxxxxx".
  // Treat anything with that prefix as anonymous.
  return id.startsWith('$RCAnonymousID:');
}

function computeIsPremium(info: CustomerInfo | null): boolean {
  if (!info) return false;
  const entId = getRevenueCatEntitlementId();
  const active = (info.entitlements?.active ?? {}) as Record<string, unknown>;

  if (entId && active[entId]) return true;
  // Safe fallback: if any entitlement is active, treat as premium.
  // (If you add multiple entitlements later, tighten this to a specific id.)
  return Object.keys(active).length > 0;
}

/**
 * Push CustomerInfo from restore/purchase into our JS cache immediately.
 * Avoids a race where getCustomerInfo() / refresh still briefly reflect pre-transaction state.
 */
export function applyCustomerInfoFromSdk(info: CustomerInfo | null | undefined): void {
  if (!info) return;
  cachedCustomerInfo = info;
  cachedIsPremium = computeIsPremium(info);
  void Purchases.getAppUserID()
    .then((id) => {
      currentAppUserId = id;
    })
    .catch(() => {});
  const d = String(info.originalAppUserId ?? '').trim();
  if (d) AsyncStorage.setItem(RC_DEVICE_ID_CACHE_KEY, d).catch(() => {});
}

export async function initRevenueCat(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const apiKey = getApiKeyForPlatform();
    if (!apiKey) {
      console.warn('[revenuecat] Missing API key for platform', Platform.OS);
      return;
    }

    try {
      // Keep RevenueCat logs quiet to avoid LogBox noise in dev.
      // You can temporarily change this to DEBUG when troubleshooting.
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.WARN : LOG_LEVEL.ERROR);
      if (__DEV__) {
        // Prevent specific noisy SDK logs from showing as red LogBox errors.
        Purchases.setLogHandler((level, message) => {
          const msg = String(message || '');
          if (
            msg.includes('OfferingsManager') ||
            msg.includes('Error fetching offerings') ||
            msg.includes('OfferingsManager.Error')
          ) {
            return;
          }
          // Never use console.error here to avoid LogBox "Console Error" overlays.
          // Keep everything as warn/log.
          if (level === LOG_LEVEL.ERROR) console.warn(msg);
          else if (level === LOG_LEVEL.WARN) console.warn(msg);
          else console.log(msg);
        });
      }
    } catch {
      // ignore
    }

    // Reduce "premium sharing" across multiple in-app accounts on the same device.
    // Note: this setting has moved to RevenueCat dashboard for newer SDKs, but some
    // react-native-purchases builds still expose it. Guarded to avoid runtime errors.
    try {
      const fn = (Purchases as any)?.setAllowSharingAppStoreAccount;
      if (typeof fn === 'function') fn(false);
    } catch {
      // ignore
    }

    await Purchases.configure({ apiKey });

    if (!listenerAttached) {
      listenerAttached = true;
      Purchases.addCustomerInfoUpdateListener((info) => {
        cachedCustomerInfo = info;
        cachedIsPremium = computeIsPremium(info);
        void Purchases.getAppUserID()
          .then((id) => {
            currentAppUserId = id;
          })
          .catch(() => {});
      });
    }

    try {
      const info = await Purchases.getCustomerInfo();
      cachedCustomerInfo = info;
      cachedIsPremium = computeIsPremium(info);
      try {
        currentAppUserId = await Purchases.getAppUserID();
      } catch {
        currentAppUserId = info.originalAppUserId ?? null;
      }
    } catch (e) {
      console.warn('[revenuecat] getCustomerInfo failed', e);
    }
  })();

  return initPromise;
}

export async function setRevenueCatUser(uid: string | null): Promise<void> {
  await initRevenueCat();
  const apiKey = getApiKeyForPlatform();
  if (!apiKey) return;

  try {
    if (uid) {
      // Compare to RC's current App User ID, not originalAppUserId (first id can stay $RCAnonymousID after merge).
      try {
        const rcCurrent = await Purchases.getAppUserID();
        if (rcCurrent === uid) return;
      } catch {
        if (currentAppUserId === uid) return;
      }
      const result = await Purchases.logIn(uid);
      cachedCustomerInfo = result.customerInfo;
      cachedIsPremium = computeIsPremium(result.customerInfo);
      try {
        currentAppUserId = await Purchases.getAppUserID();
      } catch {
        currentAppUserId = uid;
      }
      const d = String(result.customerInfo.originalAppUserId ?? '').trim();
      if (d) AsyncStorage.setItem(RC_DEVICE_ID_CACHE_KEY, d).catch(() => {});
    } else {
      // Only log out if we're currently identified (non-anonymous).
      // Calling logOut while already anonymous triggers noisy SDK logs.
      if (isAnonymousAppUserId(currentAppUserId)) return;

      const info = await Purchases.logOut();
      cachedCustomerInfo = info;
      cachedIsPremium = computeIsPremium(info);
      try {
        currentAppUserId = await Purchases.getAppUserID();
      } catch {
        currentAppUserId = info.originalAppUserId ?? null;
      }
      const d = String(info.originalAppUserId ?? '').trim();
      if (d) AsyncStorage.setItem(RC_DEVICE_ID_CACHE_KEY, d).catch(() => {});
    }
  } catch (e) {
    console.warn('[revenuecat] set user failed', e);
  }
}

export async function getRevenueCatCustomerInfo(): Promise<CustomerInfo | null> {
  await initRevenueCat();
  const apiKey = getApiKeyForPlatform();
  if (!apiKey) return null;

  if (cachedCustomerInfo) return cachedCustomerInfo;
  try {
    const info = await Purchases.getCustomerInfo();
    cachedCustomerInfo = info;
    cachedIsPremium = computeIsPremium(info);
    try {
      currentAppUserId = await Purchases.getAppUserID();
    } catch {
      currentAppUserId = info.originalAppUserId ?? currentAppUserId;
    }
    const d = String(info.originalAppUserId ?? '').trim();
    if (d) AsyncStorage.setItem(RC_DEVICE_ID_CACHE_KEY, d).catch(() => {});
    return info;
  } catch (e) {
    console.warn('[revenuecat] getCustomerInfo failed', e);
    return null;
  }
}

// Stable per-device identifier (stored by RevenueCat in Keychain on iOS).
// This survives uninstall/reinstall and is appropriate for device-scoped free limits.
export async function getRevenueCatDeviceId(): Promise<string | null> {
  try {
    const cached = await AsyncStorage.getItem(RC_DEVICE_ID_CACHE_KEY);
    const c = String(cached || '').trim();
    if (c) return c;
    const info = await getRevenueCatCustomerInfo();
    const id = (info as any)?.originalAppUserId ?? null;
    const s = String(id || '').trim();
    if (!s) return null;
    AsyncStorage.setItem(RC_DEVICE_ID_CACHE_KEY, s).catch(() => {});
    return s;
  } catch {
    return null;
  }
}

export async function refreshRevenueCatCaches(): Promise<void> {
  await initRevenueCat();
  const apiKey = getApiKeyForPlatform();
  if (!apiKey) return;

  cachedCustomerInfo = null;
  cachedIsPremium = null;
  try {
    await Purchases.invalidateCustomerInfoCache();
  } catch {
    // ignore
  }

  try {
    const info = await Purchases.getCustomerInfo();
    cachedCustomerInfo = info;
    cachedIsPremium = computeIsPremium(info);
    try {
      currentAppUserId = await Purchases.getAppUserID();
    } catch {
      currentAppUserId = info.originalAppUserId ?? currentAppUserId;
    }
  } catch (e) {
    console.warn('[revenuecat] refresh failed', e);
  }
}

export async function isRevenueCatPremium(): Promise<boolean> {
  await initRevenueCat();
  const apiKey = getApiKeyForPlatform();
  if (!apiKey) return false;

  if (cachedIsPremium !== null) return cachedIsPremium;
  const info = await getRevenueCatCustomerInfo();
  return computeIsPremium(info);
}

// Strict "Option C" helper: Premium for the current SeedMind (Firebase) uid.
// RevenueCat's originalAppUserId is the *first* id (often $RCAnonymousID after an anonymous purchase + logIn merge).
// The current identified user is Purchases.getAppUserID() — that must match Firebase uid.
export async function isRevenueCatPremiumForUid(uid: string | null): Promise<boolean> {
  if (!uid) return false;
  const info = await getRevenueCatCustomerInfo();
  if (!computeIsPremium(info)) return false;
  try {
    const rcUid = await Purchases.getAppUserID();
    if (rcUid === uid) return true;
  } catch {
    // fall through
  }
  const owner = (info as CustomerInfo)?.originalAppUserId ?? null;
  return owner === uid;
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  await initRevenueCat();
  const apiKey = getApiKeyForPlatform();
  if (!apiKey) return null;

  try {
    const offerings: PurchasesOfferings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (e) {
    console.warn('[revenuecat] getOfferings failed', e);
    return null;
  }
}

