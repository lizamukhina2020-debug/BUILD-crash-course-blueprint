import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentLanguage } from '../i18n';
import { translatePlainText } from './deepseekApi';
import { allowEmptySnapshotSyncForKeyForMs, scheduleSnapshotSync } from './cloudSync';
import { trackEvent } from './analytics';

// Keys for storage
const STORAGE_KEYS = {
  PENDING_MEDITATION: 'seedmind_pending_meditation',
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
};

// ===================
// TYPES
// ===================

export interface LoggedSeed {
  id: string;
  action: string;
  whoHelped: string;
}

export interface PendingMeditation {
  seeds: LoggedSeed[];
  category: string;
  recommendedMeditationId: string;
  conversationId?: string;
  seedIds?: string[];
  createdAt: string;
  completed: boolean;
  completedAt?: string;
  completedWateredSeedIds?: string[];
  /** Total seeds the user selected in the post-meditation picker (may exceed overlap with pending seed ids). */
  completedWateredCount?: number;
}

export interface MeditationHistoryEntry {
  id: string;
  date: string;
  seedCount: number;
  category: string;
  meditationId: string;
  seeds: LoggedSeed[];
}

// Growth stages for seeds
export type GrowthStage = 'seed' | 'sprout' | 'seedling' | 'blooming' | 'harvested';

export type SupportedLocale = 'en' | 'ru';
export type LocalizedTextMap = Partial<Record<SupportedLocale, string>>;

// Garden seed with tracking
export interface GardenSeed {
  id: string;
  action: string;
  category: string;
  conversationId: string; // Links seed to specific conversation/problem
  problemTitle: string;   // User's problem statement (for display)
  datePlanted: string;
  daysWatered: number;
  lastWateredDate: string | null;
  growthStage: GrowthStage;
  harvested: boolean;
  harvestedDate: string | null;

  // Optional per-locale cached copies so Garden can switch languages for stored text
  sourceLocale?: SupportedLocale;
  actionByLocale?: LocalizedTextMap;
  problemTitleByLocale?: LocalizedTextMap;
}

// Garden statistics
export interface GardenStats {
  totalSeeds: number;
  seedsThisWeek: number;
  seedsThisMonth: number;
  currentStreak: number;
  longestStreak: number;
  harvestedCount: number;
  seedsByCategory: Record<string, number>;
  seedsByStage: Record<GrowthStage, number>;
}

// Streak tracking
export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastMeditationDate: string | null;
}

// Harvest story/reflection
export type HarvestEmotion = 'grateful' | 'moved' | 'amazed' | 'blessed' | 'transformed' | 'relieved' | 'joyful';

export interface HarvestStory {
  id: string;
  category: string;
  conversationId: string; // Links to specific conversation/problem
  problemTitle: string;   // User's problem statement
  story: string | null;
  emotion: HarvestEmotion | null;
  seedsContributed: number;
  harvestedDate: string;
}

export const HARVEST_EMOTIONS: { key: HarvestEmotion; emoji: string; label: string }[] = [
  { key: 'grateful', emoji: '😊', label: 'Grateful' },
  { key: 'moved', emoji: '🥹', label: 'Moved' },
  { key: 'amazed', emoji: '🤯', label: 'Amazed' },
  { key: 'blessed', emoji: '🙏', label: 'Blessed' },
  { key: 'transformed', emoji: '✨', label: 'Transformed' },
  { key: 'relieved', emoji: '😌', label: 'Relieved' },
  { key: 'joyful', emoji: '🎉', label: 'Joyful' },
];

// ===================
// CONSTANTS
// ===================

// Map chat categories to meditation IDs
export const CATEGORY_TO_MEDITATION: Record<string, string> = {
  money: '1',        // Planting Seeds of Abundance
  loneliness: '2',   // The Mirror of Love
  relationship: '2', // The Mirror of Love
  career: '4',       // Daily Gratitude Brew
  health: '3',       // Seeds of Vitality
  general: '4',      // Daily Gratitude Brew (default)
  peace: '4',        // Daily Gratitude Brew
  clarity: '5',      // Clarity Through Giving
  safety: '4',       // Daily Gratitude Brew (for war/crisis topics)
};

// Category display names
export const CATEGORY_NAMES: Record<string, string> = {
  money: 'Abundance',
  loneliness: 'Connection',
  relationship: 'Love',
  career: 'Career',
  health: 'Health',
  general: 'Growth',
  peace: 'Peace',
  clarity: 'Clarity',
  safety: 'Safety',
};

// Category emojis
export const CATEGORY_EMOJIS: Record<string, string> = {
  money: '💰',
  loneliness: '💝',
  relationship: '❤️',
  career: '⭐',
  health: '🌿',
  general: '🎯',
  peace: '🧘',
  clarity: '🔮',
  safety: '🕊️',
};

// Growth stage emojis
export const GROWTH_STAGE_EMOJIS: Record<GrowthStage, string> = {
  seed: '🌰',
  sprout: '🌱',
  seedling: '🪴',
  blooming: '🌸',
  harvested: '✨',
};

// Growth stage labels
export const GROWTH_STAGE_LABELS: Record<GrowthStage, string> = {
  seed: 'Seed',
  sprout: 'Sprout',
  seedling: 'Seedling',
  blooming: 'Blooming',
  harvested: 'Harvested',
};

// ===================
// HELPER FUNCTIONS
// ===================

const normalizeLocale = (lang: string | undefined | null): SupportedLocale =>
  lang === 'ru' ? 'ru' : 'en';

const likelyRussian = (text: string): boolean => /[А-Яа-яЁё]/.test(text || '');

const inferLocaleFromSeed = (seed: Pick<GardenSeed, 'action' | 'problemTitle'>): SupportedLocale =>
  likelyRussian(`${seed.problemTitle || ''} ${seed.action || ''}`) ? 'ru' : 'en';

