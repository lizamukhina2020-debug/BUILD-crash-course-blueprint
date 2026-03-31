import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';

import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { markPlanChoiceSeen } from '../services/planChoice';
import { getEffectivePremiumFlag, FREE_GARDEN_TICKET_LIMIT, FREE_MESSAGE_LIMIT } from '../services/subscriptionGate';

type Props = {
  navigation: any;
};

export default function PlanChoiceScreen({ navigation }: Props) {
  const [checking, setChecking] = useState(true);

  const goToMain = useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'Chat' } }] });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const run = async () => {
        setChecking(true);
        try {
          const premium = await getEffectivePremiumFlag();
          if (!alive) return;
          if (premium) {
            await markPlanChoiceSeen();
            goToMain();
            return;
          }
        } finally {
          if (alive) setChecking(false);
        }
      };
      run();
      return () => {
        alive = false;
      };
    }, [goToMain])
  );

  const handleContinueFree = async () => {
    await markPlanChoiceSeen();
    goToMain();
  };

  const handleGoPremium = async () => {
    await markPlanChoiceSeen();
    navigation.navigate('Paywall', { source: 'plan_choice' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient colors={[Colors.background, Colors.cream]} style={styles.gradient}>
        <View style={styles.header}>
          <Text style={styles.title}>SeedMind</Text>
          <Text style={styles.subtitle}>Choose your path</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Continue free</Text>
          <Text style={styles.cardBody}>
            You’ll get {FREE_MESSAGE_LIMIT} messages / 30 days and {FREE_GARDEN_TICKET_LIMIT} Garden Journeys / 30 days.
            {'\n\n'}Daily Gratitude Brew is always included.
          </Text>
          <TouchableOpacity
            style={[styles.secondaryButton, checking && { opacity: 0.6 }]}
            onPress={handleContinueFree}
            disabled={checking}
            activeOpacity={0.9}
          >
            {checking ? (
              <View style={styles.row}>
                <ActivityIndicator color={Colors.mocha} />
                <Text style={styles.secondaryButtonText}>Checking…</Text>
              </View>
            ) : (
              <Text style={styles.secondaryButtonText}>Continue free</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Go Premium</Text>
          <Text style={styles.cardBody}>Unlock all meditations, remove limits, and support SeedMind.</Text>
          <TouchableOpacity
            style={[styles.primaryButton, checking && { opacity: 0.6 }]}
            onPress={handleGoPremium}
            disabled={checking}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryButtonText}>See Premium plans</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footnote}>You can upgrade anytime in Settings.</Text>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  gradient: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  header: { alignItems: 'center', marginBottom: Spacing.lg },
  title: { fontFamily: Typography.fontFamilyHeading, fontSize: 42, color: Colors.espresso },
  subtitle: { fontFamily: Typography.fontFamilyBody, fontSize: 16, color: Colors.textMuted, marginTop: 6 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...Shadows.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  cardTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: 24,
    color: Colors.espresso,
    marginBottom: Spacing.xs,
  },
  cardBody: { fontFamily: Typography.fontFamilyBody, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },

  primaryButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.mocha,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  primaryButtonText: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: 16, color: Colors.cream },

  secondaryButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryButtonText: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: 16, color: Colors.espresso },

  footnote: {
    marginTop: 'auto',
    marginBottom: Spacing.lg,
    textAlign: 'center',
    fontFamily: Typography.fontFamilyBody,
    fontSize: 12,
    color: Colors.textMuted,
  },
});

