import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  Modal,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList, MainTabParamList } from '../navigation/AppNavigator';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { meditations, categories, Meditation } from '../constants/meditations';
import {
  getPendingMeditation,
  getStreakData,
  PendingMeditation,
  StreakData,
  getTodayStats,
  TodayStats,
  getAllGardenSeeds,
  CATEGORY_TO_MEDITATION,
  GardenSeed,
} from '../services/meditationStorage';
import { showAlert } from '../utils/crossPlatformAlert';
import { getEffectivePremiumFlag, setDevForcePremium } from '../services/subscriptionGate';
import { getActiveChatId } from '../services/chatStorage';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - Spacing.lg * 2;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type MeditationsRouteProp = RouteProp<MainTabParamList, 'Meditations'>;

// Category Filter Chip
const CategoryChip = ({
  category,
  isActive,
  onPress,
}: {
  category: { id: string; label: string; icon: string };
  isActive: boolean;
  onPress: () => void;
}) => {
  const { t } = useTranslation();
  // Get translated category label
  const categoryLabel = t(`meditations.categories.${category.id}`, { defaultValue: category.label });
  
  return (
    <TouchableOpacity
      style={[styles.categoryChip, isActive && styles.categoryChipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.categoryIcon}>{category.icon}</Text>
      <Text style={[styles.categoryLabel, isActive && styles.categoryLabelActive]}>
        {categoryLabel}
      </Text>
    </TouchableOpacity>
  );
};

// Meditation Card Component
const MeditationCard = ({
  meditation,
  index,
  onPress,
  isRecommended,
  premiumLocked,
}: {
  meditation: Meditation;
  index: number;
  onPress: () => void;
  isRecommended?: boolean;
  premiumLocked?: boolean;
}) => {
  const { t } = useTranslation();
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  
  // Get translated meditation content
  const meditationTitle = t(`meditations.items.${meditation.id}.title`, { defaultValue: meditation.title });
  const meditationSubtitle = t(`meditations.items.${meditation.id}.subtitle`, { defaultValue: meditation.subtitle });
  const meditationDescription = t(`meditations.items.${meditation.id}.description`, { defaultValue: meditation.description });

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 500,
        delay: index * 100,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        delay: index * 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulse animation for recommended card
    if (isRecommended) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isRecommended]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.cardContainer,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
        isRecommended && styles.recommendedCardContainer,
      ]}
    >
      {isRecommended && (
        <View style={styles.recommendedBadge}>
          <Text style={styles.recommendedBadgeText}>{t('meditations.badges.basedOnSeeds')}</Text>
        </View>
      )}
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={meditation.isLocked}
      >
        <LinearGradient
          colors={meditation.imageGradient as [string, string]}
          style={[styles.card, isRecommended && styles.recommendedCard]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Decorative elements */}
          <View style={styles.cardDecor}>
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />
            <View style={styles.decorLine} />
          </View>

          {/* Lock overlay */}
          {meditation.isLocked && (
            <View style={styles.lockOverlay}>
              <View style={styles.lockBadge}>
                <Text style={styles.lockIcon}>✨</Text>
                <Text style={styles.lockText}>{t('meditations.comingSoon')}</Text>
              </View>
            </View>
          )}

          {/* Premium lock overlay (Phase 1 monetization) */}
          {premiumLocked && !meditation.isLocked && (
            <View style={styles.lockOverlay}>
              <View style={styles.lockBadge}>
                <Text style={styles.lockIcon}>🔒</Text>
                <Text style={styles.lockText}>Premium</Text>
              </View>
            </View>
          )}

          {/* Card content */}
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{Math.round(meditation.durationSeconds / 60)} {t('meditations.duration')}</Text>
              </View>
              <View style={[styles.playButton, isRecommended && styles.recommendedPlayButton]}>
                <Text style={styles.playIcon}>▶</Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.cardCategory}>{meditationSubtitle}</Text>
              <Text style={styles.cardTitle}>{meditationTitle}</Text>
              <Text style={styles.cardDescription} numberOfLines={2}>
                {meditationDescription}
              </Text>
            </View>

            {/* Coffee cup decoration */}
            <View style={styles.coffeeDecor}>
              <Text style={styles.coffeeEmoji}>☕</Text>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Featured Section