const ensureLocaleMaps = (seed: GardenSeed): GardenSeed => {
  const inferred = seed.sourceLocale || inferLocaleFromSeed(seed);
  const sourceLocale = seed.sourceLocale || inferred;

  const actionByLocale: LocalizedTextMap = seed.actionByLocale || { [sourceLocale]: seed.action };
  const problemTitleByLocale: LocalizedTextMap =
    seed.problemTitleByLocale || { [sourceLocale]: seed.problemTitle };

  return {
    ...seed,
    sourceLocale,
    actionByLocale,
    problemTitleByLocale,
  };
};

const persistGardenSeeds = async (seeds: GardenSeed[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEYS.SEEDS_GARDEN, JSON.stringify(seeds));
  scheduleSnapshotSync('garden:persistGardenSeeds');
};

// Calculate days since a date
const getDaysSince = (dateString: string): number => {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

// Calculate growth stage based on hybrid growth (time + meditation)
// Passive growth: 1 growth point every 2 days automatically
// Active growth: 1 growth point per meditation session
export const calculateGrowthStage = (
  daysWatered: number, 
  harvested: boolean,
  datePlanted?: string
): GrowthStage => {
  if (harvested) return 'harvested';
  
  // Calculate total growth points
  let growthPoints = daysWatered; // Active growth from meditations
  
  // Add passive growth from time (1 point per 2 days)
  if (datePlanted) {
    const daysSincePlanted = getDaysSince(datePlanted);
    const passiveGrowth = Math.floor(daysSincePlanted / 2);
    growthPoints += passiveGrowth;
  }
  
  // Growth stages based on total points
  if (growthPoints >= 7) return 'blooming';
  if (growthPoints >= 3) return 'seedling';
  if (growthPoints >= 1) return 'sprout';
  return 'seed';
};

// Check if two dates are the same day
const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

// Check if date is today
const isToday = (dateString: string): boolean => {
  return isSameDay(new Date(dateString), new Date());
};

// Check if date is within this week
const isThisWeek = (dateString: string): boolean => {
  const date = new Date(dateString);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return date >= weekAgo;
};

// Check if date is within this month
const isThisMonth = (dateString: string): boolean => {
  const date = new Date(dateString);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

// Check if yesterday
const isYesterday = (dateString: string): boolean => {
  const date = new Date(dateString);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
};

// ===================
// PENDING MEDITATION (existing)
// ===================

export const savePendingMeditation = async (
  seeds: LoggedSeed[],
  category: string,
  conversationId?: string
): Promise<void> => {
  try {
    const meditationId = CATEGORY_TO_MEDITATION[category] || CATEGORY_TO_MEDITATION.general;
    const now = new Date().toISOString();

    // If there's already an active pending meditation for THIS conversation,
    // merge seeds instead of overwriting (so counts remain correct when user logs seeds in multiple batches).
    const existingRaw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_MEDITATION);
    const existing: PendingMeditation | null = existingRaw ? JSON.parse(existingRaw) : null;

    let pendingMeditation: PendingMeditation = {
      seeds,
      category,
      recommendedMeditationId: meditationId,
      conversationId,
      seedIds: seeds.map(s => s.id),
      createdAt: now,
      completed: false,
    };

    const shouldMerge =
      !!existing &&
      !existing.completed &&
      !!conversationId &&
      existing.conversationId === conversationId;

    if (shouldMerge) {
      const seedMap = new Map<string, LoggedSeed>();
      (existing.seeds || []).forEach(s => seedMap.set(s.id, s));
      (seeds || []).forEach(s => seedMap.set(s.id, s));

      const mergedSeeds = Array.from(seedMap.values());

      pendingMeditation = {
        ...existing,
        category,
        recommendedMeditationId: meditationId,
        seeds: mergedSeeds,
        seedIds: mergedSeeds.map(s => s.id),
        conversationId,
        // Keep the original createdAt for stability in any UI logic.
        createdAt: existing.createdAt || now,
        completed: false,
      };
    }

    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_MEDITATION, JSON.stringify(pendingMeditation));
    
    // Note: Seeds are now added to garden immediately when logged (in ChatScreen)
    // So we don't add them here to avoid duplicates
    
  } catch (error) {
    console.error('Error saving pending meditation:', error);
  }
};

export const getPendingMeditation = async (): Promise<PendingMeditation | null> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_MEDITATION);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Error getting pending meditation:', error);
    return null;
  }
};

// Mark the pending meditation as actually completed (called from MeditationPlayerScreen)
export const markPendingMeditationComplete = async (
  wateredSeedIds: string[],
  conversationId?: string
): Promise<boolean> => {
  try {
    const pending = await getPendingMeditation();
    if (pending) {
      const pendingSeedIds = pending.seedIds || pending.seeds?.map(s => s.id) || [];
      const wateredSet = new Set(wateredSeedIds || []);
      const overlapped = pendingSeedIds.filter(id => wateredSet.has(id));

      // Only mark completed if we actually watered at least one seed that belongs to the pending set.
      if (overlapped.length === 0) return false;

      pending.completed = true;
      pending.completedAt = new Date().toISOString();
      pending.completedWateredSeedIds = overlapped;
      pending.completedWateredCount = wateredSeedIds.length;
      if (!pending.conversationId && conversationId) {
        pending.conversationId = conversationId;
      }
      await AsyncStorage.setItem(
        STORAGE_KEYS.PENDING_MEDITATION,
        JSON.stringify(pending)
      );
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error marking pending meditation complete:', error);
    return false;
  }
};

export const completeMeditation = async (
  currentConversationId?: string
): Promise<PendingMeditation | null> => {
  try {
    const pending = await getPendingMeditation();
    if (pending) {
      // Only allow completion to be consumed by the conversation that created it.
      if (pending.conversationId && currentConversationId && pending.conversationId !== currentConversationId) {
        return null;
      }
      // NOTE: History, watering, and streak are already handled by MeditationPlayerScreen
      // This function only returns the data (for chat completion message) and clears pending
      
      // Clear pending meditation
      await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_MEDITATION);
      
      return pending;
    }
    return null;
  } catch (error) {
    console.error('Error completing meditation:', error);
    return null;
  }
};

