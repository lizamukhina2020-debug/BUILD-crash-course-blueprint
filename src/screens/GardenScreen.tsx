import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Animated,
  Dimensions,
  StatusBar,
  RefreshControl,
  Modal,
  Easing,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  InteractionManager,
} from 'react-native';
import { showAlert } from '../utils/crossPlatformAlert';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CommonActions, useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import * as Font from 'expo-font';
import { MainTabParamList, RootStackParamList } from '../navigation/AppNavigator';
import { takeFirstGrapheme } from '../utils/grapheme';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { detectCategory } from '../constants/seedOptions';
import {
  getAllConversations,
  setActiveChatId,
  setForceOpenChatId,
  updateConversation,
  type ChatConversation,
} from '../services/chatStorage';
import { getFirebaseAuth } from '../services/firebase';
import { subscribeCloudRestore } from '../services/cloudRestoreEvents';
import {
  getAllGardenSeeds,
  getGardenStats,
  ensureGardenSeedsLocalized,
  harvestProblem,
  deleteProblem,
  deleteSeed,
  updateGardenSeedAction,
  getHarvestStoryForConversation,
  restoreDeletedProblemSnapshot,
  DeletedProblemSnapshot,
  updateGardenSeedsCategoryForConversation,
  updateHarvestStoryCategoryForConversation,
  updatePendingMeditationCategoryForConversation,
  GardenSeed,
  GardenStats,
  GrowthStage,
  HarvestStory,
  HarvestEmotion,
  GROWTH_STAGE_EMOJIS,
  CATEGORY_NAMES,
  CATEGORY_EMOJIS,
  CATEGORY_TO_MEDITATION,
  HARVEST_EMOTIONS,
} from '../services/meditationStorage';
import { deleteJourneyEverywhere } from '../services/journeyDeletion';
import { meditations, type Meditation } from '../constants/meditations';
import { getEffectivePremiumFlag } from '../services/subscriptionGate';

/** Free tier: only Daily Gratitude Brew in "Other goal" journey meditation picker (matches Meditations tab gating). */
const FREE_OTHER_GOAL_MEDITATION_ID = '4';

const freeTierOtherGoalMeditationChoices = (): Meditation[] =>
  meditations.filter((m) => m.id === FREE_OTHER_GOAL_MEDITATION_ID);

const CATEGORY_PROMPT_DISMISSED_KEY = 'seedmind_category_prompt_dismissed_v1';
const GROWTH_HINT_DISMISSED_SEEDCOUNT_KEY = 'seedmind_garden_growth_hint_dismissed_seedcount_v1';
const GROWTH_STAGE_CONGRATS_SEEN_KEY = 'seedmind_garden_growth_stage_congrats_seen_v1';
const GENERAL_CATEGORY_LABELS_KEY = 'seedmind_general_category_labels_v1';

// Enable LayoutAnimation on Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Helper to get meditation info for a category
const getMeditationForCategory = (category: string, journeyMeditationId?: string) => {
  const meditationId =
    (journeyMeditationId && meditations.some((m) => m.id === journeyMeditationId)
      ? journeyMeditationId
      : null) ||
    CATEGORY_TO_MEDITATION[category] ||
    CATEGORY_TO_MEDITATION.general;
  const meditation = meditations.find(m => m.id === meditationId);
  return meditation || meditations.find(m => m.id === '4'); // Fallback to Daily Gratitude Brew
};

// Strip leading emojis/symbols without breaking Cyrillic titles.
// NOTE: JS \w is ASCII-only, so older regexes were removing first Russian words (e.g., "Победить ...").
const stripLeadingSymbols = (title: string) =>
  (title || '').replace(/^[^\p{L}\p{N}]+\s*/u, '').trim();

const { width } = Dimensions.get('window');

// ===================
// COMPONENTS
// ===================

function MoreMenuIcon() {
  // If fonts failed to load and the user chose "Continue without fonts",
  // vector-icons can render as blank. Fall back to a plain glyph so the menu
  // is always visible.
  const [iconReady, setIconReady] = useState(() => Font.isLoaded('MaterialIcons'));

  useEffect(() => {
    if (iconReady) return;
    let alive = true;
    const t = setInterval(() => {
      if (!alive) return;
      const loaded = Font.isLoaded('MaterialIcons');
      if (loaded) {
        setIconReady(true);
        clearInterval(t);
      }
    }, 500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [iconReady]);

  if (!iconReady) {
    return <Text style={styles.categoryMenuFallbackText}>⋯</Text>;
  }
  return (
    <MaterialIcons
      name="more-horiz"
      size={20}
      color={Colors.textPrimary}
      style={{ position: 'relative', top: 2 }}
    />
  );
}

// Animated Stat Card Component
const AnimatedStatCard = ({ 
  emoji, 
  value, 
  label, 
  color,
  delay = 0,
}: { 
  emoji: string; 
  value: number | string; 
  label: string; 
  color: string;
  delay?: number;
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        delay,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        delay,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, []);

  return (
    <Animated.View 
      style={[
        styles.statCard, 
        { 
          borderLeftColor: color,
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }, { translateY }],
        }
      ]}
    >
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
};

// Growth Stage Badge
const GrowthStageBadge = ({ stage }: { stage: GrowthStage }) => {
  const { t } = useTranslation();
  const stageColors: Record<GrowthStage, string> = {
    seed: Colors.latte,
    sprout: Colors.softSage,
    seedling: Colors.sage,
    blooming: Colors.gold,
    harvested: Colors.copper,
  };

  return (
    <View style={[styles.growthBadge, { backgroundColor: stageColors[stage] }]}>
      <Text style={styles.growthBadgeEmoji}>{GROWTH_STAGE_EMOJIS[stage]}</Text>
      <Text style={styles.growthBadgeText}>{t(`garden.growth.${stage}`)}</Text>
    </View>
  );
};

// Format date helper (localized)
const formatDate = (dateString: string, t: any, locale: 'en' | 'ru') => {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return t('common.today');
  if (diffDays === 1) return t('common.yesterday');
  if (diffDays < 7) return t('common.daysAgo', { count: diffDays });
  return date.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric' });
};

// Compact Seed Card Component with press animation and expandable text
const CompactSeedCard = ({ 
  seed, 
  index = 0,
  disabled = false,
  onEdit,
  onDelete,
}: { 
  seed: GardenSeed; 
  index?: number;
  disabled?: boolean;
  onEdit?: (seed: GardenSeed) => void;
  onDelete?: (seed: GardenSeed) => void;
}) => {
  const { t, i18n } = useTranslation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-20)).current;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const [actionWidth, setActionWidth] = useState(0);
  const locale = i18n.language === 'ru' ? 'ru' : 'en';
  const displayAction = seed.actionByLocale?.[locale] ?? seed.action;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 300,
        delay: index * 50,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start();
  }, []);

  const handlePress = () => {
    if (disabled) return;
    if (isTruncated || isExpanded) {
      setIsExpanded(!isExpanded);
    }
  };

  // Robust truncation detection:
  // Measure the FULL text line count (hidden) and show "tap to read more" only when it exceeds 2 lines.
  // This avoids false positives from length heuristics.
  const handleFullTextLayout = (e: any) => {
    const lines = e?.nativeEvent?.lines;
    const n = Array.isArray(lines) ? lines.length : 0;
    const next = n > 2;
    setIsTruncated((prev) => (prev === next ? prev : next));
  };

  return (
    <TouchableOpacity
      activeOpacity={!disabled && (isTruncated || isExpanded) ? 0.7 : 1}
      onPress={handlePress}
      disabled={disabled}
    >
      <Animated.View 
        style={[
          styles.compactSeedCard,
          seed.harvested && styles.compactSeedCardHarvested,
          isExpanded && styles.compactSeedCardExpanded,
          {
            opacity: fadeAnim,
            transform: [{ translateX }],
          }
        ]}
      >
        <View style={styles.compactSeedTop}>
          <View style={styles.compactSeedStage}>
            <Text style={styles.compactStageEmoji}>{GROWTH_STAGE_EMOJIS[seed.growthStage]}</Text>
          </View>
          <View
            style={styles.compactSeedActionContainer}
            onLayout={(e) => {
              const w = e?.nativeEvent?.layout?.width ?? 0;
              if (w && Math.abs(w - actionWidth) > 2) setActionWidth(w);
            }}
          >
            <Text 
              style={styles.compactSeedAction} 
              numberOfLines={isExpanded ? undefined : 2}
            >
              {displayAction}
            </Text>
            {isTruncated && !isExpanded && (
              <Text style={styles.tapToReadMore}>{t('garden.seedCard.tapToReadMore')}</Text>
            )}
            {isExpanded && isTruncated && (
              <Text style={styles.tapToReadMore}>{t('garden.seedCard.tapToCollapse')}</Text>
            )}

            {/* Hidden full-text measurer to detect actual truncation. */}
            {actionWidth > 0 ? (
              <Text
                style={[
                  styles.compactSeedAction,
                  { position: 'absolute', opacity: 0, zIndex: -1, width: actionWidth },
                ]}
                numberOfLines={undefined}
                onTextLayout={handleFullTextLayout}
              >
                {displayAction}
              </Text>
            ) : null}
          </View>
          {seed.harvested && (
            <View style={styles.compactHarvestedBadge}>
              <Text style={styles.compactHarvestedText}>✨</Text>
            </View>
          )}
        </View>
        
        <View style={styles.compactSeedBottom}>
          <View style={styles.compactSeedMeta}>
            <Text style={styles.compactSeedDate}>{formatDate(seed.datePlanted, t, locale)}</Text>
            <Text style={styles.compactSeedDot}>•</Text>
            <Text style={styles.compactSeedWatered}>💧{seed.daysWatered}</Text>
          </View>
          <View style={styles.compactSeedActions}>
            <TouchableOpacity
              style={styles.compactSeedIconButton}
              onPress={(e: any) => {
                try {
                  e?.stopPropagation?.();
                } catch {}
                if (disabled) return;
                onEdit?.(seed);
              }}
              activeOpacity={0.85}
              disabled={disabled}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.edit', { defaultValue: 'Edit' })}
            >
              <MaterialIcons name="edit" size={16} color={Colors.mocha} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.compactSeedIconButton}
              onPress={(e: any) => {
                try {
                  e?.stopPropagation?.();
                } catch {}
                if (disabled) return;
                onDelete?.(seed);
              }}
              activeOpacity={0.85}
              disabled={disabled}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={i18n.language === 'ru' ? 'Удалить' : 'Delete'}
            >
              <MaterialIcons name="delete-outline" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

