import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';

const { width, height } = Dimensions.get('window');

type WelcomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Welcome'>;
};

// Animated Seed Component
const AnimatedSeed = ({ delay, startX, startY }: { delay: number; startX: number; startY: number }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -40,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.2,
            duration: 3000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -60,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.5,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.seed,
        {
          left: startX,
          top: startY,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    />
  );
};

// Coffee Steam Animation
const SteamLine = ({ delay, offsetX }: { delay: number; offsetX: number }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.6,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -30,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -50,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.steamLine,
        {
          left: offsetX,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    />
  );
};

export default function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  const { t } = useTranslation();
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(50)).current;
  const buttonScale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(fadeIn, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(slideUp, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(buttonScale, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const handleStart = () => {
    try {
      console.log('[WelcomeScreen] Navigating to Main...');
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
      console.log('[WelcomeScreen] Navigation called successfully');
    } catch (error) {
      console.error('[WelcomeScreen] Navigation error:', error);
      // Fallback: try navigate instead of replace
      try {
        navigation.navigate('Main' as any, { screen: 'Chat' });
      } catch (e) {
        console.error('[WelcomeScreen] Fallback navigation error:', e);
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[Colors.espresso, Colors.darkRoast, Colors.mocha]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Decorative background elements */}
        <View style={styles.backgroundDecor} pointerEvents="none">
          {[...Array(8)].map((_, i) => (
            <AnimatedSeed
              key={i}
              delay={i * 400}
              startX={30 + (i % 4) * (width - 60) / 3}
              startY={height * 0.3 + (Math.floor(i / 4)) * 100}
            />
          ))}
        </View>

        {/* Main Content */}
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeIn,
              transform: [{ translateY: slideUp }],
            },
          ]}
        >
          {/* Logo / Coffee Cup Illustration */}
          <View style={styles.logoContainer}>
            <View style={styles.coffeeCupLarge}>
              <LinearGradient
                colors={[Colors.latte, Colors.cream]}
                style={styles.coffeeGradient}
              >
                <View style={styles.coffeeRipple} />
              </LinearGradient>
              <View style={styles.cupHandle} />
              {/* Steam */}
              <View style={styles.steamContainer}>
                <SteamLine delay={0} offsetX={15} />
                <SteamLine delay={300} offsetX={35} />
                <SteamLine delay={600} offsetX={55} />
              </View>
            </View>
            <View style={styles.saucer} />
          </View>

          {/* App Title */}
          <Text style={styles.title}>SeedMind</Text>
          <Text style={styles.subtitle}>{t('welcome.subtitle')}</Text>

          {/* Tagline */}
          <View style={styles.taglineContainer}>
            <Text style={styles.tagline}>
              {t('welcome.tagline')}
            </Text>
          </View>

          {/* Features */}
          <View style={styles.featuresContainer}>
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Text style={styles.featureEmoji}>🌱</Text>
              </View>
              <Text style={styles.featureText}>{t('welcome.features.causeEffect')}</Text>
            </View>
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Text style={styles.featureEmoji}>☕</Text>
              </View>
              <Text style={styles.featureText}>{t('welcome.features.meditations')}</Text>
            </View>
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Text style={styles.featureEmoji}>🪞</Text>
              </View>
              <Text style={styles.featureText}>{t('welcome.features.mirrorReality')}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Start Button */}
        <Animated.View
          style={[
            styles.buttonContainer,
            {
              opacity: fadeIn,
              transform: [{ scale: buttonScale }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.startButton}
            onPress={handleStart}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[Colors.gold, Colors.warmGold]}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.buttonText}>{t('welcome.beginJourney')}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.disclaimer}>
            {t('welcome.disclaimer')}
          </Text>
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: height * 0.08,
    paddingBottom: Spacing.xxl,
  },
  backgroundDecor: {
    ...StyleSheet.absoluteFillObject,
  },
  seed: {
    position: 'absolute',
    width: 8,
    height: 12,
    backgroundColor: Colors.gold,
    borderRadius: 4,
    opacity: 0.3,
  },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    marginTop: Spacing.xl,
  },
  coffeeCupLarge: {
    width: 100,
    height: 80,
    backgroundColor: Colors.cream,
    borderRadius: 8,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'visible',
    position: 'relative',
  },
  coffeeGradient: {
    flex: 1,
    margin: 6,
    borderRadius: 6,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  coffeeRipple: {
    width: 60,
    height: 4,
    backgroundColor: 'rgba(92, 61, 46, 0.3)',
    borderRadius: 2,
    marginTop: -10,
  },
  cupHandle: {
    position: 'absolute',
    width: 20,
    height: 40,
    borderWidth: 5,
    borderColor: Colors.cream,
    borderRadius: 10,
    right: -18,
    top: 15,
    borderLeftWidth: 0,
  },
  steamContainer: {
    position: 'absolute',
    width: 80,
    height: 50,
    top: -45,
    left: 10,
  },
  steamLine: {
    position: 'absolute',
    width: 4,
    height: 25,
    backgroundColor: Colors.cream,
    borderRadius: 2,
    opacity: 0.5,
    bottom: 0,
  },
  saucer: {
    width: 120,
    height: 12,
    backgroundColor: Colors.cream,
    borderRadius: 60,
    marginTop: -3,
    opacity: 0.9,
  },
  title: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSize4XL,
    color: Colors.cream,
    marginTop: Spacing.md,
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: Typography.fontFamilyHeadingItalic,
    fontSize: Typography.fontSizeXL,
    color: Colors.gold,
    marginTop: Spacing.xs,
    letterSpacing: 1,
  },
  taglineContainer: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  tagline: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeMD,
    color: Colors.latte,
    textAlign: 'center',
    lineHeight: 26,
  },
  featuresContainer: {
    marginTop: Spacing.xxl,
    width: '100%',
    gap: Spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(212, 165, 116, 0.2)',
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(212, 165, 116, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  featureEmoji: {
    fontSize: 20,
  },
  featureText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.cream,
  },
  buttonContainer: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
  },
  startButton: {
    width: '100%',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonGradient: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeLG,
    color: Colors.espresso,
    letterSpacing: 0.5,
  },
  disclaimer: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.latte,
    marginTop: Spacing.md,
    opacity: 0.7,
  },
});