// Add meditation to history (for direct meditation flow from Meditations tab)
export const addMeditationToHistory = async (
  meditationId: string,
  seedIds: string[],
  category: string = 'general'
): Promise<void> => {
  try {
    const historyEntry: MeditationHistoryEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      seedCount: seedIds.length,
      category,
      meditationId,
      seeds: [], // Seeds already exist in garden, just reference by IDs
    };
    
    const historyData = await AsyncStorage.getItem(STORAGE_KEYS.MEDITATION_HISTORY);
    const history: MeditationHistoryEntry[] = historyData ? JSON.parse(historyData) : [];
    history.unshift(historyEntry);
    
    const trimmedHistory = history.slice(0, 100);
    await AsyncStorage.setItem(
      STORAGE_KEYS.MEDITATION_HISTORY,
      JSON.stringify(trimmedHistory)
    );
    scheduleSnapshotSync('meditation:addHistory');
  } catch (error) {
    console.error('Error adding meditation to history:', error);
  }
};

export const getMeditationHistory = async (): Promise<MeditationHistoryEntry[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MEDITATION_HISTORY);
    if (data) {
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error getting meditation history:', error);
    return [];
  }
};

// ===================
// GARDEN SEEDS
// ===================

// Add seeds to garden
export const addSeedsToGarden = async (
  seeds: LoggedSeed[],
  category: string,
  conversationId: string,
  problemTitle: string
): Promise<void> => {
  try {
    const existingSeeds = await getAllGardenSeeds();
    const now = new Date().toISOString();

    const locale = normalizeLocale(getCurrentLanguage());
    
    const newGardenSeeds: GardenSeed[] = seeds.map(seed => ({
      id: seed.id,
      action: seed.action,
      category,
      conversationId,
      problemTitle,
      sourceLocale: locale,
      actionByLocale: { [locale]: seed.action },
      problemTitleByLocale: { [locale]: problemTitle },
      datePlanted: now,
      daysWatered: 0,
      lastWateredDate: null,
      growthStage: 'seed' as GrowthStage,
      harvested: false,
      harvestedDate: null,
    }));
    
    const allSeeds = [...newGardenSeeds, ...existingSeeds];
    await persistGardenSeeds(allSeeds);
    trackEvent('garden_seeds_planted', {
      journey_id: conversationId,
      category,
      count: newGardenSeeds.length,
    }).catch(() => {});
  } catch (error) {
    console.error('Error adding seeds to garden:', error);
  }
};

// Get all seeds from garden
export const getAllGardenSeeds = async (): Promise<GardenSeed[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SEEDS_GARDEN);
    if (data) {
      const rawSeeds: GardenSeed[] = JSON.parse(data);

      // Migrate legacy seeds to include locale maps (one-time, inferred).
      let didMigrate = false;
      const migrated: GardenSeed[] = rawSeeds.map(seed => {
        const withMaps = ensureLocaleMaps(seed);
        if (
          withMaps.sourceLocale !== seed.sourceLocale ||
          withMaps.actionByLocale !== seed.actionByLocale ||
          withMaps.problemTitleByLocale !== seed.problemTitleByLocale
        ) {
          didMigrate = true;
        }
        return withMaps;
      });

      if (didMigrate) {
        await persistGardenSeeds(migrated);
      }

      // Recalculate growth stages (hybrid: time + meditation)
      return migrated.map(seed => ({
        ...seed,
        growthStage: calculateGrowthStage(seed.daysWatered, seed.harvested, seed.datePlanted),
      }));
    }
    return [];
  } catch (error) {
    console.error('Error getting garden seeds:', error);
    return [];
  }
};

/**
 * Ensure all garden seeds have cached text for the target locale (en/ru).
 * This lets the Garden screen switch languages for stored content (titles + detailed seeds).
 *
 * - Migrates legacy seeds to `*ByLocale` fields (inferred from Cyrillic).
 * - For missing target-locale fields, translates once via DeepSeek and caches back to AsyncStorage.
 */
export const ensureGardenSeedsLocalized = async (
  targetLocaleInput: string
): Promise<GardenSeed[]> => {
  const targetLocale = normalizeLocale(targetLocaleInput);
  const seeds = await getAllGardenSeeds();

  // Dedupe translation calls across identical strings.
  const translationCache = new Map<string, string>();
  const translateCached = async (text: string): Promise<string> => {
    const key = `${targetLocale}|${text}`;
    const cached = translationCache.get(key);
    if (cached) return cached;
    const translated = await translatePlainText(text, targetLocale);
    translationCache.set(key, translated);
    return translated;
  };

  let didChange = false;
  const updatedSeeds: GardenSeed[] = [];

  for (const seed of seeds) {
    const s = ensureLocaleMaps(seed);
    const sourceLocale = s.sourceLocale || inferLocaleFromSeed(s);

    const next: GardenSeed = { ...s };
    next.actionByLocale = { ...(s.actionByLocale || {}) };
    next.problemTitleByLocale = { ...(s.problemTitleByLocale || {}) };

    // Fill missing action for target locale.
    if (!next.actionByLocale[targetLocale]) {
      const base = next.actionByLocale[sourceLocale] || next.action || '';
      if (base.trim()) {
        const translated = await translateCached(base);
        next.actionByLocale[targetLocale] = translated;
        didChange = true;
      }
    }

    // Fill missing problem title for target locale.
    if (!next.problemTitleByLocale[targetLocale]) {
      const base = next.problemTitleByLocale[sourceLocale] || next.problemTitle || '';
      if (base.trim()) {
        const translated = await translateCached(base);
        next.problemTitleByLocale[targetLocale] = translated;
        didChange = true;
      }
    }

    updatedSeeds.push(next);
  }

  if (didChange) {
    await persistGardenSeeds(updatedSeeds);
  }

  return updatedSeeds;
};

// ===================
// REPAIR / MIGRATIONS
// ===================

/**
 * Update the stored category for all garden seeds belonging to a specific conversation.
 * This is used to repair misclassified journeys (e.g. accidental `safety` category).
 */
export const updateGardenSeedsCategoryForConversation = async (
  conversationId: string,
  newCategory: string
): Promise<number> => {
  try {
    const allSeeds = await getAllGardenSeeds();
    let changed = 0;
    const updated = allSeeds.map(seed => {
      if (seed.conversationId === conversationId && seed.category !== newCategory) {
        changed += 1;
        return { ...seed, category: newCategory };
      }
      return seed;
    });

    if (changed > 0) {
      await persistGardenSeeds(updated);
    }
    return changed;
  } catch (error) {
    console.error('Error updating seeds category for conversation:', error);
    return 0;
  }
};

