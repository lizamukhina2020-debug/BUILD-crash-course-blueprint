import AsyncStorage from '@react-native-async-storage/async-storage';
import { detectCategory } from '../constants/seedOptions';
import { getAllConversations, updateConversation } from './chatStorage';
import {
  getAllGardenSeeds,
  updateGardenSeedsCategoryForConversation,
  updateHarvestStoryCategoryForConversation,
  updatePendingMeditationCategoryForConversation,
} from './meditationStorage';

const REPAIR_KEYS = {
  SAFETY_TO_HEALTH_V1: 'seedmind_repair_safety_to_health_v1_completed',
  ANXIETY_TO_PEACE_V1: 'seedmind_repair_anxiety_to_peace_v1_completed',
};

const looksLikeCrisisTopic = (text: string): boolean => {
  const lower = (text || '').toLowerCase();
  return /war|bomb|bombing|genocide|refugee|displaced|conflict zone|military attack|invasion|terror|violence|abuse|assault|rape|trafficking|kidnap|torture|persecution|flee|escaped|survivor|войн|бомб|обстрел|ракет|взрыв|геноцид|бежен|убежищ|переселен|конфликт|вторжен|террор|насили|абьюз|домашн(ее|е)\s+насили|изнасил|нападен|похищ|заложник|пытк|преследован|бежал|выжил/.test(
    lower
  );
};

const looksLikeWeightLossOrFitness = (text: string): boolean => {
  const lower = (text || '').toLowerCase();
  return /lose weight|weight loss|fitness|workout|gym|diet|похуд|похуден|сброс(ить|а)\s+вес|лишн(ий|его)\s+вес|фитнес|тренировк|спортзал|диет|питан(ие|ия)|(?:^|[^А-Яа-яЁё])кг(?:$|[^А-Яа-яЁё])|килограмм/.test(
    lower
  );
};

/**
 * Repair known misclassification where a fitness/weight-loss journey ended up in `safety`.
 * This updates:
 * - conversation.category
 * - garden seeds category (so emoji + label change)
 * - harvest story category (if any)
 * - pending meditation category (if any)
 */
export async function repairSafetyJourneysThatAreActuallyHealth(): Promise<void> {
  try {
    const conversations = await getAllConversations();
    const convoById = new Map(conversations.map(c => [c.id, c]));
    let repairedAny = false;

    for (const convo of conversations) {
      if (convo.category !== 'safety') continue;

      const combined =
        [convo.title, ...(convo.messages || []).filter(m => m.isUser).map(m => m.text)].join(' ');

      // Only repair if it clearly looks like a weight-loss/fitness goal AND does not look like a crisis topic.
      if (looksLikeCrisisTopic(combined)) continue;
      if (!looksLikeWeightLossOrFitness(combined)) {
        // Extra leniency: if the title alone looks like weight-loss, still repair.
        if (!looksLikeWeightLossOrFitness(convo.title || '')) continue;
      }

      // Double-check with the latest classifier (after regex fixes).
      const detected = detectCategory(combined);
      if (detected !== 'health' && !looksLikeWeightLossOrFitness(combined)) continue;

      await updateConversation(convo.id, { category: 'health' });
      await updateGardenSeedsCategoryForConversation(convo.id, 'health');
      await updateHarvestStoryCategoryForConversation(convo.id, 'health');
      await updatePendingMeditationCategoryForConversation(convo.id, 'health');
      repairedAny = true;
    }

    // Also repair directly from Garden data (in case seeds were miscategorized but conversation.category wasn't).
    const seeds = await getAllGardenSeeds();
    const seedsByConversation = new Map<string, string[]>();
    const safetyConversations = new Set<string>();

    for (const s of seeds) {
      const convId = s.conversationId;
      const texts = seedsByConversation.get(convId) ?? [];
      const problem =
        (s.problemTitleByLocale && Object.values(s.problemTitleByLocale).join(' ')) ||
        s.problemTitle ||
        '';
      const action =
        (s.actionByLocale && Object.values(s.actionByLocale).join(' ')) || s.action || '';
      texts.push(problem, action);
      seedsByConversation.set(convId, texts);
      if (s.category === 'safety') safetyConversations.add(convId);
    }

    for (const convId of safetyConversations) {
      const combined = (seedsByConversation.get(convId) ?? []).join(' ');
      if (looksLikeCrisisTopic(combined)) continue;
      if (!looksLikeWeightLossOrFitness(combined)) continue;
      const detected = detectCategory(combined);
      if (detected !== 'health' && !looksLikeWeightLossOrFitness(combined)) continue;

      // Update chat conversation if it exists.
      const convo = convoById.get(convId);
      if (convo && convo.category !== 'health') {
        await updateConversation(convId, { category: 'health' });
      }

      await updateGardenSeedsCategoryForConversation(convId, 'health');
      await updateHarvestStoryCategoryForConversation(convId, 'health');
      await updatePendingMeditationCategoryForConversation(convId, 'health');
      repairedAny = true;
    }

    // Store completion marker for debugging/visibility, but do not block re-running repairs.
    // This helps ensure user data can be repaired even after hot reloads or partial failures.
    await AsyncStorage.setItem(REPAIR_KEYS.SAFETY_TO_HEALTH_V1, repairedAny ? 'true' : 'false');
  } catch (error) {
    // Don't block app startup for a best-effort repair.
    console.error('repairSafetyJourneysThatAreActuallyHealth failed:', error);
  }
}

/**
 * Remove deprecated `anxiety` category by migrating it to `peace`.
 * This updates:
 * - conversation.category
 * - garden seeds category (so emoji + label change)
 * - harvest story category (if any)
 * - pending meditation category + recommended meditation (if any)
 */
export async function repairAnxietyJourneysToPeace(): Promise<void> {
  try {
    const conversations = await getAllConversations();
    const convoById = new Map(conversations.map(c => [c.id, c]));
    let repairedAny = false;

    // Repair conversations labeled as anxiety
    for (const convo of conversations) {
      if (convo.category !== 'anxiety') continue;
      await updateConversation(convo.id, { category: 'peace' });
      await updateGardenSeedsCategoryForConversation(convo.id, 'peace');
      await updateHarvestStoryCategoryForConversation(convo.id, 'peace');
      await updatePendingMeditationCategoryForConversation(convo.id, 'peace');
      repairedAny = true;
    }

    // Repair directly from Garden seeds (in case conversation.category wasn't updated for some reason)
    const seeds = await getAllGardenSeeds();
    const anxietyConversations = new Set<string>();
    for (const s of seeds) {
      if (s.category === 'anxiety') {
        anxietyConversations.add(s.conversationId);
      }
    }

    for (const convId of anxietyConversations) {
      const convo = convoById.get(convId);
      if (convo && convo.category !== 'peace') {
        await updateConversation(convId, { category: 'peace' });
      }
      await updateGardenSeedsCategoryForConversation(convId, 'peace');
      await updateHarvestStoryCategoryForConversation(convId, 'peace');
      await updatePendingMeditationCategoryForConversation(convId, 'peace');
      repairedAny = true;
    }

    await AsyncStorage.setItem(REPAIR_KEYS.ANXIETY_TO_PEACE_V1, repairedAny ? 'true' : 'false');
  } catch (error) {
    console.error('repairAnxietyJourneysToPeace failed:', error);
  }
}

