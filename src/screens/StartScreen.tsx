import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { changeLanguage, getCurrentLanguage } from '../i18n';
import { trackEvent } from '../services/analytics';

type Props = {
  onGetStarted: () => void;
  onSignIn: () => void;
};

const START_PREVIEW_IMAGES = [
  require('../../assets/start-previews/1.png'),
  require('../../assets/start-previews/2.png'),
  require('../../assets/start-previews/3.png'),
  require('../../assets/start-previews/4.png'),
  require('../../assets/start-previews/5.png'),
];

export default function StartScreen({ onGetStarted, onSignIn }: Props) {
  const { t } = useTranslation();
  const [lang, setLang] = useState(getCurrentLanguage() === 'ru' ? 'ru' : 'en');

  // Responsive sizing (fixes web overlap on short viewports)
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const basePhoneW = Math.min(400, winW * 0.9);
  const basePhoneH = basePhoneW * 2.05;
  const topReserve = (insets.top || 0) + 56; // language pill + padding
  const bottomReserve = (insets.bottom || 0) + 340; // headline + buttons (give more room on iPhone)
  const availablePhoneH = Math.max(360, winH - topReserve - bottomReserve);
  const phoneH = Math.min(basePhoneH, availablePhoneH);
  const phoneW = Math.min(basePhoneW, phoneH / 2.05);
  const headlineSize = winH < 760 ? 30 : 36;

  const slides = useMemo(() => START_PREVIEW_IMAGES, []);
  const [baseIndex, setBaseIndex] = useState(0);
  const baseIndexRef = useRef(0);
  const [overlayIndex, setOverlayIndex] = useState(0);
  const [overlayReady, setOverlayReady] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);
  const isAnimatingRef = useRef(false);
  const [baseReady, setBaseReady] = useState(false);
  const overlayTokenRef = useRef(0);
  const [overlayToken, setOverlayToken] = useState(0);
  const dropOverlayAfterBaseLoadsRef = useRef<number | null>(null);
  const baseLoadedRef = useRef<Record<number, boolean>>({});
  const phoneAppearOpacity = useRef(new Animated.Value(0)).current;
  const phoneAppearY = useRef(new Animated.Value(10)).current;

  // Faster, more “alive” preview pacing (still smooth/premium).
  const HOLD_MS = 2200;
  const FADE_MS = 420;

  useEffect(() => {
    baseIndexRef.current = baseIndex;
  }, [baseIndex]);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const scheduleNext = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      const next = (baseIndexRef.current + 1) % slides.length;
      overlayTokenRef.current += 1;
      setOverlayToken(overlayTokenRef.current);
      setOverlayIndex(next);
      setOverlayReady(false);
    }, HOLD_MS);
  };

  // Kick off scheduling only after the first screenshot has painted.
  useEffect(() => {
    if (!baseReady) return;
    // Smoothly reveal the phone (frame + screenshot) once the first screenshot is ready.
    Animated.parallel([
      Animated.timing(phoneAppearOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(phoneAppearY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Ensure overlay starts "off" and aligned to base.
    overlayTokenRef.current += 1;
    setOverlayToken(overlayTokenRef.current);
    setOverlayIndex(baseIndexRef.current);
    setOverlayReady(false);
    overlayOpacity.setValue(0);
    scheduleNext();
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseReady]);

  // Start crossfade only when the incoming screenshot is ready.
  useEffect(() => {
    if (!baseReady) return;
    if (overlayIndex === baseIndex) return;
    if (!overlayReady) return;
    if (isAnimatingRef.current) return;

    clearTimer();
    isAnimatingRef.current = true;
    overlayOpacity.setValue(0);
    const target = overlayIndex;

    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: FADE_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        isAnimatingRef.current = false;
        scheduleNext();
        return;
      }

      // Commit the base to the new screenshot while the overlay is fully opaque.
      // IMPORTANT: do not drop the overlay until the new base has actually painted,
      // otherwise iOS can show a brief blank/old frame.
      dropOverlayAfterBaseLoadsRef.current = target;
      setBaseIndex(target);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseReady, baseIndex, overlayIndex, overlayReady]);

  useEffect(() => {
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleLanguage = async () => {
    const next = lang === 'en' ? 'ru' : 'en';
    await changeLanguage(next);
    setLang(next);
  };

  const languagePill = lang === 'ru' ? '🇷🇺 RU' : '🇺🇸 EN';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.topRow}>
          <Pressable onPress={handleToggleLanguage} style={({ pressed }) => [styles.langPill, pressed && { opacity: 0.8 }]}>
            <Text style={styles.langPillText}>{languagePill}</Text>
          </Pressable>
        </View>

        <View style={styles.previewWrap}>
          {/* Reveal the mock phone smoothly after screenshot #1 has painted. */}
          <Animated.View
            style={[
              styles.phoneShadow,
              {
                width: phoneW,
                height: phoneH,
                opacity: phoneAppearOpacity,
                transform: [{ translateY: phoneAppearY }],
              },
            ]}
          >
            <View style={styles.phoneFrame}>
              <View style={[styles.dynamicIsland, { width: Math.round(phoneW * 0.34) }]} />
              {/* Keep the mock phone bezel black from frame 1 (no white flash before image load). */}
              <View style={[styles.phoneViewport, { backgroundColor: '#000' }]}>
                <Image
                  source={slides[baseIndex]}
                  resizeMode="contain"
                  style={styles.previewImage}
                  onLoadEnd={() => {
                    baseLoadedRef.current[baseIndex] = true;
                    setBaseReady(true);

                    const dropTarget = dropOverlayAfterBaseLoadsRef.current;
                    if (dropTarget !== null && dropTarget === baseIndex) {
                      dropOverlayAfterBaseLoadsRef.current = null;
                      overlayOpacity.setValue(0);
                      overlayTokenRef.current += 1;
                      setOverlayToken(overlayTokenRef.current);
                      setOverlayIndex(baseIndex);
                      setOverlayReady(false);
                      isAnimatingRef.current = false;
                      scheduleNext();
                    }
                  }}
                />
                <Animated.View pointerEvents="none" style={[styles.previewLayer, { opacity: overlayOpacity }]}>
                  <Image
                    source={slides[overlayIndex]}
                    resizeMode="contain"
                    style={styles.previewImage}
                    key={`${overlayIndex}-${overlayToken}`}
                    onLoadEnd={() => {
                      // Guard against late onLoadEnd events from previously-mounted overlay images.
                      setOverlayReady(true);
                    }}
                  />
                </Animated.View>
              </View>
            </View>
          </Animated.View>
        </View>

        <View style={styles.bottom}>
          <Text style={[styles.headline, { fontSize: headlineSize }]}>{t('start.headline')}</Text>
          <Text style={styles.subheadline}>{t('start.subheadline')}</Text>

          <Pressable
            onPress={() => {
              trackEvent('start_get_started_tap', { lang }).catch(() => {});
              onGetStarted();
            }}
            style={({ pressed }) => [styles.primaryButton, pressed && { transform: [{ scale: 0.99 }] }]}
          >
            <LinearGradient colors={['#0A0806', '#12100E']} style={styles.primaryButtonGradient}>
              <Text style={styles.primaryButtonText}>{t('start.getStarted')}</Text>
            </LinearGradient>
          </Pressable>

          <Text style={styles.signInRow}>
            {t('start.alreadyHaveAccount')}{' '}
            <Text
              onPress={() => {
                trackEvent('start_sign_in_tap', { lang }).catch(() => {});
                onSignIn();
              }}
              style={styles.signInLink}
            >
              {t('start.signIn')}
            </Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { flexGrow: 1 },
  topRow: { alignItems: 'flex-end', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  langPill: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  langPillText: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: 13, color: Colors.espresso },

  previewWrap: {
    flexGrow: 1,
    minHeight: 0,
    flexShrink: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  phoneShadow: {
    borderRadius: 42,
    backgroundColor: '#000',
    ...Shadows.lg,
    marginBottom: Spacing.lg,
  },
  phoneFrame: {
    flex: 1,
    borderRadius: 42,
    backgroundColor: '#0B0A09',
    padding: 10,
    overflow: 'hidden',
  },
  dynamicIsland: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    height: 14,
    borderRadius: 9,
    backgroundColor: '#000',
    opacity: 0.95,
    zIndex: 5,
  },
  phoneViewport: {
    flex: 1,
    borderRadius: 32,
    overflow: 'hidden',
    // If `contain` leaves thin side bars, make them look like bezel (premium).
    backgroundColor: '#000',
  },
  previewLayer: { ...StyleSheet.absoluteFillObject },
  previewImage: { width: '100%', height: '100%' },

  bottom: { paddingHorizontal: Spacing.xxl, paddingBottom: Spacing.xxl },
  headline: {
    fontFamily: Typography.fontFamilyHeading,
    color: Colors.espresso,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  subheadline: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 18,
    lineHeight: 22,
  },
  primaryButton: { borderRadius: 999, overflow: 'hidden', ...Shadows.md },
  primaryButtonGradient: { paddingVertical: 18, alignItems: 'center' },
  primaryButtonText: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: 18, color: '#fff' },
  signInRow: { textAlign: 'center', marginTop: 14, fontFamily: Typography.fontFamilyBody, color: Colors.textMuted, fontSize: 15 },
  signInLink: { fontFamily: Typography.fontFamilyBodyMedium, color: Colors.espresso },
});


