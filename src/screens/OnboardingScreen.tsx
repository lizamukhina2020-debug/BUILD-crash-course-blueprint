import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  StatusBar,
  Easing,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { BlurView } from 'expo-blur';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../constants/theme';
import { completeOnboarding } from '../services/onboardingStorage';
import { requestNotificationPermissions, saveNotificationSettings } from '../services/notificationService';
import { showAlert } from '../utils/crossPlatformAlert';
import { getFirebaseAuth } from '../services/firebase';

const { width, height } = Dimensions.get('window');

// ===================
// MAIN COMPONENT
// ===================

interface Props {
  onComplete: () => void;
}

const OnboardingScreen: React.FC<Props> = ({ onComplete }) => {
  const { t } = useTranslation();
  
  // The cinematic text sequence - using translations
  const CINEMATIC_SEQUENCE = [
    // Keep every cinematic slide the same length (balanced pacing).
    { line1: t('onboarding.cinema.everyThought'), line2: t('onboarding.cinema.thought'), duration: 2200 },
    { line1: t('onboarding.cinema.everyWord'), line2: t('onboarding.cinema.word'), duration: 2200 },
    { line1: t('onboarding.cinema.everyAction'), line2: t('onboarding.cinema.action'), duration: 2200 },
    { line1: t('onboarding.cinema.plants'), line2: t('onboarding.cinema.aSeed'), duration: 2200 },
  ];
  
  // Flow: hook → cinema → revelation → challenge → notifications → app
  const [currentStep, setCurrentStep] = useState<
    'hook' | 'cinema' | 'revelation' | 'challenge' | 'notifications'
  >('hook');
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [notifBusy, setNotifBusy] = useState(false);

  const getWebsiteBaseUrl = () => {
    const extra =
      (Constants.expoConfig?.extra as any) ??
      ((Constants as any).manifest?.extra as any) ??
      ((Constants as any).manifest2?.extra?.expoClient?.extra as any) ??
      {};
    const raw = typeof extra?.websiteBaseUrl === 'string' ? extra.websiteBaseUrl : '';
    return raw.trim().replace(/\/+$/, '');
  };

  const openWebsitePath = async (path: string) => {
    const base = getWebsiteBaseUrl();
    if (!base) {
      showAlert(t('settings.common.comingSoonTitle'), t('settings.common.comingSoonBody'));
      return;
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${base}${normalizedPath}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
    } catch {
      // ignore
    }
  };
  
  // Hook animation values
  const hookLine1Opacity = useRef(new Animated.Value(0)).current;
  const hookLine2Opacity = useRef(new Animated.Value(0)).current;
  const hookLine1TranslateY = useRef(new Animated.Value(20)).current;
  const hookLine2TranslateY = useRef(new Animated.Value(20)).current;
  
  // Cinema animation values
  const line1Opacity = useRef(new Animated.Value(0)).current;
  const line2Opacity = useRef(new Animated.Value(0)).current;
  const line1TranslateY = useRef(new Animated.Value(30)).current;
  const line2TranslateY = useRef(new Animated.Value(30)).current;
  
  // Revelation screen animations
  const revelationLine1Opacity = useRef(new Animated.Value(0)).current;
  const revelationLine2Opacity = useRef(new Animated.Value(0)).current;
  const revelationLine1TranslateY = useRef(new Animated.Value(20)).current;
  const revelationLine2TranslateY = useRef(new Animated.Value(20)).current;
  
  // Challenge screen animations (3 lines + button)
  const challengeLine1Opacity = useRef(new Animated.Value(0)).current;
  const challengeLine2Opacity = useRef(new Animated.Value(0)).current;
  const challengeLine3Opacity = useRef(new Animated.Value(0)).current;
  const challengeButtonOpacity = useRef(new Animated.Value(0)).current;
  const challengeLine1TranslateY = useRef(new Animated.Value(15)).current;
  const challengeLine2TranslateY = useRef(new Animated.Value(15)).current;
  const challengeLine3TranslateY = useRef(new Animated.Value(15)).current;

  // ===================
  // HOOK ANIMATION
  // ===================

  useEffect(() => {
    if (currentStep === 'hook') {
      // Reset
      hookLine1Opacity.setValue(0);
      hookLine2Opacity.setValue(0);
      hookLine1TranslateY.setValue(20);
      hookLine2TranslateY.setValue(20);

      Animated.sequence([
        Animated.delay(550),
        // Line 1: "There's something about your mind"
        Animated.parallel([
          Animated.timing(hookLine1Opacity, {
            toValue: 1,
            duration: 850,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(hookLine1TranslateY, {
            toValue: 0,
            duration: 850,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(350),
        // Line 2: "no one ever told you."
        Animated.parallel([
          Animated.timing(hookLine2Opacity, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(hookLine2TranslateY, {
            toValue: 0,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        // Hold for impact
        Animated.delay(1500),
        // Fade out
        Animated.parallel([
          Animated.timing(hookLine1Opacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(hookLine2Opacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        // Move to cinema
        setTimeout(() => setCurrentStep('cinema'), 300);
      });
    }
  }, [currentStep, hookLine1Opacity, hookLine2Opacity, hookLine1TranslateY, hookLine2TranslateY]);

  // ===================
  // CINEMATIC SEQUENCE
  // ===================

  const animateSequenceItem = useCallback(() => {
    const item = CINEMATIC_SEQUENCE[sequenceIndex];
    if (!item) return;

    // Reset
    line1Opacity.setValue(0);
    line2Opacity.setValue(0);
    line1TranslateY.setValue(30);
    line2TranslateY.setValue(30);

    // Faster animation timings
    const fadeInDuration = 600;
    const pauseDuration = 300;
    const fadeOutDuration = 400;

    // Animate in
    Animated.sequence([
      // Line 1 fades in and rises
      Animated.parallel([
        Animated.timing(line1Opacity, {
          toValue: 1,
          duration: fadeInDuration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(line1TranslateY, {
          toValue: 0,
          duration: fadeInDuration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // Pause
      Animated.delay(pauseDuration),
      // Line 2 fades in and rises
      Animated.parallel([
        Animated.timing(line2Opacity, {
          toValue: 1,
          duration: fadeInDuration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(line2TranslateY, {
          toValue: 0,
          duration: fadeInDuration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // Hold (clamped so it never goes negative, keeping pacing consistent)
      Animated.delay(Math.max(0, item.duration - (fadeInDuration * 2) - pauseDuration - fadeOutDuration)),
      // Fade out both
      Animated.parallel([
        Animated.timing(line1Opacity, {
          toValue: 0,
          duration: fadeOutDuration,
          useNativeDriver: true,
        }),
        Animated.timing(line2Opacity, {
          toValue: 0,
          duration: fadeOutDuration,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      // Move to next item or revelation
      if (sequenceIndex < CINEMATIC_SEQUENCE.length - 1) {
        setSequenceIndex(sequenceIndex + 1);
      } else {
        // Transition to revelation
        setTimeout(() => setCurrentStep('revelation'), 300);
      }
    });
  }, [sequenceIndex, line1Opacity, line2Opacity, line1TranslateY, line2TranslateY]);

  useEffect(() => {
    if (currentStep === 'cinema') {
      const timer = setTimeout(() => {
        animateSequenceItem();
      }, sequenceIndex === 0 ? 400 : 200);
      return () => clearTimeout(timer);
    }
  }, [currentStep, sequenceIndex, animateSequenceItem]);

  // ===================
  // REVELATION ANIMATION (auto-advances)
  // ===================

  useEffect(() => {
    if (currentStep === 'revelation') {
      // Reset
      revelationLine1Opacity.setValue(0);
      revelationLine2Opacity.setValue(0);
      revelationLine1TranslateY.setValue(20);
      revelationLine2TranslateY.setValue(20);

      Animated.sequence([
        Animated.delay(300),
        // Line 1: "What you plant today"
        Animated.parallel([
          Animated.timing(revelationLine1Opacity, {
            toValue: 1,
            duration: 850,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(revelationLine1TranslateY, {
            toValue: 0,
            duration: 850,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(350),
        // Line 2: "becomes your tomorrow."
        Animated.parallel([
          Animated.timing(revelationLine2Opacity, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(revelationLine2TranslateY, {
            toValue: 0,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        // Hold for impact - let users absorb the message
        Animated.delay(1100),
        // Fade out
        Animated.parallel([
          Animated.timing(revelationLine1Opacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(revelationLine2Opacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        // Auto-advance to challenge
        setTimeout(() => setCurrentStep('challenge'), 150);
      });
    }
  }, [currentStep, revelationLine1Opacity, revelationLine2Opacity, revelationLine1TranslateY, revelationLine2TranslateY]);

  // ===================
  // CHALLENGE ANIMATION
  // ===================

  useEffect(() => {
    if (currentStep === 'challenge') {
      // Reset all
      challengeLine1Opacity.setValue(0);
      challengeLine2Opacity.setValue(0);
      challengeLine3Opacity.setValue(0);
      challengeButtonOpacity.setValue(0);
      challengeLine1TranslateY.setValue(15);
      challengeLine2TranslateY.setValue(15);
      challengeLine3TranslateY.setValue(15);

      Animated.sequence([
        Animated.delay(300),
        // Line 1: "You don't have to believe this."
        Animated.parallel([
          Animated.timing(challengeLine1Opacity, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(challengeLine1TranslateY, {
            toValue: 0,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(650),
        // Line 2: "Plant seeds for what you want."
        Animated.parallel([
          Animated.timing(challengeLine2Opacity, {
            toValue: 1,
            duration: 650,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(challengeLine2TranslateY, {
            toValue: 0,
            duration: 650,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(650),
        // Line 3: "And finally understand how life really works." (the payoff)
        Animated.parallel([
          Animated.timing(challengeLine3Opacity, {
            toValue: 1,
            duration: 850,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(challengeLine3TranslateY, {
            toValue: 0,
            duration: 850,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(650),
        // Button
        Animated.timing(challengeButtonOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [currentStep, challengeLine1Opacity, challengeLine2Opacity, challengeLine3Opacity, challengeButtonOpacity, challengeLine1TranslateY, challengeLine2TranslateY, challengeLine3TranslateY]);

  // ===================
  // HANDLERS
  // ===================

  const finishOnboarding = async () => {
    try {
      const uid = getFirebaseAuth().currentUser?.uid;
      await completeOnboarding([], null, uid);
    } catch (error) {
      console.error('[Onboarding] Error completing onboarding:', error);
    }
    // Always proceed even if storage fails
    onComplete();
  };

  const handleChallengeImIn = async () => {
    console.log('[Onboarding] I\'m in clicked');
    // Don't show a custom notifications UI. The real OS prompt is shown after auth.
    await finishOnboarding();
  };

  const handleNotifAllow = async () => {
    if (notifBusy) return;
    setNotifBusy(true);
    try {
      if (Platform.OS === 'web') {
        await saveNotificationSettings({ enabled: false });
        setNotifBusy(false);
        await finishOnboarding();
        return;
      }

      const granted = await requestNotificationPermissions();
      await saveNotificationSettings({ enabled: granted });
      setNotifBusy(false);
      await finishOnboarding();
    } catch {
      try {
        await saveNotificationSettings({ enabled: false });
      } catch {
        // ignore
      }
      setNotifBusy(false);
      await finishOnboarding();
    }
  };

  const handleNotifNotNow = async () => {
    if (notifBusy) return;
    setNotifBusy(true);
    try {
      await saveNotificationSettings({ enabled: false });
    } catch {
      // ignore
    } finally {
      setNotifBusy(false);
      await finishOnboarding();
    }
  };

  // ===================
  // RENDER: HOOK
  // ===================

  const renderHook = () => (
    <View style={styles.hookContainer}>
      <View style={styles.hookTextContainer}>
        <Animated.Text
          style={[
            styles.hookLine1,
            {
              opacity: hookLine1Opacity,
              transform: [{ translateY: hookLine1TranslateY }],
            },
          ]}
        >
          {t('onboarding.hook.line1')}
        </Animated.Text>
        <Animated.Text
          style={[
            styles.hookLine2,
            {
              opacity: hookLine2Opacity,
              transform: [{ translateY: hookLine2TranslateY }],
            },
          ]}
        >
          {t('onboarding.hook.line2')}
        </Animated.Text>
      </View>
    </View>
  );

  // ===================
  // RENDER: CINEMATIC SEQUENCE
  // ===================

  const renderCinema = () => {
    const item = CINEMATIC_SEQUENCE[sequenceIndex];
    
    return (
      <View style={styles.cinemaContainer}>
        {/* The text */}
        <View style={styles.cinematicTextContainer}>
          <Animated.Text
            style={[
              styles.cinematicLine1,
              {
                opacity: line1Opacity,
                transform: [{ translateY: line1TranslateY }],
              },
            ]}
          >
            {item?.line1}
          </Animated.Text>
          <Animated.Text
            style={[
              styles.cinematicLine2,
              {
                opacity: line2Opacity,
                transform: [{ translateY: line2TranslateY }],
              },
            ]}
          >
            {item?.line2}
          </Animated.Text>
        </View>

        {/* Progress dots */}
        <View style={styles.progressDots}>
          {CINEMATIC_SEQUENCE.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === sequenceIndex && styles.dotActive,
                index < sequenceIndex && styles.dotCompleted,
              ]}
            />
          ))}
        </View>
      </View>
    );
  };

  // ===================
  // RENDER: REVELATION (auto-advances, no button)
  // ===================

  const renderRevelation = () => (
    <View style={styles.revelationContainer}>
      <View style={styles.revelationTextContainer}>
        <Animated.Text
          style={[
            styles.revelationLine1,
            {
              opacity: revelationLine1Opacity,
              transform: [{ translateY: revelationLine1TranslateY }],
            },
          ]}
        >
          {t('onboarding.revelation.line1')}
        </Animated.Text>
        <Animated.Text
          style={[
            styles.revelationLine2,
            {
              opacity: revelationLine2Opacity,
              transform: [{ translateY: revelationLine2TranslateY }],
            },
          ]}
        >
          {t('onboarding.revelation.line2')}
        </Animated.Text>
      </View>
    </View>
  );

  // ===================
  // RENDER: CHALLENGE
  // ===================

  const renderChallenge = () => (
    <View style={styles.challengeContainer}>
      <View style={styles.challengeTextContainer}>
        {/* Line 1: The hook */}
        <Animated.Text
          style={[
            styles.challengeLine1,
            {
              opacity: challengeLine1Opacity,
              transform: [{ translateY: challengeLine1TranslateY }],
            },
          ]}
        >
          {t('onboarding.challenge.line1')}
        </Animated.Text>

        {/* Line 2: The invitation */}
        <Animated.Text
          style={[
            styles.challengeLine2,
            {
              opacity: challengeLine2Opacity,
              transform: [{ translateY: challengeLine2TranslateY }],
            },
          ]}
        >
          {t('onboarding.challenge.line2')}
        </Animated.Text>

        {/* Line 3: The payoff (in gold) */}
        <Animated.Text
          style={[
            styles.challengeLine3,
            {
              opacity: challengeLine3Opacity,
              transform: [{ translateY: challengeLine3TranslateY }],
            },
          ]}
        >
          {t('onboarding.challenge.line3')}
        </Animated.Text>
      </View>

      <Animated.View style={[styles.challengeButtonContainer, { opacity: challengeButtonOpacity }]}>
        <TouchableOpacity style={styles.imInButton} onPress={handleChallengeImIn} activeOpacity={0.8}>
          <Text style={styles.imInButtonText}>{t('onboarding.imIn')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );

  // ===================
  // RENDER: NOTIFICATIONS (final step)
  // ===================

  const renderNotifications = () => (
    <View style={styles.notificationsStage}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.notificationsDim} />
      )}

      <View style={styles.iosAlert}>
        <View style={styles.iosAlertContent}>
          <Text style={styles.iosAlertTitle}>{t('onboarding.notifications.title')}</Text>
          <Text style={styles.iosAlertBody}>{t('onboarding.notifications.body')}</Text>
          <Text style={styles.iosLegalLine}>
            {t('onboarding.legal.prefix')}{' '}
            <Text style={styles.iosLegalLink} onPress={() => openWebsitePath('/terms')}>
              {t('onboarding.legal.terms')}
            </Text>
            {t('onboarding.legal.and')}{' '}
            <Text style={styles.iosLegalLink} onPress={() => openWebsitePath('/privacy')}>
              {t('onboarding.legal.privacy')}
            </Text>
            .
          </Text>
        </View>

        <View style={styles.iosButtonsRow}>
          <TouchableOpacity
            style={[styles.iosButton, notifBusy && { opacity: 0.6 }]}
            onPress={handleNotifNotNow}
            activeOpacity={0.85}
            disabled={notifBusy}
          >
            <Text style={styles.iosButtonText}>{t('onboarding.notifications.notNow')}</Text>
          </TouchableOpacity>

          <View style={styles.iosButtonDivider} />

          <TouchableOpacity
            style={[styles.iosButton, notifBusy && { opacity: 0.6 }]}
            onPress={handleNotifAllow}
            activeOpacity={0.85}
            disabled={notifBusy}
          >
            <Text style={[styles.iosButtonText, styles.iosButtonTextBold]}>
              {notifBusy ? t('common.loading') : t('onboarding.notifications.allow')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ===================
  // MAIN RENDER
  // ===================

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#0A0806', '#12100E', '#0A0806']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <SafeAreaView style={styles.safeArea}>
          {currentStep === 'hook' && renderHook()}
          {currentStep === 'cinema' && renderCinema()}
          {currentStep === 'revelation' && renderRevelation()}
          {currentStep === 'challenge' && renderChallenge()}
          {currentStep === 'notifications' && renderNotifications()}
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
};

// ===================
// STYLES
// ===================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0806',
  },
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },

  // ===================
  // HOOK
  // ===================
  hookContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  hookTextContainer: {
    alignItems: 'center',
  },
  hookLine1: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: 32,
    color: 'rgba(245, 230, 211, 0.6)',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  hookLine2: {
    fontFamily: Typography.fontFamilyHeadingItalic,
    fontSize: 32,
    color: '#F5E6D3',
    textAlign: 'center',
    letterSpacing: -0.5,
  },

  // ===================
  // CINEMATIC SEQUENCE
  // ===================
  cinemaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cinematicTextContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  cinematicLine1: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: 52,
    color: 'rgba(245, 230, 211, 0.5)',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -1,
  },
  cinematicLine2: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: 64,
    color: '#F5E6D3',
    textAlign: 'center',
    letterSpacing: -2,
  },
  progressDots: {
    position: 'absolute',
    bottom: 60,
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(245, 230, 211, 0.15)',
  },
  dotActive: {
    backgroundColor: 'rgba(212, 165, 116, 0.8)',
    width: 24,
  },
  dotCompleted: {
    backgroundColor: 'rgba(245, 230, 211, 0.3)',
  },

  // ===================
  // REVELATION
  // ===================
  revelationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  revelationTextContainer: {
    alignItems: 'center',
  },
  revelationLine1: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: 36,
    color: 'rgba(245, 230, 211, 0.7)',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  revelationLine2: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: 36,
    color: '#D4A574',
    textAlign: 'center',
    fontStyle: 'italic',
    letterSpacing: -0.5,
  },

  // ===================
  // CHALLENGE
  // ===================
  challengeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  challengeTextContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  challengeLine1: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: 30,
    color: '#F5E6D3',
    textAlign: 'center',
    marginBottom: 28,
    letterSpacing: -0.5,
  },
  challengeLine2: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 20,
    color: 'rgba(245, 230, 211, 0.6)',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 28,
  },
  challengeLine3: {
    fontFamily: Typography.fontFamilyHeadingItalic,
    fontSize: 22,
    color: '#D4A574',
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  challengeButtonContainer: {
    position: 'absolute',
    bottom: 50,
    left: 32,
    right: 32,
  },
  imInButton: {
    backgroundColor: '#D4A574',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  imInButtonText: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: 17,
    color: '#0A0806',
    letterSpacing: 0.5,
  },

  // ===================
  // NOTIFICATIONS STEP (iOS-style modal)
  // ===================
  notificationsStage: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  notificationsDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  iosAlert: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 14,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(242,242,247,0.92)' : '#F2F2F7',
    overflow: 'hidden',
    ...Shadows.lg,
  },
  iosAlertContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    alignItems: 'center',
  },
  iosAlertTitle: {
    ...(Platform.OS === 'ios' ? { fontFamily: undefined, fontWeight: '600' as const } : { fontFamily: Typography.fontFamilyHeading }),
    fontSize: 17,
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 8,
  },
  iosAlertBody: {
    ...(Platform.OS === 'ios' ? { fontFamily: undefined, fontWeight: '400' as const } : { fontFamily: Typography.fontFamilyBody }),
    fontSize: 13,
    color: 'rgba(28, 28, 30, 0.75)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 10,
  },
  iosLegalLine: {
    ...(Platform.OS === 'ios' ? { fontFamily: undefined, fontWeight: '400' as const } : { fontFamily: Typography.fontFamilyBody }),
    fontSize: 11,
    color: 'rgba(28, 28, 30, 0.55)',
    textAlign: 'center',
    lineHeight: 16,
  },
  iosLegalLink: {
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  iosButtonsRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(60, 60, 67, 0.18)',
  },
  iosButtonDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(60, 60, 67, 0.18)',
  },
  iosButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosButtonText: {
    ...(Platform.OS === 'ios' ? { fontFamily: undefined, fontWeight: '400' as const } : { fontFamily: Typography.fontFamilyBodyMedium }),
    fontSize: 17,
    color: '#007AFF',
  },
  iosButtonTextBold: {
    ...(Platform.OS === 'ios' ? { fontFamily: undefined, fontWeight: '600' as const } : { fontFamily: Typography.fontFamilyBodyBold }),
  },
});

export default OnboardingScreen;