// Problem Section Component (Collapsible) - groups seeds by conversation/problem
const CategorySection = ({
  conversationId,
  problemTitle,
  category,
  generalCategoryLabel,
  seeds,
  isExpanded,
  onToggle,
  onHarvestProblem,
  onDeleteProblem,
  onEditCategory,
  seedCardDisabled,
  onEditSeed,
  onDeleteSeed,
  onOpenChat,
  onOpenActionsMenu,
  showCategoryPrompt,
  onChooseCategory,
  onDismissCategoryPrompt,
  onMeditate,
  harvestStory,
  journeyDisplayEmoji,
  journeyMeditationId,
  index = 0,
}: {
  conversationId: string;
  problemTitle: string;
  category: string;
  generalCategoryLabel?: string;
  journeyDisplayEmoji?: string;
  journeyMeditationId?: string;
  seeds: GardenSeed[];
  isExpanded: boolean;
  onToggle: () => void;
  onHarvestProblem: () => void;
  onDeleteProblem: () => void;
  onEditCategory: () => void;
  seedCardDisabled?: boolean;
  onEditSeed?: (seed: GardenSeed) => void;
  onDeleteSeed?: (seed: GardenSeed) => void;
  onOpenChat?: () => void;
  onOpenActionsMenu?: (args: {
    title: string;
    canHarvest: boolean;
    onHarvest: () => void;
    onChooseCategory: () => void;
    onDelete: () => void;
  }) => void;
  showCategoryPrompt: boolean;
  onChooseCategory: () => void;
  onDismissCategoryPrompt: () => void;
  onMeditate: (meditationId: string) => void;
  harvestStory?: HarvestStory | null;
  index?: number;
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru' : 'en';

  // "Other" (general): only show an emoji if the user picked one; otherwise leave the slot empty.
  const categoryEmoji =
    category === 'general'
      ? (journeyDisplayEmoji || '').trim()
      : CATEGORY_EMOJIS[category] || '✨';
  const defaultCategoryName = t(`categories.${category}`) || t('categories.general');
  const categoryName =
    category === 'general' && (generalCategoryLabel || '').trim()
      ? (generalCategoryLabel || '').trim()
      : defaultCategoryName;
  // Clean problem title (remove emoji prefix if present)
  const cleanProblemTitle = stripLeadingSymbols(problemTitle);
  // Show full title when expanded, truncated when collapsed
  const displayTitle = isExpanded 
    ? cleanProblemTitle || categoryName
    : (cleanProblemTitle.length > 40 
        ? cleanProblemTitle.substring(0, 40) + '...' 
        : cleanProblemTitle) || categoryName;
  const harvestedCount = seeds.filter(s => s.harvested).length;
  const allHarvested = harvestedCount === seeds.length && seeds.length > 0;
  const hasUnharvestedSeeds = harvestedCount < seeds.length;
  
  // Get emotion info if there's a story
  const emotionInfo = harvestStory?.emotion 
    ? HARVEST_EMOTIONS.find(e => e.key === harvestStory.emotion)
    : null;
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Get the recommended meditation for this category (Other goal can override)
  const recommendedMeditation = getMeditationForCategory(category, journeyMeditationId);

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay: index * 100,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }),
    ]).start();
  }, []);

  // Rotation animation for expand/collapse
  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isExpanded]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();
  };

  return (
    <Animated.View 
      style={[
        styles.categorySection,
        allHarvested && styles.categorySectionHarvested,
        { 
          opacity: fadeAnim,
          transform: [{ translateY }, { scale: scaleAnim }],
        }
      ]}
    >
      <View style={styles.categorySectionHeader}>
        <TouchableOpacity
          style={styles.categorySectionLeftPress}
          onPress={onToggle}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={0.9}
        >
        <View style={styles.categorySectionLeft}>
          <View style={styles.categorySectionEmojiSlot}>
            {categoryEmoji ? (
              <Text style={styles.categorySectionEmoji}>{categoryEmoji}</Text>
            ) : null}
          </View>
          <View style={styles.categorySectionInfo}>
            <Text style={styles.categorySectionName} numberOfLines={isExpanded ? undefined : 1}>{displayTitle}</Text>
            <Text style={styles.categorySectionCount} numberOfLines={1} ellipsizeMode="tail">
              {categoryName} • {seeds.length} {t('garden.problem.seeds', { count: seeds.length })}
              {allHarvested && ` • 🌟 ${t('garden.problem.solved')}`}
            </Text>
          </View>
        </View>
        </TouchableOpacity>
        
        <View style={styles.categorySectionRight}>
          {Platform.OS === 'web' ? (
            <>
          {/* Harvest button - only show if there are unharvested seeds */}
          {hasUnharvestedSeeds && (
            <TouchableOpacity 
              style={styles.categoryHarvestButton}
              onPress={(e) => {
                e.stopPropagation();
                onHarvestProblem();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.categoryHarvestText}>🌟 {t('garden.actions.harvest')}</Text>
            </TouchableOpacity>
          )}
              {/* Edit category button */}
              <TouchableOpacity
                style={styles.categoryEditButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onEditCategory();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.categoryEditText}>{t('garden.categoryPrompt.chooseCategory')}</Text>
              </TouchableOpacity>
          {/* Delete button - always available */}
          <TouchableOpacity 
            style={styles.categoryDeleteButton}
            onPress={(e) => {
              e.stopPropagation();
              onDeleteProblem();
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.categoryDeleteText}>🗑️</Text>
          </TouchableOpacity>
            </>
          ) : (
            <>
              {onOpenChat ? (
                <TouchableOpacity
                  style={styles.categoryChatButton}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    onOpenChat();
                  }}
                  activeOpacity={0.8}
                  hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  accessibilityRole="button"
                  accessibilityLabel={i18n.language === 'ru' ? 'Открыть чат' : 'Open chat'}
                >
                  <MaterialIcons name="chat-bubble-outline" size={18} color={Colors.textPrimary} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.categoryMenuButton}
                onPress={(e) => {
                  onOpenActionsMenu?.({
                    title: cleanProblemTitle || categoryName,
                    canHarvest: hasUnharvestedSeeds,
                    onHarvest: onHarvestProblem,
                    onChooseCategory: onEditCategory,
                    onDelete: onDeleteProblem,
                  });
                }}
                activeOpacity={0.8}
              >
                <MoreMenuIcon />
              </TouchableOpacity>
            </>
          )}
          <Animated.Text style={[styles.categorySectionArrow, { transform: [{ rotate: rotation }] }]}>
            ▼
          </Animated.Text>
        </View>
      </View>

      {/* Category prompt (no "switch" wording) */}
      {showCategoryPrompt && (
        <View style={styles.categoryPrompt}>
          <Text style={styles.categoryPromptText}>{t('garden.categoryPrompt.title')}</Text>
          <View style={styles.categoryPromptButtons}>
            <TouchableOpacity
              style={styles.categoryPromptPrimary}
              onPress={onChooseCategory}
              activeOpacity={0.85}
            >
              <Text style={styles.categoryPromptPrimaryText}>{t('garden.categoryPrompt.chooseCategory')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.categoryPromptSecondary}
              onPress={onDismissCategoryPrompt}
              activeOpacity={0.85}
            >
              <Text style={styles.categoryPromptSecondaryText}>{t('garden.categoryPrompt.notNow')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Meditation Button - Only show if not all harvested */}
      {recommendedMeditation && !allHarvested && (
        <TouchableOpacity
          style={styles.meditationButton}
          onPress={() => onMeditate(recommendedMeditation.id)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={(recommendedMeditation.imageGradient as [string, string]) || [Colors.mocha, Colors.espresso]}
            style={styles.meditationButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.meditationButtonIcon}>☕</Text>
            <View style={styles.meditationButtonTextContainer}>
              <Text style={styles.meditationButtonTitle} numberOfLines={1}>
                {t(`meditations.items.${recommendedMeditation.id}.title`, {
                  defaultValue: recommendedMeditation.title,
                })}
              </Text>
              <Text style={styles.meditationButtonSubtitle}>
                {t('garden.actions.waterSeeds')} →
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Harvest Story - Show when harvested */}
      {allHarvested && harvestStory && (harvestStory.story || harvestStory.emotion) && (
        <View style={styles.harvestStoryCard}>
          {harvestStory.story && (
            <Text style={styles.harvestStoryText}>"{harvestStory.story}"</Text>
          )}
          <View style={styles.harvestStoryMeta}>
            {emotionInfo && (
              <View style={styles.harvestStoryEmotion}>
                <Text style={styles.harvestStoryEmotionEmoji}>{emotionInfo.emoji}</Text>
                <Text style={styles.harvestStoryEmotionText}>{t(`emotions.${emotionInfo.key}`)}</Text>
              </View>
            )}
            <Text style={styles.harvestStoryDate}>
              {new Date(harvestStory.harvestedDate).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              })}
            </Text>
          </View>
        </View>
      )}
      
      {isExpanded && (
        <View style={styles.categorySectionContent}>
          {seeds.map((seed, seedIndex) => (
            <CompactSeedCard
              key={seed.id}
              seed={seed}
              index={seedIndex}
              disabled={!!seedCardDisabled}
              onEdit={onEditSeed}
              onDelete={onDeleteSeed}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
};

// Animated Growth Stage Circle
const AnimatedGrowthStage = ({ 
  stage, 
  count, 
  delay,
}: { 
  stage: GrowthStage; 
  count: number; 
  delay: number;
}) => {
  const { t } = useTranslation();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 6,
      }),
    ]).start();

    // Add a subtle pulse if there are seeds in this stage
    if (count > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(bounceAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
        ])
      ).start();
    }
  }, [count]);

  const pulseScale = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  return (
    <Animated.View 
      style={[
        styles.growthStageItem,
        { transform: [{ scale: scaleAnim }] }
      ]}
    >
      <Animated.View style={[
        styles.growthStageCircle,
        count > 0 && styles.growthStageCircleActive,
        { transform: [{ scale: count > 0 ? pulseScale : 1 }] }
      ]}>
        <Text style={styles.growthStageEmoji}>{GROWTH_STAGE_EMOJIS[stage]}</Text>
      </Animated.View>
      <Text style={styles.growthStageCount}>{count}</Text>
      <Text style={styles.growthStageLabel}>{t(`garden.growth.${stage}`)}</Text>
    </Animated.View>
  );
};

