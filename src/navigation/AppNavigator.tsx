import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  Text,
  Animated as RNAnimated,
  Easing,
  Keyboard,
  InteractionManager,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { CommonActions, NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import WelcomeScreen from '../screens/WelcomeScreen';
import ChatScreen from '../screens/ChatScreen';
import MeditationsScreen from '../screens/MeditationsScreen';
import MeditationPlayerScreen from '../screens/MeditationPlayerScreen';
import GardenScreen from '../screens/GardenScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PaywallScreen from '../screens/PaywallScreen';
import PlanChoiceScreen from '../screens/PlanChoiceScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import {
  hasCompletedOnboarding,
  hasCompletedOnboardingForUid,
  hasSeenUid,
  markOnboardingCompletedForUid,
  markSeenUid,
  wasPostOnboardingAuthRecentlyStarted,
  wasOnboardingCompletedRecently,
  setPostOnboardingAuthInProgress,
  clearPostOnboardingAuthInProgress,
} from '../services/onboardingStorage';
import StartScreen from '../screens/StartScreen';
import SignUpScreen from '../screens/SignUpScreen';
import { Colors, Typography, Spacing } from '../constants/theme';
import { getFirebaseAuth, subscribeToAuthState } from '../services/firebase';
import type { User } from 'firebase/auth';
import {
  ensureUserDoc,
  migrateLocalToCloudIfNeeded,
  restoreCloudToLocal,
  shouldRunCloudRestore,
  syncLocalSnapshotsToCloud,
} from '../services/cloudSync';
import { analyticsSetUserId, trackEvent, trackScreen } from '../services/analytics';
import { setRevenueCatUser } from '../services/revenueCat';
import { hasSeenPlanChoice } from '../services/planChoice';
import { wipeSeedMindLocalData } from '../services/accountDeletion';
import { initializeNotifications } from '../services/notificationService';
import { setCloudRestoreState } from '../services/cloudRestoreEvents';
import { prewarmMainTabsData } from '../services/prewarm';

// Custom Tab Bar Icons
const ChatIcon = ({ focused }: { focused: boolean }) => (
  <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
    <View style={styles.chatIconWrapper}>
      <View style={[styles.chatBubble, focused && styles.chatBubbleActive]} />
      <View style={[styles.chatBubbleSmall, focused && styles.chatBubbleSmallActive]} />
    </View>
  </View>
);

const MeditationIcon = ({ focused }: { focused: boolean }) => (
  <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
    <View style={styles.coffeeIconWrapper}>
      <View style={[styles.coffeeCup, focused && styles.coffeeCupActive]}>
        <View style={[styles.coffeeHandle, focused && styles.coffeeHandleActive]} />
      </View>
      {focused && (
        <>
          <View style={[styles.steam, styles.steam1]} />
          <View style={[styles.steam, styles.steam2]} />
          <View style={[styles.steam, styles.steam3]} />
        </>
      )}
    </View>
  </View>
);

const GardenIcon = ({ focused }: { focused: boolean }) => (
  <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
    <View style={styles.gardenIconWrapper}>
      {/* Flower pot */}
      <View style={[styles.flowerPot, focused && styles.flowerPotActive]} />
      {/* Plant stem */}
      <View style={[styles.plantStem, focused && styles.plantStemActive]} />
      {/* Leaves */}
      <View style={[styles.leafLeft, focused && styles.leafActive]} />
      <View style={[styles.leafRight, focused && styles.leafActive]} />
      {/* Flower/bud */}
      {focused && <View style={styles.flowerBud} />}
    </View>
  </View>
);

export type RootStackParamList = {
  Start: undefined;
  Onboarding: undefined;
  SignUp: { mode?: 'signup' | 'signin'; postAuth?: 'main' | 'paywall' } | undefined;
  PlanChoice: undefined;
  Welcome: undefined; // legacy, kept for now
  Main: { screen?: string; params?: { recommendedMeditationId?: string; fromChat?: boolean } };
  MeditationPlayer: { meditationId: string };
  Settings: undefined;
  Paywall: { source?: string; mode?: 'upgrade' | 'manage' } | undefined;
};