/**
 * Update the stored category on the harvest story for a specific conversation (if it exists).
 */
export const updateHarvestStoryCategoryForConversation = async (
  conversationId: string,
  newCategory: string
): Promise<boolean> => {
  try {
    const stories = await getHarvestStories();
    let didChange = false;
    const updated = stories.map(story => {
      if (story.conversationId === conversationId && story.category !== newCategory) {
        didChange = true;
        return { ...story, category: newCategory };
      }
      return story;
    });
    if (didChange) {
      await AsyncStorage.setItem(STORAGE_KEYS.HARVEST_STORIES, JSON.stringify(updated));
      scheduleSnapshotSync('harvest:updateHarvestStoryCategory');
    }
    return didChange;
  } catch (error) {
    console.error('Error updating harvest story category:', error);
    return false;
  }
};

/**
 * Update the pending meditation category for a specific conversation (if it exists).
 */
export const updatePendingMeditationCategoryForConversation = async (
  conversationId: string,
  newCategory: string
): Promise<boolean> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_MEDITATION);
    if (!data) return false;
    const pending: PendingMeditation = JSON.parse(data);
    if (!pending?.conversationId) return false;
    if (pending.conversationId !== conversationId) return false;
    const nextMeditationId = CATEGORY_TO_MEDITATION[newCategory] || CATEGORY_TO_MEDITATION.general;
    if (pending.category === newCategory && pending.recommendedMeditationId === nextMeditationId) return false;
    pending.category = newCategory;
    pending.recommendedMeditationId = nextMeditationId;
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_MEDITATION, JSON.stringify(pending));
    return true;
  } catch (error) {
    console.error('Error updating pending meditation category:', error);
    return false;
  }
};

// Water seeds (increment days watered after meditation)
export const waterSeeds = async (seedIds: string[]): Promise<void> => {
  try {
    const allSeeds = await getAllGardenSeeds();
    const today = new Date().toISOString();
    
    const updatedSeeds = allSeeds.map(seed => {
      if (seedIds.includes(seed.id)) {
        // Only water if not already watered today
        const alreadyWateredToday = seed.lastWateredDate && isToday(seed.lastWateredDate);
        
        if (!alreadyWateredToday && !seed.harvested) {
          const newDaysWatered = seed.daysWatered + 1;
          return {
            ...seed,
            daysWatered: newDaysWatered,
            lastWateredDate: today,
            growthStage: calculateGrowthStage(newDaysWatered, seed.harvested, seed.datePlanted),
          };
        }
      }
      return seed;
    });
    
    await persistGardenSeeds(updatedSeeds);
    trackEvent('garden_seeds_watered', { count: seedIds.length }).catch(() => {});
  } catch (error) {
    console.error('Error watering seeds:', error);
  }
};

// Harvest a problem (mark all seeds for a specific conversation as harvested - problem solved!)
export const harvestProblem = async (
  conversationId: string,
  problemTitle: string,
  category: string,
  story?: string | null,
  emotion?: HarvestEmotion | null
): Promise<number> => {
  try {
    const allSeeds = await getAllGardenSeeds();
    const harvestDate = new Date().toISOString();
    let harvestedCount = 0;
    
    const updatedSeeds = allSeeds.map(seed => {
      if (seed.conversationId === conversationId && !seed.harvested) {
        harvestedCount++;
        return {
          ...seed,
          harvested: true,
          harvestedDate: harvestDate,
          growthStage: 'harvested' as GrowthStage,
        };
      }
      return seed;
    });
    
    await AsyncStorage.setItem(
      STORAGE_KEYS.SEEDS_GARDEN,
      JSON.stringify(updatedSeeds)
    );
    
    // Save the harvest story if provided
    if (harvestedCount > 0) {
      const harvestStory: HarvestStory = {
        id: `harvest_${Date.now()}`,
        category,
        conversationId,
        problemTitle,
        story: story || null,
        emotion: emotion || null,
        seedsContributed: harvestedCount,
        harvestedDate: harvestDate,
      };
      await saveHarvestStory(harvestStory);
    }
    
    return harvestedCount;
  } catch (error) {
    console.error('Error harvesting problem:', error);
    return 0;
  }
};

// Legacy: Harvest by category (for backward compatibility)
export const harvestCategory = async (
  category: string,
  story?: string | null,
  emotion?: HarvestEmotion | null
): Promise<number> => {
  try {
    const allSeeds = await getAllGardenSeeds();
    const harvestDate = new Date().toISOString();
    let harvestedCount = 0;
    
    const updatedSeeds = allSeeds.map(seed => {
      if (seed.category === category && !seed.harvested) {
        harvestedCount++;
        return {
          ...seed,
          harvested: true,
          harvestedDate: harvestDate,
          growthStage: 'harvested' as GrowthStage,
        };
      }
      return seed;
    });
    
    await AsyncStorage.setItem(
      STORAGE_KEYS.SEEDS_GARDEN,
      JSON.stringify(updatedSeeds)
    );
    
    // Save the harvest story if provided
    if (harvestedCount > 0) {
      const harvestStory: HarvestStory = {
        id: `harvest_${Date.now()}`,
        category,
        conversationId: 'legacy',
        problemTitle: CATEGORY_NAMES[category] || category,
        story: story || null,
        emotion: emotion || null,
        seedsContributed: harvestedCount,
        harvestedDate: harvestDate,
      };
      await saveHarvestStory(harvestStory);
    }
    
    return harvestedCount;
  } catch (error) {
    console.error('Error harvesting category:', error);
    return 0;
  }
};

// Get all harvest stories
export const getHarvestStories = async (): Promise<HarvestStory[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.HARVEST_STORIES);
    if (data) {
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error getting harvest stories:', error);
    return [];
  }
};