// Growth Journey Visualization
const GrowthJourney = ({
  stats,
  showSeedHint = false,
  onDismissSeedHint,
  stageCongrats,
}: {
  stats: GardenStats;
  showSeedHint?: boolean;
  onDismissSeedHint?: () => void;
  stageCongrats?: { stage: GrowthStage; title: string; body: string; onClose: () => void } | null;
}) => {
  const { t } = useTranslation();
  const stages: GrowthStage[] = ['seed', 'sprout', 'seedling', 'blooming', 'harvested'];
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [rowWidth, setRowWidth] = useState(0);
  const [bubbleHeight, setBubbleHeight] = useState(0);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      delay: 200,
      useNativeDriver: true,
    }).start();
  }, []);
  
  const bubble = useMemo(() => {
    if (stageCongrats) return { ...stageCongrats };
    if (showSeedHint)
      return {
        stage: 'seed' as GrowthStage,
        title: t('garden.growthHint.title'),
        body: t('garden.growthHint.body'),
        onClose: onDismissSeedHint || (() => {}),
      };
    return null;
  }, [stageCongrats, showSeedHint, t, onDismissSeedHint]);

  const targetStageIndex = bubble ? Math.max(0, stages.indexOf(bubble.stage)) : 0;
  const anyBubbleVisible = !!bubble;

  const bubbleLayout = useMemo(() => {
    const bubbleWidth = Platform.OS === 'web' ? 232 : 204;
    const pad = 12;
    const lineWidth = 12; // must match styles.growthStageLine.width
    const available = Math.max(0, rowWidth - (stages.length - 1) * lineWidth);
    const stageSlot = stages.length > 0 ? available / stages.length : 0;
    const centerX =
      targetStageIndex * (stageSlot + lineWidth) + stageSlot / 2;
    const left = Math.min(
      Math.max(centerX - bubbleWidth / 2, pad),
      Math.max(pad, rowWidth - bubbleWidth - pad)
    );
    const tailLeft = Math.min(
      Math.max(centerX - left, 18),
      bubbleWidth - 18
    );
    return { bubbleWidth, left, tailLeft };
  }, [rowWidth, stages.length, targetStageIndex]);

  // Push the row down by the *real* bubble height so the bubble never overlaps circles/emojis.
  // Use a small fallback estimate on first render to avoid a one-frame overlap.
  const rowPadTop = anyBubbleVisible ? ((bubbleHeight || 76) + 6) : 0;
  
  return (
    <Animated.View
      style={[
        styles.growthJourney,
        { opacity: fadeAnim },
      ]}
    >
      <Text style={styles.growthJourneyTitle}>{t('garden.growthJourney')}</Text>
      <View
        style={[styles.growthJourneyRowWrap, anyBubbleVisible && { paddingTop: rowPadTop }]}
        onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
      >
        {!!bubble && rowWidth > 0 && (
          <View
            style={[
              styles.growthHintBubbleFloating,
              { width: bubbleLayout.bubbleWidth, left: bubbleLayout.left },
            ]}
            onLayout={(e) => setBubbleHeight(e.nativeEvent.layout.height)}
          >
            <TouchableOpacity
              style={styles.growthHintClose}
              onPress={bubble.onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.growthHintCloseText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.growthHintTitle}>{bubble.title}</Text>
            <Text style={styles.growthHintBody}>{bubble.body}</Text>
            <View style={[styles.growthHintTailFloating, { left: bubbleLayout.tailLeft }]} />
          </View>
        )}

      <View style={styles.growthJourneyRow}>
        {stages.map((stage, index) => (
          <React.Fragment key={stage}>
            <AnimatedGrowthStage 
              stage={stage} 
              count={stats.seedsByStage[stage]} 
                delay={300 + index * 100}
            />
              {index < stages.length - 1 && <View style={styles.growthStageLine} />}
          </React.Fragment>
        ))}
        </View>
      </View>
    </Animated.View>
  );
};

// Empty Seeds Message with gentle animation
const EmptySeedsMessage = () => {
  const { t } = useTranslation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
    ]).start();

    // Gentle floating animation for emoji
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -8,
          duration: 1500,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View 
      style={[
        styles.emptySeedsMessage, 
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
      ]}
    >
      <Animated.Text 
        style={[
          styles.emptySeedsEmoji, 
          { transform: [{ translateY: bounceAnim }] }
        ]}
      >
        🌱
      </Animated.Text>
      <Text style={styles.emptySeedsTitle}>{t('garden.empty.title')}</Text>
      <Text style={styles.emptySeedsText}>
        {t('garden.empty.message')}
      </Text>
    </Animated.View>
  );
};

