import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const INSTALLATION_ID_KEY = 'seedmind_installation_id_v1';

let memo: string | null = null;
let inflight: Promise<string> | null = null;

function generate(): string {
  try {
    // expo-crypto provides randomUUID on supported platforms.
    const id = Crypto.randomUUID();
    if (typeof id === 'string' && id.length >= 16) return id;
  } catch {
    // ignore
  }
  // Last-resort fallback (still unique-ish per session).
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function readStored(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
      const v = String(raw || '').trim();
      return v || null;
    }
    const raw = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
    const v = String(raw || '').trim();
    return v || null;
  } catch {
    return null;
  }
}

async function writeStored(id: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(INSTALLATION_ID_KEY, id);
      return;
    }
    await SecureStore.setItemAsync(INSTALLATION_ID_KEY, id, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // ignore
  }
}

export async function getInstallationId(): Promise<string> {
  if (memo) return memo;
  if (inflight) return inflight;

  inflight = (async () => {
    const existing = await readStored();
    if (existing) {
      memo = existing;
      return existing;
    }
    const created = generate();
    await writeStored(created);
    memo = created;
    return created;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