// Get harvest story for a specific conversation/problem
export const getHarvestStoryForConversation = async (conversationId: string): Promise<HarvestStory | null> => {
  try {
    const stories = await getHarvestStories();
    return stories.find(s => s.conversationId === conversationId) || null;
  } catch (error) {
    console.error('Error getting harvest story for conversation:', error);
    return null;
  }
};

// Legacy: Get harvest story for a specific category
export const getHarvestStoryForCategory = async (category: string): Promise<HarvestStory | null> => {
  try {
    const stories = await getHarvestStories();
    // Return the most recent story for this category
    return stories.find(s => s.category === category) || null;
  } catch (error) {
    console.error('Error getting harvest story for category:', error);
    return null;
  }
};

// Save a harvest story
export const saveHarvestStory = async (story: HarvestStory): Promise<void> => {
  try {
    const stories = await getHarvestStories();
    // Remove any existing story for this conversation (keep most recent)
    const filteredStories = stories.filter(s => s.conversationId !== story.conversationId);
    filteredStories.unshift(story);
    await AsyncStorage.setItem(
      STORAGE_KEYS.HARVEST_STORIES,
      JSON.stringify(filteredStories)
    );
    scheduleSnapshotSync('harvest:saveHarvestStory');
  } catch (error) {
    console.error('Error saving harvest story:', error);
  }
};

// Delete a problem and all its seeds (completely removes from garden and stats)
export const deleteProblem = async (conversationId: string): Promise<number> => {
  try {
    const allSeeds = await getAllGardenSeeds();
    
    // Count seeds being deleted
    const seedsToDelete = allSeeds.filter(seed => seed.conversationId === conversationId);
    const deletedCount = seedsToDelete.length;
    
    // Remove seeds for this conversation
    const remainingSeeds = allSeeds.filter(seed => seed.conversationId !== conversationId);

    // If this results in an empty snapshot, explicitly allow syncing it so the cloud
    // gets cleared too (otherwise restore can bring it back).
    if (remainingSeeds.length === 0) {
      await allowEmptySnapshotSyncForKeyForMs(STORAGE_KEYS.SEEDS_GARDEN).catch(() => {});
    }
    
    await persistGardenSeeds(remainingSeeds);
    
    // Also delete any harvest story for this conversation
    const stories = await getHarvestStories();
    const filteredStories = stories.filter(s => s.conversationId !== conversationId);

    if (filteredStories.length === 0) {
      await allowEmptySnapshotSyncForKeyForMs(STORAGE_KEYS.HARVEST_STORIES).catch(() => {});
    }
    await AsyncStorage.setItem(
      STORAGE_KEYS.HARVEST_STORIES,
      JSON.stringify(filteredStories)
    );
    scheduleSnapshotSync('garden:deleteProblem');
    
    return deletedCount;
  } catch (error) {
    console.error('Error deleting problem:', error);
    return 0;
  }
};

export type DeletedProblemSnapshot = {
  conversationId: string;
  seeds: GardenSeed[];
  harvestStory: HarvestStory | null;
};

export const restoreDeletedProblemSnapshot = async (snapshot: DeletedProblemSnapshot): Promise<void> => {
  try {
    if (!snapshot || !snapshot.conversationId) return;
    const seedsToRestore = (snapshot.seeds || []).filter(Boolean);
    if (!seedsToRestore.length && !snapshot.harvestStory) return;

    const existing = await getAllGardenSeeds();
    const existingIds = new Set(existing.map((s) => s.id));
    const mergedSeeds = [
      ...seedsToRestore.filter((s) => !existingIds.has(s.id)),
      ...existing,
    ];

    await persistGardenSeeds(mergedSeeds);

    if (snapshot.harvestStory) {
      await saveHarvestStory(snapshot.harvestStory);
    }

    scheduleSnapshotSync('garden:restoreDeletedProblemSnapshot');
  } catch (error) {
    console.error('Error restoring deleted problem snapshot:', error);
  }
};

// Legacy: Harvest a single seed (keeping for backwards compatibility but not used in UI)
export const harvestSeed = async (seedId: string): Promise<boolean> => {
  try {
    const allSeeds = await getAllGardenSeeds();
    
    const updatedSeeds = allSeeds.map(seed => {
      if (seed.id === seedId && !seed.harvested) {
        return {
          ...seed,
          harvested: true,
          harvestedDate: new Date().toISOString(),
          growthStage: 'harvested' as GrowthStage,
        };
      }
      return seed;
    });
    
    await persistGardenSeeds(updatedSeeds);
    
    return true;
  } catch (error) {
    console.error('Error harvesting seed:', error);
    return false;
  }
};

// Delete a seed from garden
export const deleteSeed = async (seedId: string): Promise<boolean> => {
  try {
    const allSeeds = await getAllGardenSeeds();
    const filteredSeeds = allSeeds.filter(seed => seed.id !== seedId);
    
    if (filteredSeeds.length === 0) {
      // Ensure empty snapshot is allowed to sync so deleted seeds can't resurrect from cloud restore.
      await allowEmptySnapshotSyncForKeyForMs(STORAGE_KEYS.SEEDS_GARDEN).catch(() => {});
    }
    await persistGardenSeeds(filteredSeeds);
    scheduleSnapshotSync('garden:deleteSeed');
    
    return true;
  } catch (error) {
    console.error('Error deleting seed:', error);
    return false;
  }
};

// Update problem title for all seeds in a conversation
export const updateSeedsProblemTitle = async (
  conversationId: string,
  newTitle: string
): Promise<boolean> => {
  try {
    const locale = normalizeLocale(getCurrentLanguage());
    const allSeeds = await getAllGardenSeeds();
    
    const updatedSeeds = allSeeds.map(seed => {
      if (seed.conversationId === conversationId) {
        const withMaps = ensureLocaleMaps(seed);
        return {
          ...withMaps,
          problemTitle: newTitle,
          problemTitleByLocale: {
            ...(withMaps.problemTitleByLocale || {}),
            [locale]: newTitle,
          },
        };
      }
      return seed;
    });
    
    await persistGardenSeeds(updatedSeeds);
    
    return true;
  } catch (error) {
    console.error('Error updating seed titles:', error);
    return false;
  }
};