const FeaturedSection = ({ 
  meditation, 
  onPress, 
  isFromChat 
}: { 
  meditation: Meditation; 
  onPress: () => void;
  isFromChat?: boolean;
}) => {
  const { t } = useTranslation();
  
  // Get translated meditation content
  const meditationTitle = t(`meditations.items.${meditation.id}.title`, { defaultValue: meditation.title });
  const meditationSubtitle = t(`meditations.items.${meditation.id}.subtitle`, { defaultValue: meditation.subtitle });
  const meditationDescription = t(`meditations.items.${meditation.id}.description`, { defaultValue: meditation.description });
  
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={styles.featuredContainer}
    >
      <LinearGradient
        colors={meditation.imageGradient as [string, string]}
        style={styles.featuredCard}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Background pattern */}
        <View style={styles.featuredPattern}>
          {[...Array(5)].map((_, i) => (
            <View key={i} style={[styles.patternCircle, { left: i * 60, opacity: 0.05 + i * 0.02 }]} />
          ))}
        </View>

        <View style={styles.featuredContent}>
          <View style={[styles.featuredBadge, isFromChat && styles.featuredBadgeFromChat]}>
            <Text style={styles.featuredBadgeText}>
              {isFromChat ? t('meditations.badges.basedOnSeeds') : t('meditations.badges.tonightRecommendation')}
            </Text>
          </View>
          
          <View style={styles.featuredMain}>
            <View style={styles.featuredTextContent}>
              <Text style={styles.featuredTitle}>{meditationTitle}</Text>
              <Text style={styles.featuredSubtitle}>{meditationSubtitle}</Text>
            </View>
            
            <View style={styles.featuredPlay}>
              <LinearGradient
                colors={[Colors.gold, Colors.warmGold]}
                style={styles.featuredPlayButton}
              >
                <Text style={styles.featuredPlayIcon}>▶</Text>
              </LinearGradient>
              <Text style={styles.featuredDuration}>{Math.round(meditation.durationSeconds / 60)} {t('meditations.duration')}</Text>
            </View>
          </View>

          <Text style={styles.featuredDescription} numberOfLines={2}>
            {meditationDescription}
          </Text>
          
          {isFromChat && (
            <Text style={styles.featuredFromChatHint}>
              {t('meditations.badges.tapToStart')}
            </Text>
          )}
        </View>

        {/* Decorative coffee cup */}
        <View style={styles.featuredCoffee}>
          <Text style={styles.featuredCoffeeEmoji}>☕</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

