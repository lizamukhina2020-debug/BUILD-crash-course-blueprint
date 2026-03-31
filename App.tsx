import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Text, Pressable, Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import Constants from 'expo-constants';
import { MaterialIcons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

// Initialize i18n (must be imported before other app components)
import './src/i18n';

import { KeyboardProvider } from 'react-native-keyboard-controller';
import AppNavigator from './src/navigation/AppNavigator';
import { Colors, Typography } from './src/constants/theme';
import { 
  initializeNotifications, 
  setupNotificationListeners 
} from './src/services/notificationService';
import { repairAnxietyJourneysToPeace, repairSafetyJourneysThatAreActuallyHealth } from './src/services/categoryRepair';
import WebAlertHost from './src/components/WebAlertHost';
import { initRevenueCat } from './src/services/revenueCat';

// Keep the native splash visible until the app is ready.
// This eliminates the "white flash" during startup.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  // Load fonts from local assets (reliable in Expo Go over tunnel).
  // IMPORTANT: We block rendering until fonts are loaded so typography matches web everywhere.
  const fontsToLoad = useMemo(
    () => ({
      CormorantGaramond_600SemiBold: require('./assets/fonts/CormorantGaramond_600SemiBold.ttf'),
      CormorantGaramond_600SemiBold_Italic: require('./assets/fonts/CormorantGaramond_600SemiBold_Italic.ttf'),
      Inter_400Regular: require('./assets/fonts/Inter_400Regular.ttf'),
      Inter_500Medium: require('./assets/fonts/Inter_500Medium.ttf'),
      Inter_600SemiBold: require('./assets/fonts/Inter_600SemiBold.ttf'),
      Inter_700Bold: require('./assets/fonts/Inter_700Bold.ttf'),
      ...MaterialIcons.font,
    }),
    []
  );

  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [fontError, setFontError] = useState<unknown>(null);
  const [fontAttempt, setFontAttempt] = useState(0);
  const [fontWaitTimedOut, setFontWaitTimedOut] = useState(false);
  const [showFontRecovery, setShowFontRecovery] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const [rootHasLaidOut, setRootHasLaidOut] = useState(false);
  const [navReady, setNavReady] = useState(false);

  // Ensure meditation audio keeps playing with screen off (TestFlight / App Store builds).
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setFontError(null);
      try {
        await Font.loadAsync(fontsToLoad);
        if (!cancelled) {
          setFontsLoaded(true);
          setShowFontRecovery(false);
        }
      } catch (e) {
        if (cancelled) return;
        console.warn('[fonts] Failed to load custom fonts (will retry):', e);
        setFontError(e);
        if (fontWaitTimedOut) return;
        if (fontAttempt >= 3) return;
        // Retry a few times with backoff
        const nextAttempt = fontAttempt + 1;
        const delay = Math.min(3000, 400 * Math.pow(2, nextAttempt)); // 800ms, 1600ms, 3000ms...
        setTimeout(() => {
          if (!cancelled) setFontAttempt(a => a + 1);
        }, delay);
      }
    };

    if (!fontsLoaded && !fontWaitTimedOut) {
      load();
    }

    return () => {
      cancelled = true;
    };
  }, [fontsLoaded, fontAttempt, fontsToLoad, fontWaitTimedOut]);

  // In dev-client/production we should never auto-fallback to system fonts,
  // but we also shouldn't allow an infinite loading screen if assets stall.
  // After a while, show recovery actions: Retry / Continue without fonts.
  useEffect(() => {
    if (fontsLoaded || fontWaitTimedOut) return;
    const timeout = setTimeout(() => {
      setShowFontRecovery(true);
    }, 12000);
    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontWaitTimedOut]);

  const readyToShowUi = fontsLoaded || fontWaitTimedOut || showFontRecovery;

  const onLayoutRootView = useCallback(() => {
    if (!rootHasLaidOut) setRootHasLaidOut(true);
  }, [rootHasLaidOut]);

  // Hide splash once the root has rendered at least once AND:
  // - we can show recovery UI, OR
  // - fonts are ready AND navigation has resolved initial route.
  //
  // This prevents the "big splash -> smaller logo" transition during startup.
  useEffect(() => {
    if (splashHidden) return;
    if (!rootHasLaidOut) return;
    if (showFontRecovery) {
      SplashScreen.hideAsync()
        .catch(() => {})
        .finally(() => setSplashHidden(true));
      return;
    }
    if (!fontsLoaded && !fontWaitTimedOut) return;
    if (!navReady) return;
    SplashScreen.hideAsync()
      .catch(() => {})
      .finally(() => setSplashHidden(true));
  }, [fontsLoaded, fontWaitTimedOut, navReady, rootHasLaidOut, showFontRecovery, splashHidden]);

  // Safety net: in Expo Go + tunnel, iOS sometimes fails to download assets (fonts) from exp.direct.
  // We stop blocking UI after a short timeout so development can continue.
  //
  // IMPORTANT: In Dev Client / production builds, we should NOT fall back to system fonts
  // because it breaks the app's typography consistency.
  useEffect(() => {
    if (fontsLoaded || fontWaitTimedOut) return;

    // Only allow "timeout + fallback" when running inside Expo Go (store client).
    // In dev-client and production builds, keep the loading screen until fonts load.
    const isExpoGo = (Constants as any)?.executionEnvironment === 'storeClient';
    if (!isExpoGo) return;

    const timeout = setTimeout(() => {
      console.warn('[fonts] Timed out waiting for fonts. Rendering app UI with fallback fonts.');
      setFontWaitTimedOut(true);
    }, 6000);
    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontWaitTimedOut]);

  // Initialize notifications when app loads
  useEffect(() => {
    const setupNotifications = async () => {
      await initializeNotifications();
    };
    
    setupNotifications();
    
    // Set up notification listeners
    const cleanup = setupNotificationListeners(
      (notification) => {
        // Handle notification received while app is open
        console.log('Notification received in app:', notification);
      },
      (response) => {
        // Handle notification tap - navigate to appropriate screen
        console.log('User tapped notification:', response);
      }
    );
    
    return cleanup;
  }, []);

  // Initialize RevenueCat once on app start.
  useEffect(() => {
    initRevenueCat().catch(() => {});
  }, []);

  // One-time data repair: fix misclassified fitness journeys (safety -> health).
  useEffect(() => {
    repairSafetyJourneysThatAreActuallyHealth();
    repairAnxietyJourneysToPeace();
  }, []);

  // Prefer blocking app UI until fonts are loaded, but don't deadlock in Expo Go tunnel mode.
  // While we're waiting, keep the native splash visible (no intermediate JS logo).
  if (!fontsLoaded && !fontWaitTimedOut && !showFontRecovery) {
    return (
      <View style={styles.loadingContainer} onLayout={onLayoutRootView} />
    );
  }

  // If font loading stalls (primarily Expo Go + tunnel), show recovery actions.
  if (!fontsLoaded && !fontWaitTimedOut) {
    return (
      <View style={styles.loadingContainer} onLayout={onLayoutRootView}>
        <View style={styles.logoCenter}>
          <Image
            source={require('./assets/icon.png')}
            style={styles.loadingLogo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.loadingFooter}>
          <ActivityIndicator size="small" color={Colors.mocha} style={styles.spinner} />
          {!!fontError && (
            <Pressable
              onPress={() => {
                // Manual retry
                setFontAttempt(a => a + 1);
              }}
              style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          )}

          {showFontRecovery && (
            <Pressable
              onPress={() => {
                // Explicit, user-approved fallback to avoid infinite loading.
                setFontWaitTimedOut(true);
              }}
              style={({ pressed }) => [styles.continueButton, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.continueText}>Continue without fonts</Text>
            </Pressable>
          )}
          <Text style={styles.brandText}>SeedMind</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.appRoot} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <StatusBar style="auto" />
          <WebAlertHost />
          <AppNavigator onAppReady={() => setNavReady(true)} />
        </KeyboardProvider>
      </SafeAreaProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
  },
  logoCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingLogo: {
    width: 160,
    height: 160,
  },
  loadingFooter: {
    paddingBottom: 28,
    alignItems: 'center',
    gap: 10,
  },
  spinner: {
    marginTop: 0,
  },
  brandText: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: 22,
    color: Colors.espresso,
    letterSpacing: 0.2,
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  retryText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: 14,
    color: Colors.espresso,
  },
  continueButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  continueText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 13,
    color: Colors.textMuted,
  },
});