// Update a single seed's action text (used by "Edit seed" in Garden).
export const updateGardenSeedAction = async (
  seedId: string,
  newAction: string,
  lang?: string | null
): Promise<boolean> => {
  try {
    const nextAction = String(newAction || '').trim();
    if (!seedId || !nextAction) return false;

    const locale = normalizeLocale(lang || getCurrentLanguage());
    const allSeeds = await getAllGardenSeeds();

    let updatedAny = false;
    const updatedSeeds = allSeeds.map((seed) => {
      if (seed.id !== seedId) return seed;
      const withMaps = ensureLocaleMaps(seed);
      updatedAny = true;
      return {
        ...withMaps,
        action: nextAction,
        actionByLocale: {
          ...(withMaps.actionByLocale || {}),
          [locale]: nextAction,
        },
      };
    });

    if (!updatedAny) return false;
    await persistGardenSeeds(updatedSeeds);
    scheduleSnapshotSync('garden:updateGardenSeedAction');
    return true;
  } catch (error) {
    console.error('Error updating seed action:', error);
    return false;
  }
};

// ===================
// STREAK TRACKING
// ===================

// Get streak data
export const getStreakData = async (): Promise<StreakData> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.MEDITATION_STREAK);
    if (data) {
      const parsed: StreakData = JSON.parse(data);
      // Normalize current streak on read:
      // If the user missed a day, currentStreak must reset to 0 (longestStreak remains).
      // This ensures the UI reflects a broken streak even before the next meditation.
      try {
        const last = parsed?.lastMeditationDate || null;
        if (last && !isToday(last) && !isYesterday(last)) {
          if ((parsed.currentStreak || 0) !== 0) {
            const normalized: StreakData = {
              currentStreak: 0,
              longestStreak: Math.max(0, parsed.longestStreak || 0),
              lastMeditationDate: last,
            };
            // Best-effort persist so all surfaces stay consistent.
            AsyncStorage.setItem(STORAGE_KEYS.MEDITATION_STREAK, JSON.stringify(normalized)).catch(() => {});
            scheduleSnapshotSync('meditation:normalizeStreakOnRead');
            return normalized;
          }
        }
      } catch {
        // ignore normalization failures, return parsed
      }
      return parsed;
    }
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastMeditationDate: null,
    };
  } catch (error) {
    console.error('Error getting streak data:', error);
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastMeditationDate: null,
    };
  }
};

// Update streak after meditation
export const updateStreak = async (): Promise<StreakData> => {
  try {
    const streakData = await getStreakData();
    const today = new Date().toISOString();
    
    let newStreak = streakData.currentStreak;
    
    if (streakData.lastMeditationDate) {
      // Already meditated today - no change
      if (isToday(streakData.lastMeditationDate)) {
        return streakData;
      }
      
      // Meditated yesterday - increment streak
      if (isYesterday(streakData.lastMeditationDate)) {
        newStreak = streakData.currentStreak + 1;
      } else {
        // Streak broken - start at 1
        newStreak = 1;
      }
    } else {
      // First meditation ever
      newStreak = 1;
    }
    
    const newStreakData: StreakData = {
      currentStreak: newStreak,
      longestStreak: Math.max(newStreak, streakData.longestStreak),
      lastMeditationDate: today,
    };
    
    await AsyncStorage.setItem(
      STORAGE_KEYS.MEDITATION_STREAK,
      JSON.stringify(newStreakData)
    );
    scheduleSnapshotSync('meditation:updateStreak');
    
    return newStreakData;
  } catch (error) {
    console.error('Error updating streak:', error);
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastMeditationDate: null,
    };
  }
};

// ===================
// GARDEN STATISTICS
// ===================

export const getGardenStats = async (): Promise<GardenStats> => {
  try {
    const allSeeds = await getAllGardenSeeds();
    const streakData = await getStreakData();
    
    // Count seeds by time period
    const seedsThisWeek = allSeeds.filter(s => isThisWeek(s.datePlanted)).length;
    const seedsThisMonth = allSeeds.filter(s => isThisMonth(s.datePlanted)).length;
    
    // Count seeds by category
    const seedsByCategory: Record<string, number> = {};
    allSeeds.forEach(seed => {
      seedsByCategory[seed.category] = (seedsByCategory[seed.category] || 0) + 1;
    });
    
    // Count seeds by growth stage
    const seedsByStage: Record<GrowthStage, number> = {
      seed: 0,
      sprout: 0,
      seedling: 0,
      blooming: 0,
      harvested: 0,
    };
    allSeeds.forEach(seed => {
      seedsByStage[seed.growthStage]++;
    });
    
    return {
      totalSeeds: allSeeds.length,
      seedsThisWeek,
      seedsThisMonth,
      currentStreak: streakData.currentStreak,
      longestStreak: streakData.longestStreak,
      harvestedCount: seedsByStage.harvested,
      seedsByCategory,
      seedsByStage,
    };
  } catch (error) {
    console.error('Error getting garden stats:', error);
    return {
      totalSeeds: 0,
      seedsThisWeek: 0,
      seedsThisMonth: 0,
      currentStreak: 0,
      longestStreak: 0,
      harvestedCount: 0,
      seedsByCategory: {},
      seedsByStage: {
        seed: 0,
        sprout: 0,
        seedling: 0,
        blooming: 0,
        harvested: 0,
      },
    };
  }
};

// ===================
// UTILITY FUNCTIONS
// ===================

// Clear all data (for testing/reset)
export const clearAllData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.PENDING_MEDITATION,
      STORAGE_KEYS.MEDITATION_HISTORY,
      STORAGE_KEYS.SEEDS_GARDEN,
      STORAGE_KEYS.MEDITATION_STREAK,
    ]);
  } catch (error) {
    console.error('Error clearing data:', error);
  }
};

/**
 * Reset garden/meditation-related state to explicit empty/default values.
 *
 * IMPORTANT: We write explicit values (instead of removing keys) so Cloud Sync can
 * propagate the reset to Firestore snapshots and data won't "come back" on sign-in.
 */
