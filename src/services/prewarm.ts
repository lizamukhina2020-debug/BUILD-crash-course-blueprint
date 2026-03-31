import { getActiveChatId, getAllConversations } from './chatStorage';
import { getAllGardenSeeds, getGardenStats, getPendingMeditation, getStreakData, getTodayStats } from './meditationStorage';

// UI/perf only: warm up local reads so first tab switch is smooth.
export async function prewarmMainTabsData(): Promise<void> {
  try {
    await Promise.all([
      // Chat
      getAllConversations(),
      getActiveChatId(),

      // Garden
      getAllGardenSeeds(),
      getGardenStats(),

      // Meditations
      getPendingMeditation(),
      getStreakData(),
      getTodayStats(),
    ]);
  } catch {
    // ignore
  }
}