export default function MeditationsScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<MeditationsRouteProp>();
  const [isPremium, setIsPremium] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [showStreakTooltip, setShowStreakTooltip] = useState(false);
  const [todayStats, setTodayStats] = useState<TodayStats>({ seedsToday: 0, meditationsToday: 0 });
  const [pendingMeditation, setPendingMeditation] = useState<PendingMeditation | null>(null);
  const [activeChatId, setActiveChatIdState] = useState<string | null>(null);
  const [seedBasedRecommendedId, setSeedBasedRecommendedId] = useState<string | null>(null);
  
  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('meditations.greetings.morning');
    if (hour < 18) return t('meditations.greetings.afternoon');
    return t('meditations.greetings.evening');
  };
  
  // Seed-based recommendation is per conversation (chat).
  const isSeedBasedContext = !!seedBasedRecommendedId;
  const isPendingForActiveChat =
    !!pendingMeditation &&
    !pendingMeditation.completed &&
    !!activeChatId &&
    pendingMeditation.conversationId === activeChatId;
  const showAudioNotice = i18n.language === 'ru';
  
  // Fetch streak data and today's stats when screen focuses
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      let interactionHandle: any = null;
      const loadData = async () => {
        const streakInfo = await getStreakData();
        setStreakData(streakInfo);
        
        const stats = await getTodayStats();
        setTodayStats(stats);

        const pending = await getPendingMeditation();
        setPendingMeditation(pending);

        const premium = await getEffectivePremiumFlag();
        setIsPremium(premium);

        const storedActiveId = await getActiveChatId();
        const routeFromChat = !!route.params?.fromChat;
        // IMPORTANT: Tab route params can stick around between tab switches.
        // Only treat `conversationId` as authoritative when we *just* navigated here from Chat.
        const routeConversationId = routeFromChat ? route.params?.conversationId : undefined;
        const effectiveChatId =
          routeConversationId ||
          storedActiveId ||
          null;
        setActiveChatIdState(effectiveChatId);

        const pickDominantSeedCategory = (seeds: GardenSeed[]): string => {
          if (seeds.length === 0) return 'general';
          const counts = new Map<string, { count: number; latest: number }>();
          for (const s of seeds) {
            const cat = s.category || 'general';
            const latest = new Date(s.datePlanted).getTime() || 0;
            const prev = counts.get(cat);
            if (!prev) {
              counts.set(cat, { count: 1, latest });
            } else {
              counts.set(cat, { count: prev.count + 1, latest: Math.max(prev.latest, latest) });
            }
          }
          let best = { category: 'general', count: -1, latest: -1 };
          for (const [category, v] of counts.entries()) {
            if (v.count > best.count || (v.count === best.count && v.latest > best.latest)) {
              best = { category, count: v.count, latest: v.latest };
            }
          }
          return best.category;
        };

        let recommendedId: string | null = null;
        if (effectiveChatId) {
          const allSeeds = await getAllGardenSeeds();
          const convoSeeds = allSeeds.filter(s => s.conversationId === effectiveChatId);
          if (convoSeeds.length > 0) {
            if (!premium) {
              recommendedId = '4'; // Daily Gratitude Brew is the only free meditation
            } else {
              const category = pickDominantSeedCategory(convoSeeds);
              recommendedId = CATEGORY_TO_MEDITATION[category] || CATEGORY_TO_MEDITATION.general;
            }
          }
        }
        setSeedBasedRecommendedId(recommendedId);

        // Clear sticky params so simply switching tabs always uses the current active chat.
        if (routeFromChat || route.params?.conversationId || route.params?.recommendedMeditationId) {
          try {
            (navigation as any).setParams({
              fromChat: undefined,
              conversationId: undefined,
              recommendedMeditationId: undefined,
            });
          } catch {}
        }
      };
      // Defer heavy loading to keep the first tab transition smooth.
      interactionHandle = InteractionManager.runAfterInteractions(() => {
        if (!alive) return;
        loadData();
      });
      return () => {
        alive = false;
        try {
          interactionHandle?.cancel?.();
        } catch {
          // ignore
        }
      };
    }, [route.params?.conversationId, route.params?.fromChat, route.params?.recommendedMeditationId])
  );
  
  const filteredMeditations = meditations.filter(
    m => selectedCategory === 'all' || m.category === selectedCategory
  );

  const handleMeditationPress = (meditationId: string) => {
    const isLockedForFree = !isPremium && meditationId !== '4';
    if (isLockedForFree) {
      const buttons: any[] = [{ text: t('common.gotIt'), style: 'default' }];
      buttons.unshift({
        text: 'Upgrade',
        style: 'default',
        onPress: () => navigation.navigate('Paywall', { source: 'meditation_locked' }),
      });
      if (__DEV__) {
        buttons.unshift({
          text: 'Enable Premium (Testing)',
          style: 'default',
          onPress: async () => {
            await setDevForcePremium(true);
            setIsPremium(true);
          },
        });
      }
      showAlert('Premium required', 'Upgrade to unlock this meditation.', buttons);
      return;
    }
    navigation.navigate('MeditationPlayer', { meditationId });
  };

  const featuredMeditation = (() => {
    if (isSeedBasedContext) {
      return meditations.find(m => m.id === seedBasedRecommendedId) || meditations[3];
    }
    // If navigated from Chat, fall back to the category-based suggestion (no "Based on your seeds" styling).
    const routeRec = route.params?.recommendedMeditationId;
    const routeFromChat = !!route.params?.fromChat;
    if (routeFromChat && routeRec) {
      return meditations.find(m => m.id === routeRec) || meditations[3];
    }
    return meditations[3];
  })();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.title}>{t('meditations.title')}</Text>
          </View>
          <View style={styles.headerRight}>
            <View pointerEvents={streakData ? 'auto' : 'none'} style={!streakData ? { opacity: 0 } : undefined}>
              <TouchableOpacity
                style={styles.streakBadge}
                onPress={() => setShowStreakTooltip(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.streakEmoji}>🔥</Text>
                {((streakData ?? { currentStreak: 0, longestStreak: 0, lastMeditationDate: null }).currentStreak ?? 0) > 0 ? (
                  <>
                    <Text style={styles.streakCount}>
                      {(streakData ?? { currentStreak: 0, longestStreak: 0, lastMeditationDate: null }).currentStreak}
                    </Text>
                    <Text style={styles.streakLabel}>
                      {t('meditations.streak.days', {
                        count: (streakData ?? { currentStreak: 0, longestStreak: 0, lastMeditationDate: null }).currentStreak,
                      })}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.streakStart}>{t('meditations.streak.start')}</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.premiumCrownButton,
                isPremium ? styles.premiumCrownButtonActive : styles.premiumCrownButtonFree,
              ]}
              onPress={() =>
                navigation.navigate('Paywall', {
                  source: 'meditations_header_pill',
                  mode: isPremium ? 'manage' : 'upgrade',
                } as any)
              }
              activeOpacity={0.85}
            >
              <Text style={styles.premiumCrownIcon}>👑</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Streak Tooltip Modal */}
        <Modal
          visible={showStreakTooltip}
          transparent
          animationType="fade"
          onRequestClose={() => setShowStreakTooltip(false)}
        >
          <TouchableOpacity 
            style={styles.tooltipOverlay}
            activeOpacity={1}
            onPress={() => setShowStreakTooltip(false)}
          >
            <View style={styles.tooltipContainer}>
              <Text style={styles.tooltipTitle}>{t('meditations.streak.tooltipTitle')}</Text>
              <Text style={styles.tooltipText}>
                {t('meditations.streak.tooltipText1')}
              </Text>
              <Text style={styles.tooltipText}>
                {t('meditations.streak.tooltipText2')}
              </Text>
              {streakData && streakData.longestStreak > 0 && (
                <View style={styles.tooltipStats}>
                  <View style={styles.tooltipStat}>
                    <Text style={styles.tooltipStatNumber}>{streakData.currentStreak}</Text>
                    <Text style={styles.tooltipStatLabel}>{t('meditations.streak.currentLabel')}</Text>
                  </View>
                  <View style={styles.tooltipStatDivider} />
                  <View style={styles.tooltipStat}>
                    <Text style={styles.tooltipStatNumber}>{streakData.longestStreak}</Text>
                    <Text style={styles.tooltipStatLabel}>{t('meditations.streak.longestLabel')}</Text>
                  </View>
                </View>
              )}
              <TouchableOpacity 
                style={styles.tooltipButton}
                onPress={() => setShowStreakTooltip(false)}
              >
                <Text style={styles.tooltipButtonText}>{t('common.gotIt')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Special banner only while a pending meditation is active */}
        {isPendingForActiveChat && (
          <View style={styles.fromChatBanner}>
            <Text style={styles.fromChatBannerText}>
              {t('meditations.banner.seedsSaved')}
            </Text>
          </View>
        )}

        {/* Quote of the day - hide if from chat to make room */}
        {!isPendingForActiveChat && (
          <View style={styles.quoteContainer}>
            <Text style={styles.quoteText}>
              "{t('meditations.quote.text')}"
            </Text>
            <View style={styles.quoteDivider}>
              <View style={styles.quoteLine} />
              <View style={styles.quoteSeed}>
                <Text>🌱</Text>
              </View>
              <View style={styles.quoteLine} />
            </View>
          </View>
        )}

        {/* Past Seeds Tip - subtle reminder */}
        {!isPendingForActiveChat && (
          <View style={styles.pastSeedsTip}>
            <Text style={styles.pastSeedsTipIcon}>💡</Text>
            <Text style={styles.pastSeedsTipText}>
              {t('meditations.tips.pastSeeds')}
            </Text>
          </View>
        )}

        {/* Russian-only notice: subtle, placed lower so it doesn't steal attention */}
        {showAudioNotice && !isPendingForActiveChat && (
          <Text style={styles.audioNoticeText}>
            {t('meditations.audioNotice.title')}
          </Text>
        )}

        {/* Featured Meditation */}
        <FeaturedSection
          meditation={featuredMeditation}
          onPress={() => handleMeditationPress(featuredMeditation.id)}
          isFromChat={isSeedBasedContext}
        />

        {/* Today's Seeds Summary - hide if from chat */}
        {!isPendingForActiveChat && (
          <View style={styles.seedsSummary}>
            <Text style={styles.seedsSummaryTitle}>{t('meditations.todaysProgress')}</Text>
            <View style={styles.seedsRow}>
              <View style={styles.seedItemWide}>
                <View style={[styles.seedIcon, { backgroundColor: Colors.softSage }]}>
                  <Text>🌱</Text>
                </View>
                <Text style={styles.seedCount}>{todayStats.seedsToday}</Text>
                <Text style={styles.seedLabel}>{t('meditations.seedsPlanted')}</Text>
              </View>
              <View style={styles.seedItemWide}>
                <View style={[styles.seedIcon, { backgroundColor: Colors.cream }]}>
                  <Text>☕</Text>
                </View>
                <Text style={styles.seedCount}>{todayStats.meditationsToday}</Text>
                <Text style={styles.seedLabel}>{t('meditations.meditationsCount')}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Categories */}
        <View style={styles.categoriesSection}>
          <Text style={styles.sectionTitle}>{t('meditations.explore')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesScroll}
            contentInsetAdjustmentBehavior="never"
          >
            {categories.map(category => (
              <CategoryChip
                key={category.id}
                category={category}
                isActive={selectedCategory === category.id}
                onPress={() => setSelectedCategory(category.id)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Meditation List */}
        <View style={styles.meditationsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('meditations.allMeditations')}</Text>
            <Text style={styles.sectionCount}>{filteredMeditations.length} {t('meditations.sessions')}</Text>
          </View>

          {filteredMeditations.map((meditation, index) => (
            <MeditationCard
              key={meditation.id}
              meditation={meditation}
              index={index}
              onPress={() => handleMeditationPress(meditation.id)}
              isRecommended={isSeedBasedContext && meditation.id === seedBasedRecommendedId}
              premiumLocked={!isPremium && meditation.id !== '4'}
            />
          ))}
        </View>

        {/* Bottom spacing for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  greeting: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSize3XL,
    color: Colors.textPrimary,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    ...Shadows.sm,
    gap: 4,
  },
  streakEmoji: {
    fontSize: 16,
  },
  streakCount: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
  },
  streakStart: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
  },
  streakLabel: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
  },

  premiumCrownButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  premiumCrownButtonFree: {
    backgroundColor: Colors.cream,
    borderColor: Colors.borderLight,
  },
  premiumCrownButtonActive: {
    backgroundColor: Colors.softSage,
    borderColor: Colors.softSage,
  },
  premiumCrownIcon: {
    fontSize: 16,
  },

  premiumBanner: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Shadows.sm,
  },
  premiumBannerLeft: { flex: 1, paddingRight: Spacing.md },
  premiumBannerTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeLG,
    color: Colors.espresso,
    marginBottom: 4,
  },
  premiumBannerBody: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
  },
  premiumBannerCta: {
    backgroundColor: Colors.espresso,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  premiumBannerCtaText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: 12,
    color: '#fff',
  },
  
  // Streak Tooltip
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  tooltipContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    maxWidth: 320,
    ...Shadows.lg,
  },
  tooltipTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeXL,
    color: Colors.espresso,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  tooltipText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  tooltipStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  tooltipStat: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  tooltipStatNumber: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSize2XL,
    color: Colors.mocha,
  },
  tooltipStatLabel: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    marginTop: 2,
  },
  tooltipStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border,
  },
  tooltipButton: {
    backgroundColor: Colors.mocha,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  tooltipButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.cream,
  },
  
  // From Chat Banner
  fromChatBanner: {
    backgroundColor: Colors.softSage,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: Colors.sage,
  },
  fromChatBannerText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.espresso,
    lineHeight: 20,
  },

  // Russian Audio Notice (subtle)
  audioNoticeText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  
  quoteContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  quoteText: {
    fontFamily: Typography.fontFamilyHeadingItalic,
    fontSize: Typography.fontSizeLG,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 28,
  },
  quoteDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  quoteLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  quoteSeed: {
    marginHorizontal: Spacing.md,
  },
  pastSeedsTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  pastSeedsTipIcon: {
    fontSize: 18,
    marginTop: 2,
  },
  pastSeedsTipText: {
    flex: 1,
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  featuredContainer: {
    marginBottom: Spacing.lg,
  },
  featuredCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    minHeight: 180,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  featuredPattern: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  patternCircle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.cream,
    top: -30,
  },
  featuredContent: {
    flex: 1,
    zIndex: 1,
  },
  featuredBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(212, 165, 116, 0.3)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  featuredBadgeFromChat: {
    backgroundColor: 'rgba(144, 179, 126, 0.4)',
  },
  featuredBadgeText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: Colors.cream,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  featuredMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  featuredTextContent: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  featuredTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeXL,
    color: Colors.cream,
    marginBottom: Spacing.xs,
  },
  featuredSubtitle: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
    opacity: 0.95,
  },
  featuredPlay: {
    alignItems: 'center',
  },
  featuredPlayButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.md,
  },
  featuredPlayIcon: {
    fontSize: 20,
    color: Colors.espresso,
    marginLeft: 4,
  },
  featuredDuration: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: Colors.cream,
    opacity: 0.95,
    marginTop: Spacing.xs,
  },
  featuredDescription: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
    opacity: 0.95,
    lineHeight: 20,
  },
  featuredFromChatHint: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: Colors.cream,
    opacity: 0.95,
    marginTop: Spacing.sm,
  },
  featuredCoffee: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    opacity: 0.15,
  },
  featuredCoffeeEmoji: {
    fontSize: 80,
  },
  seedsSummary: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  seedsSummaryTitle: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  seedsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  seedItem: {
    alignItems: 'center',
  },
  seedItemWide: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  seedIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  seedCount: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeXL,
    color: Colors.textPrimary,
  },
  seedLabel: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    marginTop: 2,
  },
  categoriesSection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeXL,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  categoriesScroll: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  categoryChipActive: {
    backgroundColor: Colors.mocha,
    borderColor: Colors.mocha,
  },
  categoryIcon: {
    fontSize: 14,
  },
  categoryLabel: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
  },
  categoryLabelActive: {
    color: Colors.cream,
  },
  meditationsSection: {
    marginTop: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionCount: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
  },
  cardContainer: {
    marginBottom: Spacing.md,
  },
  recommendedCardContainer: {
    marginBottom: Spacing.lg,
  },
  recommendedBadge: {
    backgroundColor: Colors.sage,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
  },
  recommendedBadgeText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: Colors.surface,
  },
  card: {
    borderRadius: BorderRadius.xl,
    minHeight: 160,
    overflow: 'hidden',
    ...Shadows.md,
  },
  recommendedCard: {
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  recommendedPlayButton: {
    backgroundColor: Colors.gold,
  },
  cardDecor: {
    ...StyleSheet.absoluteFillObject,
  },
  decorCircle1: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    right: -20,
    top: -20,
  },
  decorCircle2: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    right: 40,
    bottom: -10,
  },
  decorLine: {
    position: 'absolute',
    width: 1,
    height: '70%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    right: 70,
    top: '15%',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(44, 24, 16, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderRadius: BorderRadius.xl,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  lockIcon: {
    fontSize: 16,
  },
  lockText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
  },
  cardContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  durationBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  durationText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: Colors.cream,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 14,
    color: Colors.cream,
    marginLeft: 3,
  },
  cardBody: {
    flex: 1,
  },
  cardCategory: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  cardTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeLG,
    color: Colors.cream,
    marginBottom: Spacing.sm,
  },
  cardDescription: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
  },
  coffeeDecor: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.md,
    opacity: 0.15,
  },
  coffeeEmoji: {
    fontSize: 50,
  },
});