export const resetGardenAndMeditationDataForCloud = async (): Promise<void> => {
  try {
    // Allow syncing empty snapshots for the keys we're about to wipe (so cloud can't resurrect them).
    await Promise.all([
      allowEmptySnapshotSyncForKeyForMs(STORAGE_KEYS.SEEDS_GARDEN).catch(() => {}),
      allowEmptySnapshotSyncForKeyForMs(STORAGE_KEYS.MEDITATION_HISTORY).catch(() => {}),
      allowEmptySnapshotSyncForKeyForMs(STORAGE_KEYS.HARVEST_STORIES).catch(() => {}),
      allowEmptySnapshotSyncForKeyForMs(STORAGE_KEYS.BLOOM_NOTIFIED_SEEDS).catch(() => {}),
    ]);

    await AsyncStorage.multiSet([
      // Core user data
      [STORAGE_KEYS.SEEDS_GARDEN, JSON.stringify([])],
      [STORAGE_KEYS.MEDITATION_HISTORY, JSON.stringify([])],
      [
        STORAGE_KEYS.MEDITATION_STREAK,
        JSON.stringify({ currentStreak: 0, longestStreak: 0, lastMeditationDate: null }),
      ],
      // Optional synced buckets / preferences
      [STORAGE_KEYS.HARVEST_STORIES, JSON.stringify([])],
      [STORAGE_KEYS.SOUND_SETTINGS, JSON.stringify(DEFAULT_SOUND_SETTINGS)],
      [STORAGE_KEYS.VOICE_PREFERENCE, 'female'],
      [STORAGE_KEYS.FIRST_SEEDLING_NOTIFIED, 'false'],
      [STORAGE_KEYS.BLOOM_NOTIFIED_SEEDS, JSON.stringify([])],
      [STORAGE_KEYS.CONVERSATION_STYLE, JSON.stringify(DEFAULT_CONVERSATION_STYLE)],
      [STORAGE_KEYS.COMPLETED_CONVERSATIONS_COUNT, '0'],
    ]);

    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_MEDITATION);
    scheduleSnapshotSync('reset:resetGardenAndMeditationDataForCloud');
  } catch (error) {
    console.error('Error resetting garden/meditation data:', error);
  }
};

/**
 * If the pending meditation belongs to this conversation, clear it.
 * Used when deleting a journey/conversation so it can't linger.
 */
export const clearPendingMeditationForConversation = async (conversationId: string): Promise<boolean> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_MEDITATION);
    if (!raw) return false;
    const pending: PendingMeditation | null = JSON.parse(raw);
    if (!pending?.conversationId) return false;
    if (pending.conversationId !== conversationId) return false;
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_MEDITATION);
    return true;
  } catch {
    return false;
  }
};

// Get recent seeds (for display in garden)
export const getRecentSeeds = async (limit: number = 10): Promise<GardenSeed[]> => {
  const allSeeds = await getAllGardenSeeds();
  return allSeeds.slice(0, limit);
};

// Get seeds by category
export const getSeedsByCategory = async (category: string): Promise<GardenSeed[]> => {
  const allSeeds = await getAllGardenSeeds();
  return allSeeds.filter(seed => seed.category === category);
};

// Get seeds by conversation ID
export const getSeedsByConversation = async (conversationId: string): Promise<GardenSeed[]> => {
  const allSeeds = await getAllGardenSeeds();
  return allSeeds.filter(seed => seed.conversationId === conversationId);
};

// Get active seeds (not harvested)
export const getActiveSeeds = async (): Promise<GardenSeed[]> => {
  const allSeeds = await getAllGardenSeeds();
  return allSeeds.filter(seed => !seed.harvested);
};

// Get harvested seeds
export const getHarvestedSeeds = async (): Promise<GardenSeed[]> => {
  const allSeeds = await getAllGardenSeeds();
  return allSeeds.filter(seed => seed.harvested);
};

// Today's stats for Meditations screen
export interface TodayStats {
  seedsToday: number;
  meditationsToday: number;
}

export const getTodayStats = async (): Promise<TodayStats> => {
  try {
    // Get today's seeds from garden
    const allSeeds = await getAllGardenSeeds();
    const seedsToday = allSeeds.filter(seed => isToday(seed.datePlanted)).length;
    
    // Get today's meditations from history
    const history = await getMeditationHistory();
    // Only count meditations that actually watered at least 1 seed.
    const meditationsToday = history.filter(entry => isToday(entry.date) && (entry.seedCount || 0) > 0).length;
    
    return {
      seedsToday,
      meditationsToday,
    };
  } catch (error) {
    console.error('Error getting today stats:', error);
    return {
      seedsToday: 0,
      meditationsToday: 0,
    };
  }
};

// ===================
// SOUND SETTINGS
// ===================

export interface SoundSettings {
  meditationSoundsEnabled: boolean;
}

const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  meditationSoundsEnabled: true,
};

export const getSoundSettings = async (): Promise<SoundSettings> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SOUND_SETTINGS);
    if (data) {
      return { ...DEFAULT_SOUND_SETTINGS, ...JSON.parse(data) };
    }
    return DEFAULT_SOUND_SETTINGS;
  } catch (error) {
    console.error('Error getting sound settings:', error);
    return DEFAULT_SOUND_SETTINGS;
  }
};

export const saveSoundSettings = async (settings: Partial<SoundSettings>): Promise<void> => {
  try {
    const currentSettings = await getSoundSettings();
    const newSettings = { ...currentSettings, ...settings };
    await AsyncStorage.setItem(
      STORAGE_KEYS.SOUND_SETTINGS,
      JSON.stringify(newSettings)
    );
    scheduleSnapshotSync('settings:saveSoundSettings');
    if (typeof newSettings.meditationSoundsEnabled === 'boolean') {
      trackEvent('settings_sound_changed', { enabled: newSettings.meditationSoundsEnabled }).catch(() => {});
    }
  } catch (error) {
    console.error('Error saving sound settings:', error);
  }
};

// ===================
// VOICE PREFERENCE
// ===================

export type VoicePreference = 'female' | 'male';