export type MainTabParamList = {
  Chat: undefined;
  Meditations:
    | { recommendedMeditationId?: string; fromChat?: boolean; conversationId?: string }
    | undefined;
  Garden: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function SoftTabFade({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation();
  const [tabFocused, setTabFocused] = useState(() => {
    try {
      return navigation.isFocused();
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onFocus = () => setTabFocused(true);
    const onBlur = () => setTabFocused(false);
    const u1 = navigation.addListener('focus', onFocus);
    const u2 = navigation.addListener('blur', onBlur);
    return () => {
      u1();
      u2();
    };
  }, [navigation]);

  const opacity = useSharedValue(tabFocused ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(tabFocused ? 1 : 0, { duration: 200 });
  }, [tabFocused, opacity]);

  const style = useAnimatedStyle(() => ({
    flex: 1,
    opacity: opacity.value,
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function MainTabs() {
  const { t } = useTranslation();
  
  console.log('[MainTabs] Rendering...');
  const didPrewarmRef = useRef(false);

  const triggerTabHaptic = useCallback(() => {
    // More noticeable than selectionAsync() but still subtle.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((e) => {
      // If expo-haptics isn't included in the current dev build, this will fail.
      console.warn('[haptics] failed', e);
    });
  }, []);
  
  // Use safe fallbacks for tab labels
  const safeT = (key: string, fallback: string) => {
    try {
      const result = t(key);
      return result && result !== key ? result : fallback;
    } catch {
      return fallback;
    }
  };
  
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (didPrewarmRef.current) return;
    didPrewarmRef.current = true;
    const handle = InteractionManager.runAfterInteractions(() => {
      prewarmMainTabsData();
    });
    return () => {
      try {
        (handle as any)?.cancel?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return (
    <Tab.Navigator
      // iOS stability: keep tab screens attached so we don't end up with "tab bar visible but scene blank"
      // after an auth/navigation reset. (This has been observed in TestFlight.)
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        lazy: false,
        freezeOnBlur: false,
        // Prevent abrupt layout jumps when switching tabs from Chat with keyboard open.
        tabBarHideOnKeyboard: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.espresso,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarBackground: () => (
          Platform.OS === 'ios' ? (
            <BlurView
              intensity={80}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surface }]} />
          )
        ),
      }}
    >
      <Tab.Screen
        name="Chat"
        options={{
          tabBarLabel: safeT('chat.seedsGuide.name', 'Chat'),
          tabBarIcon: ({ focused }) => <ChatIcon focused={focused} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            void navigation;
            triggerTabHaptic();
            try {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            } catch {
              // ignore
            }
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                try {
                  Keyboard.dismiss();
                } catch {
                  // ignore
                }
              });
            });
          },
        })}
      >
        {(props) => (
          <SoftTabFade>
            <ChatScreen {...(props as any)} />
          </SoftTabFade>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Meditations"
        options={{
          tabBarLabel: safeT('meditations.title', 'Meditations'),
          tabBarIcon: ({ focused }) => <MeditationIcon focused={focused} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            void navigation;
            triggerTabHaptic();
            try {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            } catch {
              // ignore
            }
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                try {
                  Keyboard.dismiss();
                } catch {
                  // ignore
                }
              });
            });
          },
        })}
      >
        {(props) => (
          <SoftTabFade>
            <MeditationsScreen {...(props as any)} />
          </SoftTabFade>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Garden"
        options={{
          tabBarLabel: safeT('garden.title', 'Garden'),
          tabBarIcon: ({ focused }) => <GardenIcon focused={focused} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            void navigation;
            triggerTabHaptic();
            try {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            } catch {
              // ignore
            }
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                try {
                  Keyboard.dismiss();
                } catch {
                  // ignore
                }
              });
            });
          },
        })}
      >
        {(props) => (
          <SoftTabFade>
            <GardenScreen {...(props as any)} />
          </SoftTabFade>
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

type Props = {
  onAppReady?: () => void;
};

export default function AppNavigator({ onAppReady }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>('Start');
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const lastUidRef = useRef<string | null>(null);
  const paywallHoldUntilRef = useRef<number>(0);
  const paywallStickyRef = useRef<boolean>(false);
  const fadeIn = useRef(new RNAnimated.Value(0)).current;
  const navigationRef = useNavigationContainerRef();
  const routeNameRef = useRef<string | undefined>(undefined);
  const routeKey = useMemo(() => (user?.uid ? `uid:${user.uid}` : 'signedOut'), [user?.uid]);

  const stateHasRouteName = (state: any, name: string): boolean => {
    try {
      if (!state) return false;
      const routes = state?.routes;
      if (!Array.isArray(routes)) return false;
      for (const r of routes) {
        if (r?.name === name) return true;
        if (r?.state && stateHasRouteName(r.state, name)) return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const showPaywallOverMain = (navigation: any, source: string = 'first_launch') => {
    // Prevent auth/onboarding routing effects from immediately resetting away the Paywall modal.
    paywallHoldUntilRef.current = Date.now() + 3000;
    paywallStickyRef.current = true;
    const action = CommonActions.reset({
      index: 1,
      routes: [
        {
          name: 'Main',
          params: { screen: 'Chat' },
          // Explicitly mount the Chat tab to avoid rare “blank tab until switch” states on fresh resets.
          state: { index: 0, routes: [{ name: 'Chat' }] },
        },
        { name: 'Paywall', params: { source } },
      ],
    });
    try {
      navigation?.dispatch?.(action);
      return;
    } catch {}
    try {
      navigation?.reset?.({
        index: 1,
        routes: [
          {
            name: 'Main',
            params: { screen: 'Chat' },
            state: { index: 0, routes: [{ name: 'Chat' }] },
          },
          { name: 'Paywall', params: { source } },
        ],
      });
    } catch {}
  };

  useEffect(() => {
    // If permission is already granted, keep local reminders scheduled.
    // (We intentionally do not show the OS prompt here.)
    initializeNotifications().catch(() => {});
  }, []);

  const notifiedReadyRef = useRef(false);
  useEffect(() => {
    if (isLoading) return;
    if (notifiedReadyRef.current) return;
    notifiedReadyRef.current = true;
    onAppReady?.();
  }, [isLoading, onAppReady]);

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => {
      // Keep RevenueCat identity in sync with Firebase uid.
      setRevenueCatUser(u?.uid ?? null).catch(() => {});

      // Kick off sync in background (don't block navigation).
      if (u) {
        // If the signed-in user changed, clear local cached data first to prevent cross-account leakage.
        // (We intentionally keep lastUidRef even across sign-out so a subsequent sign-in can still detect a switch.)
        if (lastUidRef.current && lastUidRef.current !== u.uid) {
          wipeSeedMindLocalData().catch(() => {});
        }
        lastUidRef.current = u.uid;
        analyticsSetUserId(u.uid).catch(() => {});
        trackEvent('auth_signed_in', { provider: (u as any)?.providerData?.[0]?.providerId ?? 'unknown' }).catch(() => {});
        const signedInUid = u.uid;
        Promise.resolve()
          .then(() => ensureUserDoc(u as any))
          .then(() => shouldRunCloudRestore(signedInUid))
          .then(async (shouldRestore) => {
            // If the user switched accounts mid-flight, ignore.
            if (getFirebaseAuth().currentUser?.uid !== signedInUid) return;

            if (!shouldRestore) {
              // Avoid flashing "Restoring…" on every app open if local data is already present.
              setCloudRestoreState({ uid: signedInUid, phase: 'done', error: undefined });
              return;
            }

            setCloudRestoreState({ uid: signedInUid, phase: 'restoring', error: undefined });
            await restoreCloudToLocal(signedInUid);
            // Mark restore as done immediately so UI can render history/garden without waiting
            // on background migration/sync work.
            if (getFirebaseAuth().currentUser?.uid !== signedInUid) return;
            setCloudRestoreState({ uid: signedInUid, phase: 'done', error: undefined });
          })
          .then(() => migrateLocalToCloudIfNeeded(u.uid))
          // Always attempt a snapshot push after login (so existing local data gets uploaded even if migration was marked done earlier).
          .then(() => syncLocalSnapshotsToCloud(u.uid))
          .catch((e) => {
            // If the user switched accounts mid-flight, ignore.
            if (getFirebaseAuth().currentUser?.uid !== signedInUid) return;
            setCloudRestoreState({ uid: signedInUid, phase: 'error', error: String(e?.message || e || 'restore_failed') });
            console.warn('[cloudSync] failed', e);
          });
      } else {
        analyticsSetUserId(null).catch(() => {});
        trackEvent('auth_signed_out').catch(() => {});
        setCloudRestoreState({ uid: null, phase: 'idle', error: undefined });
      }
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);
  
  useEffect(() => {
    if (isLoading) return;
    fadeIn.setValue(0);
    RNAnimated.timing(fadeIn, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isLoading, fadeIn]);

  const resetStackTo = useCallback(
    (name: keyof RootStackParamList, params?: any) => {
      try {
        if (!navigationRef.isReady()) return false;
        const route: any = { name: name as any, params };
        // When resetting into the tab navigator, also provide nested tab state so the initial tab screen
        // mounts reliably immediately after auth/sign-in resets.
        if (name === 'Main' && params?.screen) {
          route.state = { index: 0, routes: [{ name: String(params.screen), params: params?.params }] };
        }
        navigationRef.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [route],
          })
        );
        return true;
      } catch {
        return false;
      }
    },
    [navigationRef]
  );

  const resolveOnboardingAndRoute = useCallback(
    async (currentUser: User | null) => {
      const currentRouteName = (() => {
        try {
          if (!navigationRef.isReady()) return undefined;
          return navigationRef.getCurrentRoute()?.name;
        } catch {
          return undefined;
        }
      })();
      const preservePresentedPaywall =
        currentRouteName === 'Paywall' ||
        paywallStickyRef.current === true ||
        Date.now() < (paywallHoldUntilRef.current || 0);

      // Signed out: device-wide onboarding flag controls Start/Auth.
      if (!currentUser) {
        // Clear any stale "post-onboarding auth" marker.
        // IMPORTANT: do not clear it if it's fresh, otherwise the Get Started -> Onboarding -> Auth path
        // can lose the marker during the signed-out phase and then incorrectly replay onboarding after auth.
        wasPostOnboardingAuthRecentlyStarted()
          .then((fresh) => {
            if (!fresh) clearPostOnboardingAuthInProgress().catch(() => {});
          })
          .catch(() => {
            // If we can't read it, don't clear it here; it self-expires and is cleared on the signed-in path.
          });
        const done = await hasCompletedOnboarding();
        setOnboardingDone(done);
        const next = !done ? 'Start' : 'SignUp';
        setInitialRoute(next);
        // If the navigator is already mounted (sign-out from inside the app), reset immediately.
        resetStackTo(next);
        return;
      }

      const uid = currentUser.uid;
      const seenUid = await hasSeenUid(uid);
      // Mark the uid as seen for future sign-ins.
      markSeenUid(uid).catch(() => {});
      const doneForUid = await hasCompletedOnboardingForUid(uid);
      if (doneForUid) {
        setOnboardingDone(true);
        setInitialRoute('Main');
        // If Paywall is currently presented (e.g. immediately after auth), do not reset it away.
        if (!preservePresentedPaywall) {
          resetStackTo('Main', { screen: 'Chat' });
        }
        return;
      }

      // If this Firebase account was just created, ALWAYS show onboarding.
      // This covers "delete account -> sign in again" (same email, new uid).
      const createdAt = currentUser.metadata?.creationTime ? Date.parse(currentUser.metadata.creationTime) : NaN;
      const isLikelyNew = Number.isFinite(createdAt) && Math.abs(Date.now() - createdAt) < 10 * 60 * 1000;
      if (isLikelyNew) {
        // If the user just completed onboarding while signed out (Get Started path),
        // don't force onboarding a second time after authentication.
        const postOnboardingAuth = await wasPostOnboardingAuthRecentlyStarted();
        const deviceDone = await hasCompletedOnboarding();
        const recentlyCompleted = await wasOnboardingCompletedRecently();
        if (postOnboardingAuth || deviceDone || recentlyCompleted) {
          clearPostOnboardingAuthInProgress().catch(() => {});
          await markOnboardingCompletedForUid(uid).catch(() => {});
          setOnboardingDone(true);
          // Let the current flow continue (SignUp onComplete will handle Paywall/Main).
          return;
        }
        // Returning user: never force onboarding again, even if metadata looks "new-ish".
        if (seenUid) {
          clearPostOnboardingAuthInProgress().catch(() => {});
          await markOnboardingCompletedForUid(uid).catch(() => {});
          setOnboardingDone(true);
          return;
        }
        setOnboardingDone(false);
        setInitialRoute('Onboarding');
        resetStackTo('Onboarding');
        return;
      }

      // Migration path for existing users on upgraded installs:
      // If the device-wide flag is already set, treat this uid as onboarded too.
      const deviceDone = await hasCompletedOnboarding();
      if (deviceDone) {
        await markOnboardingCompletedForUid(uid).catch(() => {});
        setOnboardingDone(true);
        setInitialRoute('Main');
        if (!preservePresentedPaywall) {
          resetStackTo('Main', { screen: 'Chat' });
        }
        return;
      }

      // Existing account on a fresh install/device:
      // do NOT force onboarding again (it feels broken on sign-in).
      await markOnboardingCompletedForUid(uid).catch(() => {});
      setOnboardingDone(true);
      setInitialRoute('Main');
      if (!preservePresentedPaywall) {
        resetStackTo('Main', { screen: 'Chat' });
      }
    },
    [navigationRef, resetStackTo]
  );

  // IMPORTANT: Resolve onboarding BEFORE we mount the navigator the first time.
  // React Navigation only applies initialRouteName on first mount; if we choose Main too early,
  // we can't reliably switch to Onboarding afterward without a reset.
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!authReady) return;
      await resolveOnboardingAndRoute(user);
      if (alive) setIsLoading(false);
    };
    run();
    return () => {
      alive = false;
    };
  }, [authReady, routeKey, resolveOnboardingAndRoute, user]);

  // Show loading while checking onboarding status
  if (isLoading) {
    // Keep rendering minimal here — we hold the native splash screen until the app is ready.
    return <View style={styles.loadingContainer} />;
  }

  return (
    <RNAnimated.View style={{ flex: 1, opacity: fadeIn }}>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          const current = navigationRef.getCurrentRoute()?.name;
          routeNameRef.current = current;
          if (current) trackScreen(current).catch(() => {});
        }}
        onStateChange={() => {
          // If Paywall was dismissed, stop preserving it against resets.
          try {
            const root = navigationRef.getRootState?.();
            const hasPaywall = stateHasRouteName(root, 'Paywall');
            if (!hasPaywall) paywallStickyRef.current = false;
          } catch {
            // ignore
          }
          const current = navigationRef.getCurrentRoute()?.name;
          if (!current) return;
          if (routeNameRef.current === current) return;
          routeNameRef.current = current;
          trackScreen(current).catch(() => {});
        }}
      >
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'fade',
            animationTypeForReplace: 'push',
            ...(Platform.OS === 'android' ? { animationDuration: 220 } : null),
          }}
        >
        <Stack.Screen
          name="Start"
          children={({ navigation }) => (
            <StartScreen
              onGetStarted={() => navigation.navigate('Onboarding')}
              onSignIn={() => navigation.navigate('SignUp', { mode: 'signin' })}
            />
          )}
        />
        <Stack.Screen name="Onboarding">
          {({ navigation }) => (
            <OnboardingScreen
              onComplete={() => {
                // If the user is already signed in, skip auth and go straight into the app.
                // Use Firebase auth as the source of truth (state may lag right after account creation).
                const authed = !!getFirebaseAuth().currentUser || !!user;
                if (authed) {
                  // Always show Paywall after onboarding, but present it on top of Main
                  // so dismissing it drops the user into Seeds Guide (not back to Start).
                  showPaywallOverMain(navigation, 'first_launch');
                  return;
                }
                // Coming from onboarding, we want: Auth -> Paywall -> Main.
                void (async () => {
                  try {
                    await setPostOnboardingAuthInProgress();
                  } catch {
                    // ignore
                  }
                  navigation.replace('SignUp', { mode: 'signup', postAuth: 'paywall' });
                })();
              }}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="SignUp">
          {({ route, navigation }) => {
            const mode = (route as any)?.params?.mode || 'signup';
            const postAuth = (route as any)?.params?.postAuth as ('main' | 'paywall' | undefined);
            return (
              <SignUpScreen
                mode={mode}
                onComplete={(result) => {
                  const goPostAuth = () => {
                    if (postAuth === 'paywall') {
                      showPaywallOverMain(navigation, 'first_launch');
                      return;
                    }
                    // Use an explicit reset with nested tab state to avoid rare cases where the tab bar mounts
                    // but the initial tab scene stays blank until the user switches tabs.
                    navigation.dispatch(
                      CommonActions.reset({
                        index: 0,
                        routes: [
                          {
                            name: 'Main',
                            params: { screen: 'Chat' },
                            state: { index: 0, routes: [{ name: 'Chat' }] },
                          } as any,
                        ],
                      })
                    );
                  };

                  // Option A: if a brand-new account was just created, force onboarding first
                  // (then Paywall -> Main happens from Onboarding's signed-in completion path).
                  if (result?.isNewUser) {
                    // If we came from onboarding already, do NOT show onboarding twice.
                    // In that case, proceed to Paywall/Main based on postAuth.
                    if (postAuth === 'paywall') {
                      void (async () => {
                        // Mark onboarding complete for this newly created Firebase uid
                        // so the auth-state resolver will not force onboarding again.
                        const uid = getFirebaseAuth().currentUser?.uid;
                        if (uid) {
                          await markOnboardingCompletedForUid(uid).catch(() => {});
                        }
                        clearPostOnboardingAuthInProgress().catch(() => {});
                        goPostAuth();
                      })();
                      return;
                    }
                    // IMPORTANT:
                    // Onboarding completion is currently stored device-wide in AsyncStorage.
                    // For truly new accounts, we must ALWAYS show onboarding even if this device
                    // has completed onboarding in the past with another account.
                    navigation.replace('Onboarding');
                    return;
                  }

                  // Existing user sign-in: either go straight into the app, or (if we came from onboarding) show Paywall.
                  goPostAuth();
                }}
              />
            );
          }}
        </Stack.Screen>
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="PlanChoice" component={PlanChoiceScreen} />
        <Stack.Screen name="Main">
          {() => (
            // Force a clean remount of the tab navigator when the signed-in user changes.
            // This avoids rare iOS states where the tab bar renders but the initial tab scene stays blank
            // until the user switches tabs.
            <MainTabs key={routeKey} />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="MeditationPlayer"
          component={MeditationPlayerScreen}
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            presentation: 'modal',
            animation: 'slide_from_right',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Paywall"
          component={PaywallScreen}
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            gestureEnabled: false,
          }}
        />
        </Stack.Navigator>
      </NavigationContainer>
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingLogo: {
    width: 120,
    height: 120,
  },
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0,
    elevation: 0,
    height: Platform.OS === 'ios' ? 88 : 70,
    paddingTop: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 28 : Spacing.sm,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: Colors.espresso,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  tabBarLabel: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    marginTop: 4,
  },
  iconContainer: {
    width: 48,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    transform: [{ scale: 1.1 }],
  },
  chatIconWrapper: {
    position: 'relative',
    width: 28,
    height: 24,
  },
  chatBubble: {
    position: 'absolute',
    width: 22,
    height: 18,
    backgroundColor: Colors.latte,
    borderRadius: 10,
    top: 0,
    left: 0,
  },
  chatBubbleActive: {
    backgroundColor: Colors.mocha,
  },
  chatBubbleSmall: {
    position: 'absolute',
    width: 16,
    height: 14,
    backgroundColor: Colors.cream,
    borderRadius: 8,
    bottom: 0,
    right: 0,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  chatBubbleSmallActive: {
    backgroundColor: Colors.gold,
  },
  coffeeIconWrapper: {
    position: 'relative',
    width: 24,
    height: 28,
    alignItems: 'center',
  },
  coffeeCup: {
    position: 'absolute',
    width: 18,
    height: 16,
    backgroundColor: Colors.latte,
    borderRadius: 3,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    bottom: 0,
  },
  coffeeCupActive: {
    backgroundColor: Colors.mocha,
  },
  coffeeHandle: {
    position: 'absolute',
    width: 6,
    height: 10,
    borderWidth: 2,
    borderColor: Colors.latte,
    borderRadius: 4,
    right: -6,
    top: 2,
    borderLeftWidth: 0,
  },
  coffeeHandleActive: {
    borderColor: Colors.mocha,
  },
  steam: {
    position: 'absolute',
    width: 3,
    height: 8,
    backgroundColor: Colors.gold,
    borderRadius: 2,
    top: 0,
    opacity: 0.6,
  },
  steam1: {
    left: 6,
    height: 6,
  },
  steam2: {
    left: 11,
    height: 8,
    top: -2,
  },
  steam3: {
    left: 16,
    height: 5,
    top: 1,
  },
  // Garden Icon Styles
  gardenIconWrapper: {
    position: 'relative',
    width: 28,
    height: 28,
    alignItems: 'center',
  },
  flowerPot: {
    position: 'absolute',
    width: 16,
    height: 10,
    backgroundColor: Colors.latte,
    borderRadius: 2,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    bottom: 0,
  },
  flowerPotActive: {
    backgroundColor: Colors.mocha,
  },
  plantStem: {
    position: 'absolute',
    width: 3,
    height: 14,
    backgroundColor: Colors.softSage,
    borderRadius: 2,
    bottom: 8,
    left: 12.5,
  },
  plantStemActive: {
    backgroundColor: Colors.sage,
  },
  leafLeft: {
    position: 'absolute',
    width: 8,
    height: 6,
    backgroundColor: Colors.softSage,
    borderRadius: 4,
    bottom: 14,
    left: 5,
    transform: [{ rotate: '-30deg' }],
  },
  leafRight: {
    position: 'absolute',
    width: 8,
    height: 6,
    backgroundColor: Colors.softSage,
    borderRadius: 4,
    bottom: 18,
    right: 5,
    transform: [{ rotate: '30deg' }],
  },
  leafActive: {
    backgroundColor: Colors.sage,
  },
  flowerBud: {
    position: 'absolute',
    width: 8,
    height: 8,
    backgroundColor: Colors.gold,
    borderRadius: 4,
    top: 0,
    left: 10,
  },
});
