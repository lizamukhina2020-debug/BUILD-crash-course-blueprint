import * as Updates from 'expo-updates';

/**
 * Release builds: check for a newer JS bundle and reload if available.
 */
export async function applyOtaIfAvailable(): Promise<void> {
  if (__DEV__) return;
  if (!Updates.isEnabled) return;

  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  } catch (e) {
    console.warn('[expo-updates] applyOtaIfAvailable:', e);
  }
}
