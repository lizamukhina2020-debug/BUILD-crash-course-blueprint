import AsyncStorage from '@react-native-async-storage/async-storage';

// ===================
// STORAGE KEYS
// ===================

const ONBOARDING_KEYS = {
  HAS_COMPLETED: 'seedmind_onboarding_completed',
  SELECTED_CATEGORIES: 'seedmind_onboarding_categories',
  INITIAL_MOOD: 'seedmind_onboarding_mood',
  ONBOARDING_DATE: 'seedmind_onboarding_date',
};

const ONBOARDING_UID_COMPLETED_PREFIX = 'seedmind_onboarding_completed_uid_v1_';

const getUidCompletedKey = (uid: string) => `${ONBOARDING_UID_COMPLETED_PREFIX}${uid}`;

// When the user completes onboarding while signed out, then immediately authenticates,
// we should not show onboarding a second time after auth.
const POST_ONBOARDING_AUTH_TS_KEY = 'seedmind_post_onboarding_auth_ts_v1';
const POST_ONBOARDING_AUTH_WINDOW_MS = 10 * 60 * 1000;

// Track whether we've ever seen this Firebase uid on this device.
// Used to prevent onboarding replay for returning users.
const SEEN_UID_PREFIX = 'seedmind_seen_uid_v1_';
const getSeenUidKey = (uid: string) => `${SEEN_UID_PREFIX}${uid}`;

export async function hasSeenUid(uid: string): Promise<boolean> {
  const trimmed = (uid ?? '').trim();
  if (!trimmed) return false;
  try {
    const v = await AsyncStorage.getItem(getSeenUidKey(trimmed));
    return v === 'true';
  } catch {
    return false;
  }
}

export async function markSeenUid(uid: string): Promise<void> {
  const trimmed = (uid ?? '').trim();
  if (!trimmed) return;
  try {
    await AsyncStorage.setItem(getSeenUidKey(trimmed), 'true');
  } catch {
    // ignore
  }
}

export async function wasOnboardingCompletedRecently(windowMs: number = 30 * 60 * 1000): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_KEYS.ONBOARDING_DATE);
    const ts = raw ? Date.parse(raw) : NaN;
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts <= windowMs;
  } catch {
    return false;
  }
}

// ===================
// TYPES
// ===================

export type OnboardingCategory = 
  | 'money' 
  | 'love' 
  | 'career' 
  | 'peace' 
  | 'health' 
  | 'curious';

export type OnboardingMood = 1 | 2 | 3 | 4 | 5;

export interface OnboardingData {
  hasCompleted: boolean;
  selectedCategories: OnboardingCategory[];
  initialMood: OnboardingMood | null;
  completedAt: string | null;
}

// ===================
// DEVELOPER BYPASS
// ===================

// 🛠️ SET TO true TO SKIP ONBOARDING DURING DEVELOPMENT
// ⚠️ REMEMBER TO SET TO false BEFORE PUBLISHING!
export const DEV_SKIP_ONBOARDING = false;

// ===================
// FUNCTIONS
// ===================

// Check if user has completed onboarding
export const hasCompletedOnboarding = async (): Promise<boolean> => {
  // Developer bypass
  if (DEV_SKIP_ONBOARDING) {
    return true;
  }
  
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_KEYS.HAS_COMPLETED);
    return value === 'true';
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    return false;
  }
};

// Check if a specific Firebase user (uid) has completed onboarding on this device.
export const hasCompletedOnboardingForUid = async (uid: string): Promise<boolean> => {
  if (DEV_SKIP_ONBOARDING) return true;
  const trimmed = (uid ?? '').trim();
  if (!trimmed) return false;
  try {
    const v = await AsyncStorage.getItem(getUidCompletedKey(trimmed));
    return v === 'true';
  } catch {
    return false;
  }
};

export const markOnboardingCompletedForUid = async (uid: string): Promise<void> => {
  const trimmed = (uid ?? '').trim();
  if (!trimmed) return;
  try {
    await AsyncStorage.setItem(getUidCompletedKey(trimmed), 'true');
  } catch {
    // ignore
  }
};

// Mark onboarding as completed
export const completeOnboarding = async (
  categories: OnboardingCategory[],
  mood: OnboardingMood | null,
  uid?: string
): Promise<void> => {
  try {
    await AsyncStorage.multiSet([
      [ONBOARDING_KEYS.HAS_COMPLETED, 'true'],
      [ONBOARDING_KEYS.SELECTED_CATEGORIES, JSON.stringify(categories)],
      [ONBOARDING_KEYS.INITIAL_MOOD, mood ? mood.toString() : ''],
      [ONBOARDING_KEYS.ONBOARDING_DATE, new Date().toISOString()],
    ]);
    if (uid) {
      await AsyncStorage.setItem(getUidCompletedKey(uid.trim()), 'true');
    }
  } catch (error) {
    console.error('Error completing onboarding:', error);
  }
};

export async function setPostOnboardingAuthInProgress(): Promise<void> {
  try {
    await AsyncStorage.setItem(POST_ONBOARDING_AUTH_TS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export async function wasPostOnboardingAuthRecentlyStarted(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(POST_ONBOARDING_AUTH_TS_KEY);
    const ts = raw ? Number(raw) : NaN;
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts <= POST_ONBOARDING_AUTH_WINDOW_MS;
  } catch {
    return false;
  }
}

export async function clearPostOnboardingAuthInProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(POST_ONBOARDING_AUTH_TS_KEY);
  } catch {
    // ignore
  }
}

// Get user's selected categories
export const getOnboardingCategories = async (): Promise<OnboardingCategory[]> => {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_KEYS.SELECTED_CATEGORIES);
    if (value) {
      return JSON.parse(value);
    }
    return [];
  } catch (error) {
    console.error('Error getting onboarding categories:', error);
    return [];
  }
};

// Get user's initial mood
export const getOnboardingMood = async (): Promise<OnboardingMood | null> => {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_KEYS.INITIAL_MOOD);
    if (value) {
      return parseInt(value, 10) as OnboardingMood;
    }
    return null;
  } catch (error) {
    console.error('Error getting onboarding mood:', error);
    return null;
  }
};

// Get all onboarding data
export const getOnboardingData = async (): Promise<OnboardingData> => {
  try {
    const [completed, categories, mood, date] = await AsyncStorage.multiGet([
      ONBOARDING_KEYS.HAS_COMPLETED,
      ONBOARDING_KEYS.SELECTED_CATEGORIES,
      ONBOARDING_KEYS.INITIAL_MOOD,
      ONBOARDING_KEYS.ONBOARDING_DATE,
    ]);
    
    return {
      hasCompleted: completed[1] === 'true',
      selectedCategories: categories[1] ? JSON.parse(categories[1]) : [],
      initialMood: mood[1] ? parseInt(mood[1], 10) as OnboardingMood : null,
      completedAt: date[1] || null,
    };
  } catch (error) {
    console.error('Error getting onboarding data:', error);
    return {
      hasCompleted: false,
      selectedCategories: [],
      initialMood: null,
      completedAt: null,
    };
  }
};

// Reset onboarding (for testing or "replay" feature)
export const resetOnboarding = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      ONBOARDING_KEYS.HAS_COMPLETED,
      ONBOARDING_KEYS.SELECTED_CATEGORIES,
      ONBOARDING_KEYS.INITIAL_MOOD,
      ONBOARDING_KEYS.ONBOARDING_DATE,
    ]);
  } catch (error) {
    console.error('Error resetting onboarding:', error);
  }
};














