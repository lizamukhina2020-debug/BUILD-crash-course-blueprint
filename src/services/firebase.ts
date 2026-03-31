import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  User,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
} from 'firebase/auth';
import { getReactNativePersistence } from '@firebase/auth/dist/rn/index.js';
import { Firestore, getFirestore } from 'firebase/firestore';

export type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
};

type ExtraConfig = {
  firebase?: Partial<FirebaseConfig>;
  googleAuth?: {
    iosClientId?: string;
    androidClientId?: string;
    webClientId?: string;
  };
};

function getExtra(): ExtraConfig {
  const config = (Constants.expoConfig ?? Constants.manifest2?.extra) as any;
  return (config?.extra ?? config ?? {}) as ExtraConfig;
}

export function getGoogleAuthConfig() {
  return getExtra().googleAuth ?? {};
}

export function getFirebaseConfig(): Partial<FirebaseConfig> {
  return getExtra().firebase ?? {};
}

export function isFirebaseConfigured(): boolean {
  const cfg = getFirebaseConfig();
  return !!cfg.apiKey && !!cfg.projectId && !!cfg.appId;
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedFirestore: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp;

  const cfg = getFirebaseConfig();
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
    throw new Error(
      '[firebase] Missing Firebase config. Add your Firebase web app config to app.config.js -> expo.extra.firebase.'
    );
  }

  if (getApps().length) {
    cachedApp = getApp();
    return cachedApp;
  }

  cachedApp = initializeApp(cfg as FirebaseConfig);
  return cachedApp;
}

export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  const app = getFirebaseApp();
  // Persist auth session across app restarts on native (AsyncStorage).
  // On web, fall back to default browser persistence.
  if (Platform.OS === 'web') {
    cachedAuth = getAuth(app);
    return cachedAuth;
  }

  try {
    cachedAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // If auth was already initialized elsewhere, fall back safely.
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

export function getFirestoreDb(): Firestore {
  if (cachedFirestore) return cachedFirestore;
  const app = getFirebaseApp();
  cachedFirestore = getFirestore(app);
  return cachedFirestore;
}

export function subscribeToAuthState(callback: (user: User | null) => void) {
  if (!isFirebaseConfigured()) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

