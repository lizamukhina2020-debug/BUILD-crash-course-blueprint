import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'seedmind_plan_choice_seen_v1';

export async function hasSeenPlanChoice(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw === '1';
}

export async function markPlanChoiceSeen(): Promise<void> {
  await AsyncStorage.setItem(KEY, '1');
}

export async function resetPlanChoiceSeen(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