export const getVoicePreference = async (): Promise<VoicePreference> => {
  try {
    const voice = await AsyncStorage.getItem(STORAGE_KEYS.VOICE_PREFERENCE);
    return (voice as VoicePreference) || 'female'; // Default to female
  } catch (error) {
    console.error('Error getting voice preference:', error);
    return 'female';
  }
};

export const setVoicePreference = async (voice: VoicePreference): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.VOICE_PREFERENCE, voice);
    scheduleSnapshotSync('settings:setVoicePreference');
    trackEvent('settings_voice_changed', { voice }).catch(() => {});
  } catch (error) {
    console.error('Error saving voice preference:', error);
  }
};

// ===================
// SEED MILESTONE NOTIFICATIONS
// ===================

export interface SeedMilestones {
  isFirstSeedlingEver: boolean;  // True if user has seeds but never received first seedling notification
  newlyBloomedSeeds: GardenSeed[];  // Seeds that just reached bloom and haven't been notified
}

// Check if first seedling notification has been sent
export const hasReceivedFirstSeedlingNotification = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.FIRST_SEEDLING_NOTIFIED);
    return value === 'true';
  } catch (error) {
    console.error('Error checking first seedling notification:', error);
    return false;
  }
};

// Mark first seedling notification as sent
export const markFirstSeedlingNotified = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.FIRST_SEEDLING_NOTIFIED, 'true');
    scheduleSnapshotSync('milestones:firstSeedlingNotified');
  } catch (error) {
    console.error('Error marking first seedling notified:', error);
  }
};

// Get list of seed IDs that have already triggered bloom notifications
export const getBloomNotifiedSeedIds = async (): Promise<string[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.BLOOM_NOTIFIED_SEEDS);
    if (data) {
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error getting bloom notified seeds:', error);
    return [];
  }
};

// Mark seeds as having triggered bloom notification
export const markSeedsBloomNotified = async (seedIds: string[]): Promise<void> => {
  try {
    const existing = await getBloomNotifiedSeedIds();
    const updated = [...new Set([...existing, ...seedIds])];
    await AsyncStorage.setItem(
      STORAGE_KEYS.BLOOM_NOTIFIED_SEEDS,
      JSON.stringify(updated)
    );
    scheduleSnapshotSync('milestones:bloomNotified');
  } catch (error) {
    console.error('Error marking seeds bloom notified:', error);
  }
};

// Check for seed milestones (called when preparing daily notification)
export const checkSeedMilestones = async (): Promise<SeedMilestones> => {
  try {
    const allSeeds = await getAllGardenSeeds();
    const activeSeeds = allSeeds.filter(s => !s.harvested);
    
    // Check for first seedling ever (user has any seeds and hasn't been notified)
    const hasSeeds = activeSeeds.length > 0;
    const firstSeedlingNotified = await hasReceivedFirstSeedlingNotification();
    const isFirstSeedlingEver = hasSeeds && !firstSeedlingNotified;
    
    // Check for newly bloomed seeds (reached 'blooming' stage but not notified yet)
    const bloomNotifiedIds = await getBloomNotifiedSeedIds();
    const bloomingSeeds = activeSeeds.filter(s => s.growthStage === 'blooming');
    const newlyBloomedSeeds = bloomingSeeds.filter(s => !bloomNotifiedIds.includes(s.id));
    
    return {
      isFirstSeedlingEver,
      newlyBloomedSeeds,
    };
  } catch (error) {
    console.error('Error checking seed milestones:', error);
    return {
      isFirstSeedlingEver: false,
      newlyBloomedSeeds: [],
    };
  }
};

// ===================
// COMPLETED CONVERSATIONS TRACKING
// ===================

// Get the count of completed conversations (where user planted seeds)
export const getCompletedConversationsCount = async (): Promise<number> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.COMPLETED_CONVERSATIONS_COUNT);
    if (data) {
      return parseInt(data, 10);
    }
    return 0;
  } catch (error) {
    console.error('Error getting completed conversations count:', error);
    return 0;
  }
};

// Increment the completed conversations count (called when user plants seeds)
export const incrementCompletedConversations = async (): Promise<number> => {
  try {
    const current = await getCompletedConversationsCount();
    const newCount = current + 1;
    await AsyncStorage.setItem(
      STORAGE_KEYS.COMPLETED_CONVERSATIONS_COUNT,
      newCount.toString()
    );
    scheduleSnapshotSync('stats:incrementCompletedConversations');
    return newCount;
  } catch (error) {
    console.error('Error incrementing completed conversations:', error);
    return 0;
  }
};

// ===================
// CONVERSATION STYLE SETTINGS
// ===================

export type ConversationStyle = 'guided' | 'direct';

export interface ConversationStyleSettings {
  style: ConversationStyle;
  // If true, user has explicitly set this preference in settings
  // If false/undefined, we use auto-switching logic
  isManuallySet?: boolean;
}

const DEFAULT_CONVERSATION_STYLE: ConversationStyleSettings = {
  style: 'direct', // Default to direct chat for everyone
  isManuallySet: false,
};

// Get conversation style preference
// Now defaults to 'direct' for everyone
export const getConversationStyle = async (): Promise<ConversationStyleSettings> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.CONVERSATION_STYLE);
    
    if (data) {
      const settings: ConversationStyleSettings = JSON.parse(data);
      // If user has manually set their preference, respect it
      if (settings.isManuallySet) {
        return settings;
      }
    }
    
    // Default everyone to direct chat
    return DEFAULT_CONVERSATION_STYLE;
  } catch (error) {
    console.error('Error getting conversation style:', error);
    return DEFAULT_CONVERSATION_STYLE;
  }
};

// Save conversation style preference (marks as manually set)
export const saveConversationStyle = async (style: ConversationStyle): Promise<void> => {
  try {
    const settings: ConversationStyleSettings = { 
      style,
      isManuallySet: true, // User explicitly chose this
    };
    await AsyncStorage.setItem(
      STORAGE_KEYS.CONVERSATION_STYLE,
      JSON.stringify(settings)
    );
    scheduleSnapshotSync('settings:saveConversationStyle');
    trackEvent('settings_conversation_style_changed', { style }).catch(() => {});
  } catch (error) {
    console.error('Error saving conversation style:', error);
  }
};