// Filter Tabs
const FilterTabs = ({ 
  activeFilter, 
  onFilterChange 
}: { 
  activeFilter: 'all' | 'active' | 'harvested';
  onFilterChange: (filter: 'all' | 'active' | 'harvested') => void;
}) => {
  const { t } = useTranslation();
  const filters: { key: 'all' | 'active' | 'harvested'; label: string }[] = [
    { key: 'all', label: t('garden.filters.all') },
    { key: 'active', label: t('garden.filters.growing') },
    { key: 'harvested', label: t('garden.filters.harvested') },
  ];

  return (
    <View style={styles.filterTabs}>
      {filters.map(filter => (
        <TouchableOpacity
          key={filter.key}
          style={[styles.filterTab, activeFilter === filter.key && styles.filterTabActive]}
          onPress={() => onFilterChange(filter.key)}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterTabText, activeFilter === filter.key && styles.filterTabTextActive]}>
            {filter.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

// Harvest Celebration Modal
const HarvestCelebrationModal = ({
  visible,
  category,
  seedCount,
  onSave,
  onSkip,
}: {
  visible: boolean;
  category: string;
  seedCount: number;
  onSave: (story: string | null, emotion: HarvestEmotion | null) => void;
  onSkip: () => void;
}) => {
  const { t } = useTranslation();
  const [story, setStory] = useState('');
  const [selectedEmotion, setSelectedEmotion] = useState<HarvestEmotion | null>(null);
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const categoryName = t(`categories.${category}`) || t('categories.general');
  const categoryEmoji = CATEGORY_EMOJIS[category] || '✨';

  useEffect(() => {
    if (visible) {
      // Reset state when modal opens
      setStory('');
      setSelectedEmotion(null);
      
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const handleSave = () => {
    onSave(story.trim() || null, selectedEmotion);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView 
        style={styles.harvestModalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View
          style={[
            styles.harvestModalContainer,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={[Colors.softSage, Colors.cream]}
            style={styles.harvestModalGradient}
          >
            <ScrollView 
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {/* Header */}
              <View style={styles.harvestModalHeader}>
                <Text style={styles.harvestModalEmoji}>🌾</Text>
                <Text style={styles.harvestModalTitle}>{t('garden.harvest.title')}</Text>
                <Text style={styles.harvestModalSubtitle}>
                  {t('garden.harvest.subtitle', { emoji: categoryEmoji, category: categoryName })}
                </Text>
                <Text style={styles.harvestModalSeedCount}>
                  {t('garden.harvest.seedCount', { count: seedCount })}
                </Text>
              </View>

              {/* Story Input */}
              <View style={styles.harvestStorySection}>
                <Text style={styles.harvestStoryLabel}>{t('garden.harvest.storyLabel')}</Text>
                <Text style={styles.harvestStoryHint}>{t('garden.harvest.storyHint')}</Text>
                <TextInput
                  style={styles.harvestStoryInput}
                  placeholder={t('garden.harvest.storyPlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  value={story}
                  onChangeText={setStory}
                  autoCorrect
                  spellCheck
                  autoCapitalize="sentences"
                  multiline
                  maxLength={1000}
                  textAlignVertical="top"
                />
              </View>

              {/* Emotion Selector */}
              <View style={styles.harvestEmotionSection}>
                <Text style={styles.harvestEmotionLabel}>{t('garden.harvest.emotionLabel')}</Text>
                <View style={styles.harvestEmotionGrid}>
                  {HARVEST_EMOTIONS.map((emotion) => (
                    <TouchableOpacity
                      key={emotion.key}
                      style={[
                        styles.harvestEmotionButton,
                        selectedEmotion === emotion.key && styles.harvestEmotionButtonSelected,
                      ]}
                      onPress={() => setSelectedEmotion(
                        selectedEmotion === emotion.key ? null : emotion.key
                      )}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.harvestEmotionEmoji}>{emotion.emoji}</Text>
                      <Text style={[
                        styles.harvestEmotionText,
                        selectedEmotion === emotion.key && styles.harvestEmotionTextSelected,
                      ]}>
                        {t(`emotions.${emotion.key}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Buttons */}
              <View style={styles.harvestModalButtons}>
                <TouchableOpacity
                  style={styles.harvestSkipButton}
                  onPress={onSkip}
                  activeOpacity={0.7}
                >
                  <Text style={styles.harvestSkipButtonText}>{t('common.skip')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.harvestSaveButton}
                  onPress={handleSave}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[Colors.gold, Colors.warmGold]}
                    style={styles.harvestSaveButtonGradient}
                  >
                    <Text style={styles.harvestSaveButtonText}>
                      ✨ {t('garden.harvest.saveStory')}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </LinearGradient>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ===================
// MAIN SCREEN
// ===================

type GardenScreenNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Garden'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export default function GardenScreen() {
  const { t, i18n } = useTranslation();
  const isFocused = useIsFocused();
  const navigation = useNavigation<GardenScreenNavigation>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const undoBannerBottom = tabBarHeight + insets.bottom + 12;
  const [seeds, setSeeds] = useState<GardenSeed[]>([]);
  const [stats, setStats] = useState<GardenStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [isCloudRestoring, setIsCloudRestoring] = useState(false);
  const restoreOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'harvested'>('all');
  const [showStreakTooltip, setShowStreakTooltip] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const [editingSeed, setEditingSeed] = useState<GardenSeed | null>(null);
  const [editingSeedDraft, setEditingSeedDraft] = useState<string>('');
  
  // Harvest celebration modal state
  const [showHarvestModal, setShowHarvestModal] = useState(false);
  const [harvestingProblemKey, setHarvestingProblemKey] = useState<string | null>(null);
  const [harvestingConversationId, setHarvestingConversationId] = useState<string | null>(null);
  const [harvestingProblemTitle, setHarvestingProblemTitle] = useState<string>('');
  const [harvestingCategory, setHarvestingCategory] = useState<string | null>(null);
  const [harvestingSeedCount, setHarvestingSeedCount] = useState(0);
  const [harvestStories, setHarvestStories] = useState<Record<string, HarvestStory>>({});
  const [dismissedCategoryPrompts, setDismissedCategoryPrompts] = useState<Set<string>>(new Set());

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [categoryPickerConversationId, setCategoryPickerConversationId] = useState<string | null>(null);
  const [categoryPickerCurrent, setCategoryPickerCurrent] = useState<string>('general');
  const [categoryPickerGeneralLabel, setCategoryPickerGeneralLabel] = useState<string>('');
  const [journeyActions, setJourneyActions] = useState<null | {
    title: string;
    canHarvest: boolean;
    onHarvest: () => void;
    onChooseCategory: () => void;
    onDelete: () => void;
  }>(null);

  const [generalCategoryLabels, setGeneralCategoryLabels] = useState<Record<string, string>>({});
  const [showGeneralLabelModal, setShowGeneralLabelModal] = useState(false);
  const [generalLabelConversationId, setGeneralLabelConversationId] = useState<string | null>(null);
  const [generalLabelDraft, setGeneralLabelDraft] = useState<string>('');
  const [generalJourneyEmojiDraft, setGeneralJourneyEmojiDraft] = useState<string>('');
  const [generalJourneyMeditationIdDraft, setGeneralJourneyMeditationIdDraft] = useState<string>(
    CATEGORY_TO_MEDITATION.general
  );
  const [journeyCustomById, setJourneyCustomById] = useState<
    Record<string, { journeyDisplayEmoji?: string; journeyMeditationId?: string }>
  >({});
  const [growthHintDismissedSeedCount, setGrowthHintDismissedSeedCount] = useState<number>(0);
  const [stageCongrats, setStageCongrats] = useState<{ stage: GrowthStage; delta: number } | null>(null);
  const [stageCongratsSeen, setStageCongratsSeen] = useState<Record<string, number>>({
    sprout: 0,
    seedling: 0,
    blooming: 0,
    harvested: 0,
  });
  const [stageCongratsSeenLoaded, setStageCongratsSeenLoaded] = useState(false);
  const stageCongratsHasStoredRef = useRef(false);

  const [undoDelete, setUndoDelete] = useState<null | {
    snapshot: DeletedProblemSnapshot;
    title: string;
    seedCount: number;
  }>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refreshed when opening the Other-goal label modal (authoritative for that UI). Fail closed if premium check throws.
  const [otherGoalMeditationChoices, setOtherGoalMeditationChoices] = useState<Meditation[]>(freeTierOtherGoalMeditationChoices);
  const [otherGoalModalPremiumVerified, setOtherGoalModalPremiumVerified] = useState(false);

  const loadGardenData = useCallback(async () => {
    try {
      // Ensure stored seed text/journey titles exist for the current locale (translate & cache if needed).
      await ensureGardenSeedsLocalized(i18n.language);

      const premium = await getEffectivePremiumFlag();
      setIsPremium(premium);

      const [gardenSeeds, gardenStats, conversations, rawLabels] = await Promise.all([
        getAllGardenSeeds(),
        getGardenStats(),
        getAllConversations(),
        AsyncStorage.getItem(GENERAL_CATEGORY_LABELS_KEY),
      ]);
      setSeeds(gardenSeeds);
      setStats(gardenStats);

      // Load custom labels for the "general/Another goal" category.
      const labelsFromStorage: Record<string, string> = (() => {
        try {
          const parsed = rawLabels ? JSON.parse(rawLabels) : {};
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
          return {};
        }
      })();
      const labels: Record<string, string> = { ...labelsFromStorage };
      for (const c of conversations) {
        const label = (c.generalCategoryLabel || '').trim();
        if (label) labels[c.id] = label;
      }
      setGeneralCategoryLabels(labels);

      const jc: Record<string, { journeyDisplayEmoji?: string; journeyMeditationId?: string }> = {};
      for (const c of conversations) {
        jc[c.id] = {
          journeyDisplayEmoji: c.journeyDisplayEmoji,
          journeyMeditationId: c.journeyMeditationId,
        };
      }
      setJourneyCustomById(jc);
      
      // Load harvest stories for each category
      // Load harvest stories by conversationId
      const conversationIds = [...new Set(gardenSeeds.map(s => s.conversationId || `legacy_${s.category}`))];
      const stories: Record<string, HarvestStory> = {};
      for (const convId of conversationIds) {
        const story = await getHarvestStoryForConversation(convId);
        if (story) {
          stories[convId] = story;
        }
      }
      setHarvestStories(stories);
    } catch (error) {
      console.error('Error loading garden data:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [i18n.language]);

  // When cloud restore completes, reload immediately so the Garden never appears "empty" after updates.
  useEffect(() => {
    const stopOverlay = () => {
      if (restoreOverlayTimerRef.current) {
        clearTimeout(restoreOverlayTimerRef.current);
        restoreOverlayTimerRef.current = null;
      }
      setIsCloudRestoring(false);
    };

    const startOverlayWithDelay = () => {
      if (restoreOverlayTimerRef.current) return;
      restoreOverlayTimerRef.current = setTimeout(() => {
        restoreOverlayTimerRef.current = null;
        setIsCloudRestoring(true);
      }, 520);
    };

    const unsub = subscribeCloudRestore((s) => {
      const uid = getFirebaseAuth().currentUser?.uid ?? null;
      if (!uid) {
        stopOverlay();
        return;
      }
      if (s.uid !== uid) return;
      if (s.phase === 'restoring') startOverlayWithDelay();
      else stopOverlay();
      if (s.phase === 'done') {
        // Defer the reload so it doesn't jank the first render.
        InteractionManager.runAfterInteractions(() => {
          loadGardenData();
        });
      }
    });
    return () => {
      stopOverlay();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAfterInteractionsRef = useRef<any>(null);
  const scheduleLoadGardenData = useCallback(() => {
    try {
      loadAfterInteractionsRef.current?.cancel?.();
    } catch {
      // ignore
    }
    loadAfterInteractionsRef.current = InteractionManager.runAfterInteractions(() => {
      loadGardenData();
    });
  }, [loadGardenData]);

  useEffect(() => {
    return () => {
      try {
        loadAfterInteractionsRef.current?.cancel?.();
      } catch {
        // ignore
      }
    };
  }, []);

  // Load dismissed category prompts (web + native)
  useEffect(() => {
    const loadDismissed = async () => {
      try {
        const raw = await AsyncStorage.getItem(CATEGORY_PROMPT_DISMISSED_KEY);
        const ids: string[] = raw ? JSON.parse(raw) : [];
        setDismissedCategoryPrompts(new Set(ids));
      } catch {
        setDismissedCategoryPrompts(new Set());
      }
    };
    loadDismissed();
  }, []);

  // Load growth hint dismissal seed count (so we don't spam after closing)
  useEffect(() => {
    const loadGrowthHintDismissal = async () => {
      try {
        const raw = await AsyncStorage.getItem(GROWTH_HINT_DISMISSED_SEEDCOUNT_KEY);
        const n = raw ? parseInt(raw, 10) : 0;
        setGrowthHintDismissedSeedCount(Number.isFinite(n) ? n : 0);
      } catch {
        setGrowthHintDismissedSeedCount(0);
      }
    };
    loadGrowthHintDismissal();
  }, []);

  // Load "stage congrats" seen counters (so we don't spam repeats)
  useEffect(() => {
    const loadStageCongratsSeen = async () => {
      try {
        const raw = await AsyncStorage.getItem(GROWTH_STAGE_CONGRATS_SEEN_KEY);
        stageCongratsHasStoredRef.current = !!raw;
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
          setStageCongratsSeen({
            sprout: Number(parsed.sprout) || 0,
            seedling: Number(parsed.seedling) || 0,
            blooming: Number(parsed.blooming) || 0,
            harvested: Number(parsed.harvested) || 0,
          });
        }
      } catch {
        // ignore
      } finally {
        setStageCongratsSeenLoaded(true);
      }
    };
    loadStageCongratsSeen();
  }, []);

  const dismissGrowthHint = async () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const currentTotal = stats?.totalSeeds ? Number(stats.totalSeeds) : 0;
    setGrowthHintDismissedSeedCount(currentTotal);
    try {
      await AsyncStorage.setItem(GROWTH_HINT_DISMISSED_SEEDCOUNT_KEY, String(currentTotal));
    } catch {
      // ignore
    }
  };

  const shouldShowGrowthHint =
    !!stats &&
    stats.totalSeeds > 0 &&
    stats.seedsByStage.seed === stats.totalSeeds &&
    stats.totalSeeds > growthHintDismissedSeedCount &&
    !stageCongrats;

  // Trigger milestone congrats when a stage count increases
  useEffect(() => {
    if (!stats) return;
    if (!stageCongratsSeenLoaded) return;
    if (stageCongrats) return; // don't stack

    // First run after deploying this feature: initialize seen counters to current,
    // so we don't show retroactive congrats for old progress.
    if (!stageCongratsHasStoredRef.current) {
      const initial = {
        ...stageCongratsSeen,
        sprout: stats.seedsByStage.sprout || 0,
        seedling: stats.seedsByStage.seedling || 0,
        blooming: stats.seedsByStage.blooming || 0,
        harvested: stats.seedsByStage.harvested || 0,
      };
      stageCongratsHasStoredRef.current = true;
      setStageCongratsSeen(initial);
      AsyncStorage.setItem(GROWTH_STAGE_CONGRATS_SEEN_KEY, JSON.stringify(initial)).catch(() => {});
      return;
    }

    const priority: GrowthStage[] = ['harvested', 'blooming', 'seedling', 'sprout'];
    for (const stage of priority) {
      const current = stats.seedsByStage[stage] || 0;
      const seen = stageCongratsSeen[stage] || 0;
      if (current > seen) {
        setStageCongrats({ stage, delta: current - seen });
        break;
      }
    }
  }, [stats, stageCongratsSeenLoaded, stageCongrats, stageCongratsSeen]);

  const dismissStageCongrats = async () => {
    if (!stats || !stageCongrats) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const stage = stageCongrats.stage;
    const current = stats.seedsByStage[stage] || 0;
    const next = { ...stageCongratsSeen, [stage]: current };
    setStageCongratsSeen(next);
    setStageCongrats(null);
    // Avoid abrupt "bubble swap" (stageCongrats -> growth hint) that can feel like the screen jumps.
    // If the user closes a bubble, give layout a beat before showing another one.
    const currentTotal = stats?.totalSeeds ? Number(stats.totalSeeds) : 0;
    setGrowthHintDismissedSeedCount(Math.max(growthHintDismissedSeedCount, currentTotal));
    try {
      await AsyncStorage.setItem(GROWTH_STAGE_CONGRATS_SEEN_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const stageCongratsBubble = (() => {
    if (!stats || !stageCongrats) return null;
    const stageName = t(`garden.growth.${stageCongrats.stage}`);
    const countText = `${stageCongrats.delta} ${t('garden.problem.seeds', { count: stageCongrats.delta })}`;
    const title = t('garden.growthCongrats.title', { stageName, count: stageCongrats.delta });
    const body =
      stageCongrats.stage === 'harvested'
        ? t('garden.growthCongrats.bodyHarvested', { countText })
        : t('garden.growthCongrats.body', { countText, stageName });
    return { stage: stageCongrats.stage, title, body, onClose: dismissStageCongrats };
  })();

  const dismissCategoryPrompt = async (conversationId: string) => {
    setDismissedCategoryPrompts(prev => {
      const next = new Set(prev);
      next.add(conversationId);
      AsyncStorage.setItem(CATEGORY_PROMPT_DISMISSED_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  };

  const openCategoryPicker = (conversationId: string, currentCategory: string) => {
    if (isCloudRestoring) return;
    setCategoryPickerConversationId(conversationId);
    setCategoryPickerCurrent(currentCategory || 'general');
    setCategoryPickerGeneralLabel(generalCategoryLabels[conversationId] || '');
    setShowCategoryPicker(true);
  };

  const closeJourneyActions = () => setJourneyActions(null);

  const applyCategoryToJourney = async (conversationId: string, newCategory: string) => {
    try {
      if (isCloudRestoring) return;
      await updateConversation(conversationId, { category: newCategory });
      await updateGardenSeedsCategoryForConversation(conversationId, newCategory);
      await updateHarvestStoryCategoryForConversation(conversationId, newCategory);
      await updatePendingMeditationCategoryForConversation(conversationId, newCategory);
      await dismissCategoryPrompt(conversationId);
      setShowCategoryPicker(false);
      setCategoryPickerConversationId(null);
      loadGardenData();
    } catch (e) {
      console.error('Failed to apply category:', e);
      showAlert(t('common.error'), t('common.tryAgain'));
    }
  };

  const openEditSeed = (seed: GardenSeed) => {
    if (isCloudRestoring) return;
    const locale = i18n.language === 'ru' ? 'ru' : 'en';
    const current = seed.actionByLocale?.[locale] ?? seed.action;
    setEditingSeed(seed);
    setEditingSeedDraft(String(current || ''));
  };

  const saveEditedSeed = async () => {
    if (!editingSeed) return;
    const next = String(editingSeedDraft || '').trim();
    if (!next) return;
    try {
      await updateGardenSeedAction(editingSeed.id, next, i18n.language);
      setEditingSeed(null);
      setEditingSeedDraft('');
      loadGardenData();
    } catch (e) {
      console.error('Failed to update seed action:', e);
      showAlert(t('common.error'), t('common.tryAgain'));
    }
  };

  const deleteOneSeed = async (seed: GardenSeed) => {
    if (!seed?.id) return;
    if (isCloudRestoring) return;
    const title = i18n.language === 'ru' ? 'Удалить семя?' : 'Delete seed?';
    const message =
      i18n.language === 'ru'
        ? 'Это действие нельзя отменить.'
        : "This can’t be undone.";
    showAlert(title, message, [
      { text: i18n.language === 'ru' ? 'Отмена' : 'Cancel', style: 'cancel' },
      {
        text: i18n.language === 'ru' ? 'Удалить' : 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSeed(seed.id);
            // Optimistic UI update + refresh stats.
            setSeeds((prev) => prev.filter((s) => s.id !== seed.id));
            const nextStats = await getGardenStats();
            setStats(nextStats);
          } catch (e) {
            console.error('Failed to delete seed:', e);
            showAlert(t('common.error'), t('common.tryAgain'));
          }
        },
      },
    ]);
  };

  const openChatForJourney = async (conversationId: string) => {
    const cid = String(conversationId || '').trim();
    if (!cid) return;
    try {
      await setActiveChatId(cid);
      await setForceOpenChatId(cid);
    } catch {
      // ignore
    }
    try {
      navigation.navigate('Chat');
    } catch {
      try {
        navigation.dispatch(
          CommonActions.navigate({
            name: 'Main',
            params: { screen: 'Chat' },
          })
        );
      } catch {
        // ignore
      }
    }
  };

  const openGeneralLabelEditor = async (conversationId: string) => {
    const cid = String(conversationId || '').trim();
    if (!cid || isCloudRestoring) return;

    let premiumNow = false;
    try {
      premiumNow = await getEffectivePremiumFlag();
    } catch {
      premiumNow = false;
    }
    setIsPremium(premiumNow);
    setOtherGoalModalPremiumVerified(premiumNow);
    const choices = premiumNow ? meditations : freeTierOtherGoalMeditationChoices();
    setOtherGoalMeditationChoices(choices);

    let convo: ChatConversation | undefined;
    try {
      const all = await getAllConversations();
      convo = all.find((c) => c.id === cid);
    } catch {
      // ignore
    }
    const initial = (
      generalCategoryLabels[cid] ||
      categoryPickerGeneralLabel ||
      convo?.generalCategoryLabel ||
      ''
    ).trim();
    setGeneralLabelConversationId(cid);
    setGeneralLabelDraft(initial);
    const emoji = (convo?.journeyDisplayEmoji || journeyCustomById[cid]?.journeyDisplayEmoji || '').trim();
    setGeneralJourneyEmojiDraft(emoji);
    const selectableMeditationIds = new Set(choices.map((m) => m.id));
    const medIdRaw =
      convo?.journeyMeditationId ||
      journeyCustomById[cid]?.journeyMeditationId ||
      CATEGORY_TO_MEDITATION.general;
    const medId = selectableMeditationIds.has(medIdRaw)
      ? medIdRaw
      : FREE_OTHER_GOAL_MEDITATION_ID;
    setGeneralJourneyMeditationIdDraft(medId);
    setShowGeneralLabelModal(true);
  };

  const saveGeneralLabel = async () => {
    const conversationId = generalLabelConversationId;
    const namePart = (generalLabelDraft || '').trim();
    const emojiPart = (generalJourneyEmojiDraft || '').trim();
    if (!conversationId) return;
    if (!namePart && !emojiPart) {
      showAlert(t('common.error'), t('garden.generalLabel.errorNeedNameOrEmoji'));
      return;
    }
    const nextLabel = namePart || emojiPart;
    try {
      const premiumNow = await getEffectivePremiumFlag();
      const meditationToPersist =
        !premiumNow ? FREE_OTHER_GOAL_MEDITATION_ID : generalJourneyMeditationIdDraft || undefined;
      // Persist in conversation (when it exists) + fallback map for legacy conversationIds.
      await updateConversation(conversationId, {
        generalCategoryLabel: nextLabel,
        journeyDisplayEmoji: emojiPart || undefined,
        journeyMeditationId: meditationToPersist,
      });
      const nextMap = { ...generalCategoryLabels, [conversationId]: nextLabel };
      setGeneralCategoryLabels(nextMap);
      await AsyncStorage.setItem(GENERAL_CATEGORY_LABELS_KEY, JSON.stringify(nextMap));
      setJourneyCustomById((prev) => ({
        ...prev,
        [conversationId]: {
          journeyDisplayEmoji: emojiPart || undefined,
          journeyMeditationId: meditationToPersist,
        },
      }));

      setShowGeneralLabelModal(false);
      setGeneralLabelConversationId(null);
      // Refresh picker name immediately if user reopens
      setCategoryPickerGeneralLabel(nextLabel);
      loadGardenData();
    } catch (e) {
      console.error('Failed to save general label:', e);
      showAlert(t('common.error'), t('common.tryAgain'));
    }
  };

  const shouldShowCategoryPromptFor = (conversationId: string, problemTitle: string, currentCategory: string) => {
    if (!conversationId) return false;
    if (dismissedCategoryPrompts.has(conversationId)) return false;
    if (currentCategory === 'safety') return false;
    const detected = detectCategory(problemTitle || '');
    if (detected === 'general') return false;
    return detected !== currentCategory;
  };

  const categoryKeysForPicker = [
    'health',
    'relationship',
    'career',
    'money',
    'peace',
    'clarity',
    'general',
  ];

  // Load data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Always start with all journey cards collapsed on entry (reduces noise).
      setExpandedCategories((prev) => (prev.size === 0 ? prev : new Set()));
      scheduleLoadGardenData();
    }, [scheduleLoadGardenData])
  );

  // Also refresh immediately when the app language changes (so Garden flips in-place).
  useEffect(() => {
    if (!isFocused) return;
    scheduleLoadGardenData();
  }, [i18n.language, isFocused, scheduleLoadGardenData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadGardenData();
  };

  const handleHarvestProblem = async (problemKey: string, problemSeeds: GardenSeed[]) => {
    if (isCloudRestoring) return;
    const firstSeed = problemSeeds[0];
    const conversationId = firstSeed?.conversationId || 'legacy';
    const locale = i18n.language === 'ru' ? 'ru' : 'en';
    const problemTitle =
      firstSeed?.problemTitleByLocale?.[locale] ||
      firstSeed?.problemTitle ||
      t(`categories.${firstSeed?.category}`, { defaultValue: t('categories.general') });
    const category = firstSeed?.category || 'general';
    const unharvestedSeeds = problemSeeds.filter(s => !s.harvested);
    
    // Clean the problem title for display
    const cleanTitle = stripLeadingSymbols(problemTitle);
    const displayTitle = cleanTitle.length > 30 ? cleanTitle.substring(0, 30) + '...' : cleanTitle;
    
    showAlert(
      t('garden.harvest.confirmTitle'),
      t('garden.harvest.confirmBody', {
        title: displayTitle,
        seedCountText: t('garden.harvest.seedCount', { count: unharvestedSeeds.length }),
      }),
      [
        { text: t('garden.harvest.confirmCancel'), style: 'cancel' },
        {
          text: t('garden.harvest.confirmAction'),
          onPress: () => {
            // Show the harvest celebration modal to capture their story
            setHarvestingProblemKey(problemKey);
            setHarvestingConversationId(conversationId);
            setHarvestingProblemTitle(problemTitle);
            setHarvestingCategory(category);
            setHarvestingSeedCount(unharvestedSeeds.length);
            setShowHarvestModal(true);
          },
        },
      ]
    );
  };
  
  const handleHarvestSave = async (story: string | null, emotion: HarvestEmotion | null) => {
    if (!harvestingConversationId || !harvestingCategory) return;
    
    await harvestProblem(
      harvestingConversationId,
      harvestingProblemTitle,
      harvestingCategory,
      story,
      emotion
    );
    setShowHarvestModal(false);
    setHarvestingProblemKey(null);
    setHarvestingConversationId(null);
    setHarvestingProblemTitle('');
    setHarvestingCategory(null);
            loadGardenData();
            
    // Show final celebration
    const cleanTitle = stripLeadingSymbols(harvestingProblemTitle);
    const displayTitle = cleanTitle.length > 30 ? cleanTitle.substring(0, 30) + '...' : cleanTitle;
    setTimeout(() => {
      showAlert(
        t('garden.harvest.completeTitle'),
        t('garden.harvest.completeBodyWithStory', { title: displayTitle }),
        [{ text: t('garden.harvest.completeButton') }]
      );
    }, 300);
  };
  
  const handleHarvestSkip = async () => {
    if (!harvestingConversationId || !harvestingCategory) return;
    
    // Clean the problem title for display
    const cleanTitle = stripLeadingSymbols(harvestingProblemTitle);
    const displayTitle = cleanTitle.length > 30 ? cleanTitle.substring(0, 30) + '...' : cleanTitle;
    
    await harvestProblem(
      harvestingConversationId,
      harvestingProblemTitle,
      harvestingCategory,
      null,
      null
    );
    setShowHarvestModal(false);
    setHarvestingProblemKey(null);
    setHarvestingConversationId(null);
    setHarvestingProblemTitle('');
    setHarvestingCategory(null);
    loadGardenData();
    
    // Show celebration without story
    setTimeout(() => {
      showAlert(
        t('garden.harvest.completeTitle'),
        t('garden.harvest.completeBodyNoStory', { title: displayTitle }),
        [{ text: t('garden.harvest.completeButton') }]
      );
    }, 300);
  };

  const handleDelete = async (seedId: string) => {
    if (isCloudRestoring) return;
    showAlert(
      t('garden.alerts.removeSeed.title'),
      t('garden.alerts.removeSeed.message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('garden.alerts.removeSeed.confirm'),
          style: 'destructive',
          onPress: async () => {
            await deleteSeed(seedId);
            loadGardenData();
          },
        },
      ]
    );
  };

  const handleDeleteProblem = async (conversationId: string, problemTitle: string, seedCount: number) => {
    if (isCloudRestoring) return;
    // Clean the problem title for display
    const cleanTitle = stripLeadingSymbols(problemTitle);
    const displayTitle = cleanTitle.length > 30 ? cleanTitle.substring(0, 30) + '...' : cleanTitle;
    
    showAlert(
      t('garden.alerts.deleteProblem.title'),
      t('garden.alerts.deleteProblem.message', { title: displayTitle, count: seedCount }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('garden.alerts.deleteProblem.confirm'),
          style: 'destructive',
          onPress: async () => {
            // Destructive delete should be final: remove this journey everywhere.
            // (We intentionally do NOT offer undo to avoid cloud restore bringing it back.)
            await deleteJourneyEverywhere(conversationId);
            loadGardenData();
          },
        },
      ]
    );
  };

  const handleUndoDelete = async () => {
    if (!undoDelete) return;
    try {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
      const snapshot = undoDelete.snapshot;
      setUndoDelete(null);
      await restoreDeletedProblemSnapshot(snapshot);
      loadGardenData();
    } catch (e) {
      console.error('Undo delete failed:', e);
      showAlert(t('common.error'), t('common.tryAgain'));
    }
  };

  const handleDismissUndo = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoDelete(null);
  };

  // Filter seeds based on active filter
  const { filteredSeeds, groupedSeeds, sortedProblemKeys } = useMemo(() => {
    const filtered: GardenSeed[] = [];
    const grouped: Record<string, GardenSeed[]> = {};
    const latestByKey: Record<string, number> = {};

    for (const seed of seeds) {
      if (activeFilter === 'active' && seed.harvested) continue;
      if (activeFilter === 'harvested' && !seed.harvested) continue;
      filtered.push(seed);

      const key = seed.conversationId || `legacy_${seed.category}`;
      (grouped[key] ||= []).push(seed);

      const ts = Date.parse(seed.datePlanted) || 0;
      const prev = latestByKey[key] ?? 0;
      if (ts > prev) latestByKey[key] = ts;
    }

    const keys = Object.keys(grouped);
    keys.sort((a, b) => (latestByKey[b] ?? 0) - (latestByKey[a] ?? 0));
    return { filteredSeeds: filtered, groupedSeeds: grouped, sortedProblemKeys: keys };
  }, [seeds, activeFilter]);

  // Toggle problem/category expansion
  const toggleProblem = (problemKey: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(problemKey)) {
        newSet.delete(problemKey);
      } else {
        newSet.add(problemKey);
      }
      return newSet;
    });
  };

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {isLoading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <Text style={styles.loadingEmoji}>🌱</Text>
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : null}
      
      {isCloudRestoring ? (
        <View style={styles.restoreBanner} pointerEvents="none">
          <View style={styles.restoreBannerCard}>
            <Text style={styles.restoreBannerText}>
              ☁️ {i18n.language === 'ru' ? 'Восстанавливаем данные…' : 'Restoring your data…'}
            </Text>
          </View>
        </View>
      ) : null}

      <FlatList
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.mocha} />
        }
        data={seeds.length === 0 || filteredSeeds.length === 0 ? [] : sortedProblemKeys}
        keyExtractor={(k) => k}
        initialNumToRender={4}
        maxToRenderPerBatch={6}
        windowSize={7}
        ListHeaderComponent={
          <>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{t('garden.sections.activeSeeds')} 🌿</Text>
            <Text style={styles.title}>{t('garden.title')}</Text>
          </View>
          <View style={styles.headerRight}>
                {stats && (
                  <TouchableOpacity style={styles.streakBadge} onPress={() => setShowStreakTooltip(true)} activeOpacity={0.8}>
                <Text style={styles.streakEmoji}>🔥</Text>
                    {stats.currentStreak > 0 ? (
                      <>
                <Text style={styles.streakCount}>{stats.currentStreak}</Text>
                        <Text style={styles.streakLabel}>{t('meditations.streak.days', { count: stats.currentStreak })}</Text>
                      </>
                    ) : (
                      <Text style={styles.streakStart}>{t('meditations.streak.start')}</Text>
                    )}
              </TouchableOpacity>
            )}
                <TouchableOpacity style={styles.settingsButton} onPress={() => navigation.navigate('Settings')} activeOpacity={0.7}>
              <Text style={styles.settingsIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

            {/* Stats Cards */}
        {stats && (
          <View style={styles.statsRow}>
                <AnimatedStatCard emoji="🌱" value={stats.totalSeeds} label={t('garden.stats.totalSeeds')} color={Colors.sage} delay={0} />
                <AnimatedStatCard emoji="📅" value={stats.seedsThisWeek} label={t('garden.stats.thisWeek')} color={Colors.mocha} delay={100} />
                <AnimatedStatCard emoji="✨" value={stats.harvestedCount} label={t('garden.stats.harvested')} color={Colors.gold} delay={200} />
          </View>
        )}

            {/* Growth Journey */}
            {stats && (
              <GrowthJourney
                stats={stats}
                showSeedHint={shouldShowGrowthHint}
                onDismissSeedHint={dismissGrowthHint}
                stageCongrats={stageCongratsBubble}
              />
            )}

            {/* Seeds List header */}
        <View style={styles.seedsSection}>
          <View style={styles.seedsSectionHeader}>
            <Text style={styles.seedsSectionTitle}>{t('garden.sections.activeSeeds')}</Text>
                <Text style={styles.seedsSectionCount}>
                  {filteredSeeds.length}{' '}
                  {activeFilter === 'harvested'
                    ? t('garden.problem.fruits', { count: filteredSeeds.length })
                    : t('garden.problem.seeds', { count: filteredSeeds.length })}
                </Text>
          </View>

              <FilterTabs activeFilter={activeFilter} onFilterChange={setActiveFilter} />

              {seeds.length === 0 ? <EmptySeedsMessage /> : null}
              {seeds.length > 0 && filteredSeeds.length === 0 ? (
            <View style={styles.noFilterResults}>
              <Text style={styles.noFilterResultsText}>
                    {activeFilter === 'harvested' ? t('garden.filters.noneHarvested') : t('garden.filters.noneInCategory')}
              </Text>
            </View>
              ) : null}
            </View>
          </>
        }
        renderItem={({ item: problemKey, index: problemIndex }) => {
          const problemSeeds = groupedSeeds[problemKey] || [];
              const firstSeed = problemSeeds[0];
              const conversationId = firstSeed?.conversationId || 'legacy';
          const locale = i18n.language === 'ru' ? 'ru' : 'en';
          const problemTitle =
            firstSeed?.problemTitleByLocale?.[locale] ||
            firstSeed?.problemTitle ||
            t(`categories.${firstSeed?.category}`, { defaultValue: t('categories.general') });
              const category = firstSeed?.category || 'general';
          const showPrompt = shouldShowCategoryPromptFor(conversationId, problemTitle, category);
              
              return (
              <CategorySection
                  key={problemKey}
                  conversationId={conversationId}
                  problemTitle={problemTitle}
                category={category}
              generalCategoryLabel={generalCategoryLabels[conversationId]}
                  seeds={problemSeeds}
                  isExpanded={expandedCategories.has(problemKey)}
                  onToggle={() => toggleProblem(problemKey)}
                  onHarvestProblem={() => handleHarvestProblem(problemKey, problemSeeds)}
                  onDeleteProblem={() => handleDeleteProblem(conversationId, problemTitle, problemSeeds.length)}
              onEditCategory={() => openCategoryPicker(conversationId, category)}
              seedCardDisabled={isCloudRestoring}
              onEditSeed={openEditSeed}
              onDeleteSeed={deleteOneSeed}
              onOpenActionsMenu={setJourneyActions}
              onOpenChat={() => openChatForJourney(conversationId)}
              journeyDisplayEmoji={journeyCustomById[conversationId]?.journeyDisplayEmoji}
              journeyMeditationId={(() => {
                const raw = journeyCustomById[conversationId]?.journeyMeditationId;
                if (
                  category === 'general' &&
                  !isPremium &&
                  raw &&
                  raw !== FREE_OTHER_GOAL_MEDITATION_ID
                ) {
                  return FREE_OTHER_GOAL_MEDITATION_ID;
                }
                return raw;
              })()}
              showCategoryPrompt={showPrompt}
              onChooseCategory={() => openCategoryPicker(conversationId, category)}
              onDismissCategoryPrompt={() => dismissCategoryPrompt(conversationId)}
                  onMeditate={(meditationId) => navigation.navigate('MeditationPlayer', { meditationId })}
                  harvestStory={harvestStories[conversationId]}
                  index={problemIndex}
              />
              );
        }}
        ListFooterComponent={
          <>
            {/* Growth Legend */}
        <View style={styles.legend}>
              <Text style={styles.legendTitle}>{t('garden.growthLegend.title')}</Text>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <Text style={styles.legendEmoji}>🌰</Text>
                  <Text style={styles.legendText}>{t('garden.growthLegend.day0')}</Text>
            </View>
            <View style={styles.legendItem}>
              <Text style={styles.legendEmoji}>🌱</Text>
                  <Text style={styles.legendText}>{t('garden.growthLegend.days1to2')}</Text>
            </View>
            <View style={styles.legendItem}>
              <Text style={styles.legendEmoji}>🪴</Text>
                  <Text style={styles.legendText}>{t('garden.growthLegend.days3to6')}</Text>
            </View>
            <View style={styles.legendItem}>
              <Text style={styles.legendEmoji}>🌸</Text>
                  <Text style={styles.legendText}>{t('garden.growthLegend.days7plus')}</Text>
            </View>
            <View style={styles.legendItem}>
              <Text style={styles.legendEmoji}>✨</Text>
                  <Text style={styles.legendText}>{t('garden.growthLegend.harvested')}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.legendHintOutside}>{t('garden.growthLegend.hint')}</Text>

        {/* Bottom spacing for tab bar */}
        <View style={{ height: 120 }} />
          </>
        }
      />

      {/* Harvest Celebration Modal */}
      <HarvestCelebrationModal
        visible={showHarvestModal}
        category={harvestingCategory || 'general'}
        seedCount={harvestingSeedCount}
        onSave={handleHarvestSave}
        onSkip={handleHarvestSkip}
      />

      {/* Category Picker Modal */}
      <Modal visible={showCategoryPicker} transparent animationType="fade" onRequestClose={() => setShowCategoryPicker(false)}>
        <TouchableOpacity style={styles.categoryPickerOverlay} activeOpacity={1} onPress={() => setShowCategoryPicker(false)}>
          <View style={styles.categoryPickerCard}>
            <Text style={styles.categoryPickerTitle}>{t('garden.categoryPicker.title')}</Text>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {categoryKeysForPicker.map((key) => {
                const emoji = CATEGORY_EMOJIS[key] || '✨';
                const generalLabel =
                  (categoryPickerConversationId && generalCategoryLabels[categoryPickerConversationId]) ||
                  categoryPickerGeneralLabel ||
                  '';
                const name =
                  key === 'general' && generalLabel.trim()
                    ? generalLabel.trim()
                    : t(`categories.${key}`, { defaultValue: key });
                const isActive = key === categoryPickerCurrent;
                const isGeneral = key === 'general';
                return (
                  <React.Fragment key={key}>
                    {isGeneral && <View style={styles.categoryPickerDivider} />}
                    <TouchableOpacity
                      style={[
                        styles.categoryPickerRow,
                        isGeneral && styles.categoryPickerRowGeneral,
                        isActive && styles.categoryPickerRowActive,
                      ]}
                      onPress={async () => {
                        if (!categoryPickerConversationId) return;
                        if (key === 'general') {
                          // Ensure category is set to general, then open rename UI.
                          if (!isActive) {
                            await applyCategoryToJourney(categoryPickerConversationId, key);
                          } else {
                            setShowCategoryPicker(false);
                            setCategoryPickerConversationId(null);
                          }
                          void openGeneralLabelEditor(categoryPickerConversationId);
                          return;
                        }
                        applyCategoryToJourney(categoryPickerConversationId, key);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.categoryPickerEmoji}>{emoji}</Text>
                      <Text
                        style={[
                          styles.categoryPickerName,
                          isGeneral && styles.categoryPickerNameGeneral,
                        ]}
                      >
                        {name}
                      </Text>
                      {isActive && <Text style={styles.categoryPickerCheck}>✓</Text>}
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Seed Modal */}
      <Modal
        visible={!!editingSeed}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setEditingSeed(null);
          setEditingSeedDraft('');
        }}
      >
        <TouchableOpacity
          style={styles.editSeedOverlay}
          activeOpacity={1}
          onPress={() => {
            setEditingSeed(null);
            setEditingSeedDraft('');
          }}
        >
          <TouchableOpacity
            style={styles.editSeedCard}
            activeOpacity={1}
            onPress={(e: any) => {
              try {
                e?.stopPropagation?.();
              } catch {}
            }}
          >
            <Text style={styles.editSeedTitle}>
              {i18n.language === 'ru' ? 'Редактировать семя' : 'Edit seed'}
            </Text>
            <TextInput
              style={styles.editSeedInput}
              value={editingSeedDraft}
              onChangeText={setEditingSeedDraft}
              placeholder={i18n.language === 'ru' ? 'Текст семени…' : 'Seed text…'}
              multiline
              autoFocus
            />
            <View style={styles.editSeedActions}>
              <TouchableOpacity
                style={styles.editSeedCancel}
                onPress={() => {
                  setEditingSeed(null);
                  setEditingSeedDraft('');
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.editSeedCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editSeedSave} onPress={saveEditedSeed} activeOpacity={0.85}>
                <Text style={styles.editSeedSaveText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Journey Actions (mobile) */}
      <Modal
        visible={!!journeyActions}
        transparent
        animationType="fade"
        onRequestClose={closeJourneyActions}
      >
        <Pressable style={styles.journeyActionsOverlay} onPress={closeJourneyActions}>
          <Pressable style={styles.journeyActionsCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.journeyActionsTitle} numberOfLines={2}>
              {journeyActions?.title || ''}
            </Text>

            {journeyActions?.canHarvest && (
              <TouchableOpacity
                style={[styles.journeyActionsRow, styles.journeyActionsRowPrimary]}
                onPress={() => {
                  const fn = journeyActions?.onHarvest;
                  closeJourneyActions();
                  fn?.();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.journeyActionsRowText}>🌟 {t('garden.actions.harvest')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.journeyActionsRow}
              onPress={() => {
                const fn = journeyActions?.onChooseCategory;
                closeJourneyActions();
                fn?.();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.journeyActionsRowText}>
                {t('garden.categoryPrompt.chooseCategory')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.journeyActionsRow, styles.journeyActionsRowDestructive]}
              onPress={() => {
                const fn = journeyActions?.onDelete;
                closeJourneyActions();
                fn?.();
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.journeyActionsRowText, styles.journeyActionsRowTextDestructive]}>
                🗑️ {t('common.delete')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.journeyActionsRow, styles.journeyActionsRowCancel]}
              onPress={closeJourneyActions}
              activeOpacity={0.85}
            >
              <Text style={styles.journeyActionsRowText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename "general" category label */}
      <Modal
        visible={showGeneralLabelModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          Keyboard.dismiss();
          setShowGeneralLabelModal(false);
        }}
      >
        <Pressable
          style={styles.categoryPickerOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setShowGeneralLabelModal(false);
          }}
        >
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
            }}
            style={styles.generalLabelCardPressable}
          >
            <View style={styles.generalLabelCard}>
              <Text style={styles.categoryPickerTitle}>{t('garden.generalLabel.title')}</Text>
              <TextInput
                value={generalLabelDraft}
                onChangeText={setGeneralLabelDraft}
                placeholder={t('garden.generalLabel.placeholder')}
                placeholderTextColor={Colors.textMuted}
                style={styles.generalLabelInput}
                  autoCorrect
                  spellCheck
                  autoCapitalize="sentences"
                autoFocus
                maxLength={48}
              />
              <Text style={styles.generalLabelSectionLabel}>{t('garden.generalLabel.emojiLabel')}</Text>
              <Text style={styles.generalLabelEmojiHint}>{t('garden.generalLabel.emojiHint')}</Text>
              <View style={styles.generalLabelEmojiFieldWrap}>
                <TextInput
                  value={generalJourneyEmojiDraft}
                  onChangeText={(txt) => setGeneralJourneyEmojiDraft(takeFirstGrapheme(txt))}
                  placeholder=""
                  style={[
                    styles.generalLabelEmojiInput,
                    generalJourneyEmojiDraft ? styles.generalLabelEmojiInputWithValue : null,
                  ]}
                  maxLength={16}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {!generalJourneyEmojiDraft ? (
                  <Text style={styles.generalLabelEmojiPlaceholderOverlay} pointerEvents="none">
                    {t('garden.generalLabel.emojiPlaceholder')}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.generalLabelSectionLabel}>{t('garden.generalLabel.meditationLabel')}</Text>
              <ScrollView
                style={styles.generalLabelMeditationScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {otherGoalMeditationChoices.map((m) => {
                    const title = t(`meditations.items.${m.id}.title`, { defaultValue: m.title });
                    const active = generalJourneyMeditationIdDraft === m.id;
                    const lockedForFree = !otherGoalModalPremiumVerified && m.id !== FREE_OTHER_GOAL_MEDITATION_ID;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[
                          styles.generalLabelMedRow,
                          active && styles.generalLabelMedRowActive,
                          lockedForFree && styles.generalLabelMedRowDisabled,
                        ]}
                        onPress={() => {
                          if (lockedForFree) return;
                          setGeneralJourneyMeditationIdDraft(m.id);
                        }}
                        activeOpacity={lockedForFree ? 1 : 0.85}
                      >
                        <Text style={styles.generalLabelMedRowText} numberOfLines={2}>
                          {title}
                        </Text>
                        {active ? <Text style={styles.generalLabelMedCheck}>✓</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
              <View style={styles.generalLabelButtons}>
                <TouchableOpacity
                  style={[styles.generalLabelButton, styles.generalLabelButtonSecondary]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowGeneralLabelModal(false);
                  }}
                >
                  <Text style={styles.generalLabelButtonSecondaryText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.generalLabelButton} onPress={saveGeneralLabel}>
                  <Text style={styles.generalLabelButtonText}>{t('garden.generalLabel.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
            {stats && (
              <View style={styles.tooltipStats}>
                <View style={styles.tooltipStat}>
                  <Text style={styles.tooltipStatNumber}>{stats.currentStreak}</Text>
                  <Text style={styles.tooltipStatLabel}>{t('meditations.streak.currentLabel')}</Text>
                </View>
                <View style={styles.tooltipStatDivider} />
                <View style={styles.tooltipStat}>
                  <Text style={styles.tooltipStatNumber}>{stats.longestStreak}</Text>
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

      {undoDelete ? (
        <View style={[styles.undoBanner, { bottom: undoBannerBottom }]} pointerEvents="box-none">
          <View style={styles.undoBannerInner}>
            <Text style={styles.undoBannerText}>
              {t('garden.undo.deleted', { title: undoDelete.title, count: undoDelete.seedCount })}
            </Text>
            <View style={styles.undoBannerActions}>
              <TouchableOpacity
                style={styles.undoBannerButton}
                onPress={handleUndoDelete}
                activeOpacity={0.85}
              >
                <Text style={styles.undoBannerButtonText}>{t('garden.undo.undo')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.undoBannerClose}
                onPress={handleDismissUndo}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <MaterialIcons name="close" size={18} color={Colors.mocha} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ===================
// STYLES
// ===================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  undoBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    zIndex: 50,
    elevation: 50,
  },
  undoBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: Colors.cream,
    ...Shadows.md,
  },
  undoBannerText: {
    flex: 1,
    marginRight: 12,
    fontFamily: Typography.fontFamilyBody,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  undoBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  undoBannerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  undoBannerButtonText: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: 13,
    color: Colors.mocha,
  },
  undoBannerClose: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    zIndex: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  loadingText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeMD,
    color: Colors.textMuted,
  },
  restoreOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    zIndex: 50,
  },
  restoreOverlayCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.md,
  },
  restoreOverlayEmoji: { fontSize: 28, marginBottom: Spacing.sm },
  restoreOverlayTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  restoreOverlayHint: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  restoreBanner: {
    position: 'absolute',
    top: 14,
    left: 0,
    right: 0,
    zIndex: 60,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  restoreBannerCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.sm,
  },
  restoreBannerText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
  },

  editSeedOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  editSeedCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.md,
  },
  editSeedTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  editSeedInput: {
    minHeight: 110,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    textAlignVertical: 'top',
  },
  editSeedActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  editSeedCancel: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  editSeedCancelText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.mocha,
  },
  editSeedSave: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.mocha,
  },
  editSeedSaveText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
  },

  // Header
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
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.cream,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.sm,
  },
  settingsIcon: {
    fontSize: 20,
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

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderLeftWidth: 3,
    ...Shadows.sm,
  },
  statEmoji: {
    fontSize: 24,
    marginBottom: Spacing.xs,
  },
  statValue: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeXL,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Growth Journey
  growthJourney: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  growthJourneyWithHint: {
    // No-op: spacing is now driven by measured bubble height in `GrowthJourney`.
    paddingTop: 0,
  },
  growthJourneyTitle: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  growthJourneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  growthStageItem: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
    overflow: 'visible',
  },
  growthStageCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.cream,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  growthStageCircleActive: {
    backgroundColor: Colors.softSage,
  },
  growthStageEmoji: {
    fontSize: 20,
  },
  growthStageCount: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
  },
  growthStageLabel: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  growthStageLine: {
    width: 12,
    height: 2,
    backgroundColor: Colors.border,
    marginBottom: 24,
  },

  growthJourneyRowWrap: {
    position: 'relative',
  },
  growthJourneyRowWrapWithBubble: {
    paddingTop: 0,
  },

  // Growth hint bubble (floating above the row, pointing to a stage)
  growthHintBubbleFloating: {
    position: 'absolute',
    top: 0,
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.md,
    zIndex: 20,
    elevation: 20,
  },
  growthHintClose: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  growthHintCloseText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: 14,
    color: Colors.textMuted,
  },
  growthHintTitle: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
    marginRight: 22,
    marginBottom: 4,
  },
  growthHintBody: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    lineHeight: 16,
    marginRight: 4,
  },
  growthHintTailFloating: {
    position: 'absolute',
    bottom: -6,
    width: 12,
    height: 12,
    backgroundColor: Colors.cream,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    transform: [{ translateX: -6 }, { rotate: '45deg' }],
  },

  // Seeds Section
  seedsSection: {
    marginTop: Spacing.sm,
  },
  seedsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  seedsSectionTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeXL,
    color: Colors.textPrimary,
  },
  seedsSectionCount: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
  },

  // Filter Tabs
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.full,
    padding: 4,
    marginBottom: Spacing.lg,
  },
  filterTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.full,
  },
  filterTabActive: {
    backgroundColor: Colors.surface,
    ...Shadows.sm,
  },
  filterTabText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
  },
  filterTabTextActive: {
    color: Colors.textPrimary,
  },

  // Category Section (Collapsible)
  categorySection: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  categorySectionHarvested: {
    backgroundColor: '#FFF9E6',
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  categorySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  categorySectionLeftPress: {
    flex: 1,
  },
  categorySectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  categorySectionInfo: {
    flex: 1,
  },
  categorySectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  categorySectionEmojiSlot: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categorySectionEmoji: {
    fontSize: 28,
    textAlign: 'center',
  },
  categorySectionName: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
  },
  categorySectionCount: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    marginTop: 2,
  },
  categorySectionArrow: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  categorySectionContent: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.cream,
  },
  categoryHarvestButton: {
    backgroundColor: Colors.gold,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  categoryHarvestText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: Colors.espresso,
  },
  categoryDeleteButton: {
    backgroundColor: Colors.cream,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryDeleteText: {
    fontSize: 14,
  },
  categoryEditButton: {
    backgroundColor: Colors.cream,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryEditText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: Colors.textPrimary,
  },
  categoryMenuButton: {
    backgroundColor: Colors.cream,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryChatButton: {
    backgroundColor: Colors.cream,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryMenuFallbackText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: 20,
    lineHeight: 22,
    color: Colors.textPrimary,
    width: 20,
    textAlign: 'center',
    marginTop: 4,
  },
  // Category prompt
  categoryPrompt: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryPromptText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  categoryPromptButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  categoryPromptPrimary: {
    backgroundColor: Colors.mocha,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  categoryPromptPrimaryText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
  },
  categoryPromptSecondary: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryPromptSecondaryText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
  },

  // Category picker modal
  categoryPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  categoryPickerCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...Shadows.lg,
  },
  categoryPickerTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeXL,
    color: Colors.espresso,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  categoryPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  categoryPickerDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
    opacity: 0.7,
  },
  categoryPickerRowActive: {
    backgroundColor: Colors.cream,
  },
  categoryPickerRowGeneral: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  categoryPickerEmoji: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
    marginRight: Spacing.sm,
  },
  categoryPickerName: {
    flex: 1,
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
  },
  categoryPickerNameGeneral: {
    fontFamily: Typography.fontFamilyBodyMedium,
    color: Colors.textSecondary,
  },
  categoryPickerCheck: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeMD,
    color: Colors.mocha,
  },

  // Journey actions modal (mobile)
  journeyActionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  journeyActionsCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...Shadows.lg,
  },
  journeyActionsTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeLG,
    color: Colors.espresso,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  journeyActionsRow: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  journeyActionsRowPrimary: {
    backgroundColor: Colors.gold,
    borderColor: Colors.warmGold,
  },
  journeyActionsRowDestructive: {
    backgroundColor: 'rgba(184, 115, 51, 0.12)',
    borderColor: Colors.copper,
  },
  journeyActionsRowCancel: {
    backgroundColor: Colors.surface,
  },
  journeyActionsRowText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  journeyActionsRowTextDestructive: {
    color: Colors.copper,
  },

  // "General" label rename modal
  generalLabelCardPressable: {
    width: '100%',
    maxWidth: 420,
  },
  generalLabelCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...Shadows.lg,
  },
  generalLabelInput: {
    backgroundColor: Colors.milk,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  generalLabelSectionLabel: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  generalLabelEmojiHint: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  generalLabelEmojiFieldWrap: {
    position: 'relative',
    alignSelf: 'center',
    minWidth: 120,
    marginBottom: Spacing.sm,
  },
  generalLabelEmojiInput: {
    minWidth: 120,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.milk,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  generalLabelEmojiInputWithValue: {
    fontSize: 28,
    lineHeight: 34,
  },
  generalLabelEmojiPlaceholderOverlay: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    top: 0,
    bottom: 0,
    textAlign: 'center',
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    lineHeight: 18,
    paddingTop: 11,
  },
  generalLabelMeditationScroll: {
    maxHeight: 200,
    marginBottom: Spacing.xs,
  },
  generalLabelMedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: 4,
    backgroundColor: Colors.milk,
  },
  generalLabelMedRowActive: {
    borderWidth: 1,
    borderColor: Colors.mocha,
    backgroundColor: Colors.cream,
  },
  generalLabelMedRowDisabled: {
    opacity: 0.45,
  },
  generalLabelMedRowText: {
    flex: 1,
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
    paddingRight: Spacing.sm,
  },
  generalLabelMedCheck: {
    fontSize: Typography.fontSizeMD,
    color: Colors.mocha,
  },
  generalLabelButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  generalLabelButton: {
    flex: 1,
    backgroundColor: Colors.mocha,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generalLabelButtonSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  generalLabelButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
  },
  generalLabelButtonSecondaryText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
  },

  // Meditation Button on Category Card
  meditationButton: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  meditationButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  meditationButtonIcon: {
    fontSize: 24,
    marginRight: Spacing.sm,
  },
  meditationButtonTextContainer: {
    flex: 1,
  },
  meditationButtonTitle: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
  },
  meditationButtonSubtitle: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.latte,
    opacity: 0.9,
    marginTop: 1,
  },

  // Harvest Story on Card
  harvestStoryCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.gold,
  },
  harvestStoryText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
    fontStyle: 'italic',
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  harvestStoryMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  harvestStoryEmotion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  harvestStoryEmotionEmoji: {
    fontSize: 16,
  },
  harvestStoryEmotionText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: Colors.mocha,
  },
  harvestStoryDate: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
  },

  // Harvest Celebration Modal
  harvestModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  harvestModalContainer: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '90%',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  harvestModalGradient: {
    padding: Spacing.lg,
  },
  harvestModalHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  harvestModalEmoji: {
    fontSize: 56,
    marginBottom: Spacing.sm,
  },
  harvestModalTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeXL,
    color: Colors.espresso,
    marginBottom: Spacing.xs,
  },
  harvestModalSubtitle: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  harvestModalSeedCount: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: Colors.mocha,
    marginTop: Spacing.sm,
  },
  harvestStorySection: {
    marginBottom: Spacing.lg,
  },
  harvestStoryLabel: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  harvestStoryHint: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  harvestStoryInput: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
    minHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  harvestEmotionSection: {
    marginBottom: Spacing.lg,
  },
  harvestEmotionLabel: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  harvestEmotionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  harvestEmotionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  harvestEmotionButtonSelected: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  harvestEmotionEmoji: {
    fontSize: 16,
  },
  harvestEmotionText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textSecondary,
  },
  harvestEmotionTextSelected: {
    color: Colors.espresso,
    fontFamily: Typography.fontFamilyBodyMedium,
  },
  harvestModalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  harvestSkipButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  harvestSkipButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.textSecondary,
  },
  harvestSaveButton: {
    flex: 2,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  harvestSaveButtonGradient: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  harvestSaveButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.espresso,
  },

  // Compact Seed Card
  compactSeedCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    flexDirection: 'column',
  },
  compactSeedCardHarvested: {
    backgroundColor: '#FFF9E6',
    borderWidth: 1.5,
    borderColor: Colors.gold,
  },
  compactSeedTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  compactSeedStage: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.cream,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactStageEmoji: {
    fontSize: 14,
  },
  compactSeedAction: {
    flex: 1,
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  compactSeedActionContainer: {
    flex: 1,
  },
  compactSeedCardExpanded: {
    backgroundColor: Colors.surface,
    borderColor: Colors.gold,
    borderWidth: 1,
  },
  tapToReadMore: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  compactSeedBottom: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: Spacing.xs,
    paddingLeft: 36,
  },
  compactSeedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactSeedActions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactSeedIconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactSeedEditButton: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  compactSeedEditText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: 11,
    color: Colors.mocha,
  },
  compactSeedDate: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 11,
    color: Colors.textMuted,
  },
  compactSeedDot: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  compactSeedWatered: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 11,
    color: Colors.sage,
  },
  compactHarvestedBadge: {
    backgroundColor: Colors.cream,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gold,
    marginLeft: 'auto',
  },
  compactHarvestedText: {
    fontSize: 10,
  },

  // Growth Badge
  growthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  growthBadgeEmoji: {
    fontSize: 12,
  },
  growthBadgeText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: 11,
    color: Colors.espresso,
  },

  // Legend
  legend: {
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  legendTitle: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  legendItem: {
    alignItems: 'center',
  },
  legendEmoji: {
    fontSize: 18,
    marginBottom: 2,
  },
  legendText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 10,
    color: Colors.textMuted,
  },
  legendHintOutside: {
    fontFamily: Typography.fontFamilyHeadingItalic,
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },

  // Empty Seeds Message (inside seeds section)
  emptySeedsMessage: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  emptySeedsEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  emptySeedsTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeLG,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  emptySeedsText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  // No Filter Results
  noFilterResults: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  noFilterResultsText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeMD,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});

