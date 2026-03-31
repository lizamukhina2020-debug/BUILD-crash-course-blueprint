import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  ScrollView,
  Modal,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../utils/crossPlatformAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect, CommonActions } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { meditations, getAudioFile } from '../constants/meditations';
import {
  GardenSeed,
  getAllGardenSeeds,
  waterSeeds,
  updateStreak,
  addMeditationToHistory,
  markPendingMeditationComplete,
  CATEGORY_TO_MEDITATION,
  GROWTH_STAGE_EMOJIS,
  getSoundSettings,
} from '../services/meditationStorage';
import { trackEvent } from '../services/analytics';
import { getEffectivePremiumFlag } from '../services/subscriptionGate';

const { width, height } = Dimensions.get('window');
const WATERING_NOTE_SEEN_KEY = 'seedmind_meditation_watering_note_seen_v1';

type Props = NativeStackScreenProps<RootStackParamList, 'MeditationPlayer'>;

// Animated Coffee Steam
const CoffeeSteam = () => {
  const steam1 = useRef(new Animated.Value(0)).current;
  const steam2 = useRef(new Animated.Value(0)).current;
  const steam3 = useRef(new Animated.Value(0)).current;
  const opacity1 = useRef(new Animated.Value(0)).current;
  const opacity2 = useRef(new Animated.Value(0)).current;
  const opacity3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateSteam = (translateY: Animated.Value, opacity: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: -60,
              duration: 2500,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(opacity, {
                toValue: 0.6,
                duration: 800,
                useNativeDriver: true,
              }),
              Animated.timing(opacity, {
                toValue: 0,
                duration: 1700,
                useNativeDriver: true,
              }),
            ]),
          ]),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    animateSteam(steam1, opacity1, 0);
    animateSteam(steam2, opacity2, 500);
    animateSteam(steam3, opacity3, 1000);
  }, []);

  return (
    <View style={styles.steamContainer}>
      <Animated.View
        style={[
          styles.steamLine,
          {
            left: 20,
            opacity: opacity1,
            transform: [{ translateY: steam1 }, { rotate: '-15deg' }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.steamLine,
          {
            left: 50,
            opacity: opacity2,
            transform: [{ translateY: steam2 }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.steamLine,
          {
            left: 80,
            opacity: opacity3,
            transform: [{ translateY: steam3 }, { rotate: '15deg' }],
          },
        ]}
      />
    </View>
  );
};

// Pulsing Animation Ring
const PulsingRing = ({ delay, size }: { delay: number; size: number }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.3,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.5,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.pulsingRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
};

// Progress bar component - interactive with tap-to-seek (works on web and native)
const ProgressBar = ({ 
  progress, 
  currentTime, 
  totalDuration,
  onSeek,
}: { 
  progress: number; 
  currentTime: number;
  totalDuration: number;
  onSeek?: (position: number) => void;
}) => {
  const barRef = useRef<View>(null);
  const [barWidth, setBarWidth] = useState(0);
  const [barX, setBarX] = useState(0);
  
  const formatTime = (seconds: number) => {
    // Handle NaN or undefined
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) {
      return '0:00';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePress = (event: any) => {
    if (!onSeek || barWidth === 0) return;
    
    let clickX = 0;
    
    if (Platform.OS === 'web') {
      // Web: use pageX and subtract bar's left position
      const pageX = event.nativeEvent?.pageX ?? event.pageX ?? 0;
      clickX = pageX - barX;
    } else {
      // Native: use locationX
      clickX = event.nativeEvent?.locationX ?? 0;
    }
    
    const seekPercent = Math.max(0, Math.min(1, clickX / barWidth));
    const seekPosition = seekPercent * totalDuration;
    onSeek(seekPosition);
  };

  const handleLayout = (event: any) => {
    const { width: measuredWidth } = event.nativeEvent.layout;
    setBarWidth(measuredWidth);
    
    // For web, we need the absolute position of the bar
    if (Platform.OS === 'web') {
      // Small delay to ensure element is rendered
      setTimeout(() => {
        try {
          const element = barRef.current as any;
          if (element?.getBoundingClientRect) {
            const rect = element.getBoundingClientRect();
            setBarX(rect.left);
          } else if (element?._nativeTag || element?.measure) {
            // React Native Web fallback
            element.measure?.((x: number, y: number, w: number, h: number, pageX: number) => {
              setBarX(pageX);
            });
          }
        } catch (e) {
          console.log('Could not measure bar position');
        }
      }, 50);
    }
  };

  return (
    <View style={styles.progressContainer}>
      <Pressable 
        ref={barRef as any}
        onPress={handlePress}
        onLayout={handleLayout}
        style={styles.progressTouchArea}
      >
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%` },
            ]}
          />
          {/* Seek handle/thumb */}
          <View 
            style={[
              styles.progressThumb,
              { left: `${Math.min(progress, 98)}%` }
            ]} 
          />
        </View>
      </Pressable>
      <View style={styles.timeContainer}>
        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
        <Text style={styles.timeText}>{formatTime(totalDuration)}</Text>
      </View>
    </View>
  );
};

// Seed Selection Item
const SeedSelectionItem = ({
  seed,
  isSelected,
  onToggle,
}: {
  seed: GardenSeed;
  isSelected: boolean;
  onToggle: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={[styles.seedItem, isSelected && styles.seedItemSelected]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={styles.seedCheckbox}>
        {isSelected ? (
          <View style={styles.seedCheckboxChecked}>
            <Text style={styles.seedCheckmark}>✓</Text>
          </View>
        ) : (
          <View style={styles.seedCheckboxEmpty} />
        )}
      </View>
      <View style={styles.seedItemContent}>
        <Text style={styles.seedItemText} numberOfLines={2}>
          {seed.action}
        </Text>
        <View style={styles.seedItemMeta}>
          <Text style={styles.seedItemStage}>
            {GROWTH_STAGE_EMOJIS[seed.growthStage]} {t(`garden.growth.${seed.growthStage}`)}
          </Text>
          <Text style={styles.seedItemDays}>
            {seed.daysWatered} {t('garden.seed.daysWatered')}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// Seed Selection Modal
const SeedSelectionModal = ({
  visible,
  seeds,
  selectedIds,
  onToggleSeed,
  onSelectAll,
  onClearAll,
  onSelectJourney,
  onClearJourney,
  onConfirm,
  onSkip,
  meditationId,
}: {
  visible: boolean;
  seeds: GardenSeed[];
  selectedIds: string[];
  onToggleSeed: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onSelectJourney: (journeyKey: string) => void;
  onClearJourney: (journeyKey: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
  meditationId: string;
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru' : 'en';
  const selectedSet = new Set(selectedIds);
  const hasSeeds = seeds.length > 0;

  const getJourneyKey = (seed: GardenSeed) => seed.conversationId || `legacy_${seed.category}`;

  type JourneySection = {
    key: string;
    title: string;
    category: string;
    seeds: GardenSeed[];
    matched: boolean;
    latestPlantedAt: number;
    selectedCount: number;
  };

  const byJourney = new Map<string, GardenSeed[]>();
  for (const s of seeds) {
    const key = getJourneyKey(s);
    const list = byJourney.get(key) || [];
    list.push(s);
    byJourney.set(key, list);
  }

  const sections: JourneySection[] = Array.from(byJourney.entries()).map(([key, list]) => {
    const first = list[0];
    const title =
      (first.problemTitleByLocale && (first.problemTitleByLocale as any)[locale]) ||
      first.problemTitle ||
      t(`categories.${first.category}`, { defaultValue: t('categories.general') });
    const category = first.category || 'general';
    const recommended = CATEGORY_TO_MEDITATION[category] || CATEGORY_TO_MEDITATION.general;
    const matched = recommended === meditationId;
    const latestPlantedAt = Math.max(...list.map(s => new Date(s.datePlanted).getTime()));
    const selectedCount = list.reduce((acc, s) => acc + (selectedSet.has(s.id) ? 1 : 0), 0);
    list.sort((a, b) => new Date(b.datePlanted).getTime() - new Date(a.datePlanted).getTime());
    return { key, title, category, seeds: list, matched, latestPlantedAt, selectedCount };
  });

  sections.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    return b.latestPlantedAt - a.latestPlantedAt;
  });

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={[Colors.espresso, Colors.darkRoast]}
            style={styles.modalGradient}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalEmoji}>💧</Text>
              <Text style={styles.modalTitle}>{t('player.seedSelection.title')}</Text>
              <Text style={styles.modalSubtitle}>{t('player.seedSelection.subtitle')}</Text>
            </View>

            {/* Seeds List */}
            <ScrollView 
              style={styles.seedsList} 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.seedsListContent}
            >
              {!hasSeeds ? (
                <View style={styles.noSeedsContainer}>
                  <Text style={styles.noSeedsEmoji}>🌱</Text>
                  <Text style={styles.noSeedsText}>
                    {t('player.seedSelection.emptyTitle')}
                  </Text>
                  <Text style={styles.noSeedsSubtext}>
                    {t('player.seedSelection.emptyBody')}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.selectAllRow}>
                    <TouchableOpacity
                      onPress={onSelectAll}
                      style={styles.selectAllButton}
                    >
                      <Text style={styles.selectAllText}>{t('player.seedSelection.selectAll')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={onClearAll}
                      style={styles.selectAllButton}
                    >
                      <Text style={styles.selectAllText}>{t('player.seedSelection.clear')}</Text>
                    </TouchableOpacity>
                  </View>
                  {sections.map(section => {
                    const total = section.seeds.length;
                    const allSelected = section.selectedCount === total && total > 0;
                    const hasSelected = section.selectedCount > 0;
                    const actionLabel = allSelected
                      ? t('player.seedSelection.clearJourney')
                      : t('player.seedSelection.selectAllJourney');
                    const actionPress = allSelected
                      ? () => onClearJourney(section.key)
                      : () => onSelectJourney(section.key);

                    return (
                      <View
                        key={section.key}
                        style={[
                          styles.journeySection,
                          section.matched && styles.journeySectionMatched,
                        ]}
                      >
                        <View style={styles.journeyHeaderRow}>
                          <View style={styles.journeyHeaderLeft}>
                            <Text style={styles.journeyTitle} numberOfLines={2}>
                              {section.title}
                            </Text>
                            <Text style={styles.journeyMeta}>
                              {t('player.seedSelection.selectedInJourney', {
                                selected: section.selectedCount,
                                total,
                              })}
                            </Text>
                          </View>
                          <View style={styles.journeyHeaderRight}>
                            {section.matched && (
                              <View style={styles.journeyMatchBadge}>
                                <Text style={styles.journeyMatchText}>
                                  ✨ {t('player.seedSelection.matchBadge')}
                                </Text>
                              </View>
                            )}
                            <TouchableOpacity
                              onPress={actionPress}
                              style={styles.journeyActionButton}
                              activeOpacity={0.75}
                              disabled={total === 0}
                            >
                              <Text
                                style={[
                                  styles.journeyActionText,
                                  hasSelected && styles.journeyActionTextActive,
                                ]}
                              >
                                {actionLabel}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {section.seeds.map(seed => (
                          <SeedSelectionItem
                            key={seed.id}
                            seed={seed}
                            isSelected={selectedSet.has(seed.id)}
                            onToggle={() => onToggleSeed(seed.id)}
                          />
                        ))}
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={styles.modalFooter}>
              <Text style={styles.selectedCount}>
                {t('player.seedSelection.selectedCount', { count: selectedIds.length })}
              </Text>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={onSkip}
                >
                  <Text style={styles.skipButtonText}>{t('common.skip')}</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.waterButton,
                    selectedIds.length === 0 && styles.waterButtonDisabled
                  ]}
                  onPress={onConfirm}
                  disabled={selectedIds.length === 0}
                >
                  <LinearGradient
                    colors={selectedIds.length > 0 
                      ? [Colors.gold, Colors.warmGold] 
                      : ['#666', '#555']
                    }
                    style={styles.waterButtonGradient}
                  >
                    <Text style={styles.waterButtonText}>
                      💧 {t('player.seedSelection.confirm')}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
};

// Completion Modal (for users WITH seeds)
const CompletionModal = ({
  visible,
  wateredCount,
  onDone,
}: {
  visible: boolean;
  wateredCount: number;
  onDone: () => void;
}) => {
  const { t } = useTranslation();
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
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
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.completionOverlay}>
        <Animated.View
          style={[
            styles.completionContainer,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={[Colors.sage, Colors.cream]}
            style={styles.completionGradient}
          >
            <Text style={styles.completionEmoji}>{wateredCount > 0 ? '🌱' : '🧘‍♀️'}</Text>
            <Text style={styles.completionTitle}>
              {wateredCount > 0
                ? t('meditations.player.completionSeedsWateredTitle', { defaultValue: 'Seeds Watered!' })
                : t('meditations.player.completionMeditationCompleteTitle', { defaultValue: 'Meditation Complete!' })}
            </Text>
            <Text style={styles.completionText}>
              {wateredCount > 0
                ? t('meditations.player.completionSeedsWateredBody', {
                    defaultValue: "You watered {{count}} seed(s). They're growing stronger!",
                    count: wateredCount,
                  })
                : t('meditations.player.completionNoWateringBody', {
                    defaultValue: 'Come back anytime to water your seeds and help them grow.',
                  })}
            </Text>
            {wateredCount > 0 ? (
              <Text style={styles.completionHint}>
                {t('meditations.player.completionStreakHint', { defaultValue: 'Your streak continues 🔥' })}
              </Text>
            ) : null}
            <TouchableOpacity style={styles.completionButton} onPress={onDone}>
              <Text style={styles.completionButtonText}>
                {t('meditations.player.completionDone', { defaultValue: 'Done ✨' })}
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
};

// Preview Completion Modal (for users with NO seeds - meditation doesn't count toward streak)
const PreviewCompletionModal = ({
  visible,
  onDone,
  onPlantSeeds,
}: {
  visible: boolean;
  onDone: () => void;
  onPlantSeeds: () => void;
}) => {
  const { t } = useTranslation();
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
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
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.completionOverlay}>
        <Animated.View
          style={[
            styles.completionContainer,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={[Colors.latte, Colors.cream]}
            style={styles.completionGradient}
          >
            <Text style={styles.completionEmoji}>☕</Text>
            <Text style={styles.completionTitle}>
              {t('meditations.player.previewTitle', { defaultValue: 'Beautiful Meditation!' })}
            </Text>
            <Text style={styles.completionText}>
              {t('meditations.player.previewBody', {
                defaultValue:
                  'This practice works best when you have seeds to water. Plant some seeds first, then meditate on them to help them grow.',
              })}
            </Text>
            <Text style={styles.previewHint}>
              {t('meditations.player.previewHint', {
                defaultValue: '💡 Think of it like a garden — you need seeds first!',
              })}
            </Text>
            <TouchableOpacity style={styles.plantSeedsButton} onPress={onPlantSeeds}>
              <LinearGradient
                colors={[Colors.mocha, Colors.latte]}
                style={styles.plantSeedsGradient}
              >
                <Text
                  style={styles.plantSeedsText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {t('meditations.player.previewPlantFirstSeeds', { defaultValue: '🌱 Plant My First Seeds' })}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.previewDoneButton} onPress={onDone}>
              <Text style={styles.previewDoneText}>
                {t('meditations.player.previewMaybeLater', { defaultValue: 'Maybe Later' })}
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default function MeditationPlayerScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { meditationId } = route.params;
  const meditation = meditations.find(m => m.id === meditationId) || meditations[0];
  const [descExpanded, setDescExpanded] = useState(false);
  
  // Get translated meditation content
  const meditationTitle = t(`meditations.items.${meditation.id}.title`, { defaultValue: meditation.title });
  const meditationSubtitle = t(`meditations.items.${meditation.id}.subtitle`, { defaultValue: meditation.subtitle });
  const meditationDescription = t(`meditations.items.${meditation.id}.description`, { defaultValue: meditation.description });
  // Only Abundance currently needs expand/collapse (others fit without truncation)
  const showDescToggle = meditation.id === '1';

  useEffect(() => {
    // Reset description expansion when switching meditations
    setDescExpanded(false);
  }, [meditation.id]);

  // Free tier: only Daily Gratitude Brew (id 4) may play; block garden/deep-link bypass.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const premium = await getEffectivePremiumFlag();
        if (cancelled || premium) return;
        if (meditationId !== '4') {
          navigation.replace('Paywall', { source: 'meditation_locked', mode: 'upgrade' });
        }
      } catch {
        // Fail open if premium status can’t be read (matches subscription gate elsewhere).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meditationId, navigation]);
  
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoggedStartRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(meditation.durationSeconds || 180);
  const [hasAudio, setHasAudio] = useState(false);
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const pendingPlayRef = useRef(false);
  
  // Seed selection state
  const [showSeedSelection, setShowSeedSelection] = useState(false);
  const [availableSeeds, setAvailableSeeds] = useState<GardenSeed[]>([]);
  const [selectedSeedIds, setSelectedSeedIds] = useState<string[]>([]);
  const [showCompletion, setShowCompletion] = useState(false);
  const [wateredCount, setWateredCount] = useState(0);
  const [hasAnySeedsInGarden, setHasAnySeedsInGarden] = useState(false);
  const [showPreviewCompletion, setShowPreviewCompletion] = useState(false);

  // One-time UX note: user must water seeds after meditation
  const [showWateringNote, setShowWateringNote] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(WATERING_NOTE_SEEN_KEY)
      .then((v) => {
        if (!alive) return;
        if (v === 'true') return;
        setShowWateringNote(true);
      })
      .catch(() => {
        if (alive) setShowWateringNote(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const dismissWateringNote = async () => {
    setShowWateringNote(false);
    await AsyncStorage.setItem(WATERING_NOTE_SEEN_KEY, 'true').catch(() => {});
  };
  
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(50)).current;
  
  // Ref to track sound for cleanup (fixes closure issue)
  const soundRef = useRef<Audio.Sound | null>(null);

  // Load sound preference (default is enabled).
  useEffect(() => {
    let alive = true;
    getSoundSettings()
      .then((s) => {
        if (alive) setSoundsEnabled(!!s.meditationSoundsEnabled);
      })
      .catch(() => {
        if (alive) setSoundsEnabled(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Load available seeds for this meditation type
  const loadSeeds = async () => {
    try {
      const allSeeds = await getAllGardenSeeds();
      // Filter to only active (non-harvested) seeds
      const activeSeeds = allSeeds.filter(s => !s.harvested);
      
      // Track if user has ANY seeds at all (for determining preview vs full mode)
      setHasAnySeedsInGarden(activeSeeds.length > 0);
      
      // Always allow selecting from ALL active seeds (grouped by journeys in the modal).
      setAvailableSeeds(activeSeeds);
    } catch (error) {
      console.error('Error loading seeds:', error);
    }
  };

  // Configure audio mode and load audio
  useEffect(() => {
    const setupAudio = async () => {
      try {
        // Configure audio mode for playback
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: true,
          playsInSilentModeIOS: true,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          shouldDuckAndroid: true,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
          playThroughEarpieceAndroid: false,
        });

        // Load audio file
        const audioFile = getAudioFile(meditation.audioKey, 'female');
        if (audioFile) {
          const { sound: newSound } = await Audio.Sound.createAsync(
            audioFile,
            { shouldPlay: false },
            onPlaybackStatusUpdate
          );
          try {
            await newSound.setIsMutedAsync(!soundsEnabled);
          } catch {}
          setSound(newSound);
          soundRef.current = newSound; // Track in ref for cleanup
          setHasAudio(true);

          // If the user tapped play while we were still loading, start automatically.
          if (pendingPlayRef.current) {
            pendingPlayRef.current = false;
            try {
              if (!hasLoggedStartRef.current) {
                hasLoggedStartRef.current = true;
                trackEvent('meditation_started', {
                  meditation_id: meditationId,
                  has_audio: true,
                }).catch(() => {});
              }
              await newSound.playAsync();
            } catch {}
          }
        } else {
          setHasAudio(false);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading audio:', error);
        setIsLoading(false);
        setHasAudio(false);
      }
    };

    setupAudio();

    // Cleanup on unmount - use ref to get current sound
    return () => {
      if (soundRef.current) {
        // Check if sound is loaded before stopping
        soundRef.current.getStatusAsync().then((status) => {
          if (status.isLoaded) {
            soundRef.current?.stopAsync().then(() => {
              soundRef.current?.unloadAsync();
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    };
  }, [meditation.audioKey, soundsEnabled]);

  // Apply mute/unmute if the user toggles Sounds while this screen is open.
  useEffect(() => {
    if (!soundRef.current) return;
    soundRef.current.setIsMutedAsync(!soundsEnabled).catch(() => {});
  }, [soundsEnabled]);

  // Stop audio when screen loses focus (user navigates away)
  useFocusEffect(
    useCallback(() => {
      // Screen is focused - do nothing on focus
      
      return () => {
        // Screen is unfocused - stop audio if loaded
        if (soundRef.current) {
          soundRef.current.getStatusAsync().then((status) => {
            if (status.isLoaded) {
              soundRef.current?.stopAsync().catch(() => {});
            }
          }).catch(() => {});
        }
      };
    }, [])
  );

  // Playback status update handler
  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      const position = status.positionMillis / 1000;
      setCurrentTime(position);
      setIsPlaying(status.isPlaying);
      
      // Only update duration if it's a valid number
      if (status.durationMillis && status.durationMillis > 0) {
        const duration = status.durationMillis / 1000;
        setTotalDuration(duration);
        setProgress((position / duration) * 100);
      }

      // Handle playback finished - show seed selection
      if (status.didJustFinish) {
        setIsPlaying(false);
        setProgress(100);
        handleMeditationComplete();
      }
    }
  };

  // Animation on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideUp, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Handle meditation completion - show seed selection or preview completion
  const handleMeditationComplete = async () => {
    await loadSeeds();
    
    // After loading, check if user has any seeds
    const allSeeds = await getAllGardenSeeds();
    const activeSeeds = allSeeds.filter(s => !s.harvested);
    
    if (activeSeeds.length === 0) {
      // No seeds at all - show preview completion (no streak)
      setShowPreviewCompletion(true);
    } else {
      // Has seeds - show normal seed selection
      setShowSeedSelection(true);
    }
  };

  const handleClose = async () => {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
    }
    navigation.goBack();
  };

  // Manual "I'm Done" button for meditations without audio
  const handleManualComplete = async () => {
    if (sound) {
      await sound.stopAsync();
    }
    await loadSeeds();
    
    // Check if user has seeds (same logic as handleMeditationComplete)
    const allSeeds = await getAllGardenSeeds();
    const activeSeeds = allSeeds.filter(s => !s.harvested);
    
    if (activeSeeds.length === 0) {
      // No seeds - show preview completion (no progress tracking)
      setShowPreviewCompletion(true);
    } else {
      // Has seeds - show seed selection
      setShowSeedSelection(true);
    }
  };

  const togglePlayPause = async () => {
    if (isLoading) {
      pendingPlayRef.current = true;
      return;
    }
    if (!sound && !hasAudio) {
      showAlert(
        t('meditations.player.audioComingSoonTitle', { defaultValue: 'Audio Coming Soon' }),
        t('meditations.player.audioComingSoonBody', {
          defaultValue:
            'This meditation audio is being prepared. You can still complete your meditation and water your seeds!',
        }),
        [
          { text: t('meditations.player.audioComingSoonCancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          {
            text: t('meditations.player.audioComingSoonDone', { defaultValue: "I'm Done Meditating" }),
            onPress: handleManualComplete,
          }
        ]
      );
      return;
    }

    if (!sound) return;

    try {
      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        if (!hasLoggedStartRef.current) {
          hasLoggedStartRef.current = true;
          trackEvent('meditation_started', {
            meditation_id: meditationId,
            has_audio: hasAudio,
          }).catch(() => {});
        }
        // If at the end, restart
        if (progress >= 99) {
          await sound.setPositionAsync(0);
        }
        await sound.playAsync();
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
    }
  };

  const handleSeekBackward = async () => {
    if (!sound) return;
    try {
      const newPosition = Math.max(0, currentTime - 15);
      await sound.setPositionAsync(newPosition * 1000);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };

  const handleSeekForward = async () => {
    if (!sound) return;
    try {
      const newPosition = Math.min(totalDuration, currentTime + 15);
      await sound.setPositionAsync(newPosition * 1000);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };

  // Seek to specific position (for progress bar tap/drag)
  const handleSeek = async (positionSeconds: number) => {
    if (!sound) return;
    try {
      const clampedPosition = Math.max(0, Math.min(totalDuration, positionSeconds));
      await sound.setPositionAsync(clampedPosition * 1000);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };

  // Seed selection handlers
  const handleToggleSeed = (seedId: string) => {
    setSelectedSeedIds(prev => 
      prev.includes(seedId)
        ? prev.filter(id => id !== seedId)
        : [...prev, seedId]
    );
  };

  const handleSelectAll = () => {
    setSelectedSeedIds(availableSeeds.map(s => s.id));
  };

  const handleClearAll = () => {
    setSelectedSeedIds([]);
  };

  const getSeedJourneyKey = (seed: GardenSeed) => seed.conversationId || `legacy_${seed.category}`;

  const handleSelectJourney = (journeyKey: string) => {
    const ids = availableSeeds.filter(s => getSeedJourneyKey(s) === journeyKey).map(s => s.id);
    setSelectedSeedIds(prev => [...new Set([...prev, ...ids])]);
  };

  const handleClearJourney = (journeyKey: string) => {
    const ids = new Set(availableSeeds.filter(s => getSeedJourneyKey(s) === journeyKey).map(s => s.id));
    setSelectedSeedIds(prev => prev.filter(id => !ids.has(id)));
  };

  const handleConfirmWatering = async () => {
    try {
      // We only count a meditation toward streak / Today's Progress if it actually watered at least one seed.
      // This keeps streak + progress consistent and prevents "testing" meditations from inflating streak.
      if (selectedSeedIds.length === 0) {
        setWateredCount(0);
        setShowSeedSelection(false);
        setShowCompletion(true);
        trackEvent('meditation_completed', {
          meditation_id: meditationId,
          watered_count: 0,
          has_audio: hasAudio,
        }).catch(() => {});
        return;
      }

      await waterSeeds(selectedSeedIds);

      // Count meditation only when seeds were watered
      await updateStreak();
      await addMeditationToHistory(meditationId, selectedSeedIds);
      // Mark pending meditation as actually completed (so Chat knows it was done)
      await markPendingMeditationComplete(selectedSeedIds);
      
      setWateredCount(selectedSeedIds.length);
      setShowSeedSelection(false);
      setShowCompletion(true);
      trackEvent('meditation_completed', {
        meditation_id: meditationId,
        watered_count: selectedSeedIds.length,
        has_audio: hasAudio,
      }).catch(() => {});
    } catch (error) {
      console.error('Error watering seeds:', error);
      showAlert('Error', 'Something went wrong. Please try again.');
    }
  };

  const handleSkipWatering = async () => {
    // Skip = no seeds watered → don't count toward streak/history and don't complete pending chat meditation.
    setWateredCount(0);
    setShowSeedSelection(false);
    setShowCompletion(true);
    trackEvent('meditation_watering_skipped', { meditation_id: meditationId, has_audio: hasAudio }).catch(() => {});
  };

  const handleCompletionDone = async () => {
    if (sound) {
      await sound.unloadAsync();
    }
    navigation.goBack();
  };

  // Preview completion handlers (for users with no seeds)
  const handlePreviewDone = async () => {
    if (sound) {
      await sound.unloadAsync();
    }
    navigation.goBack();
  };

  const handleGoPlantSeeds = async () => {
    if (sound) {
      await sound.unloadAsync();
    }
    // Reset navigation to Main with Chat (Seeds Guide) tab focused
    // This properly closes the modal and navigates to the correct tab
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          { 
            name: 'Main',
            state: {
              routes: [
                { name: 'Chat' },
                { name: 'Meditations' },
                { name: 'Garden' },
              ],
              index: 0, // Chat tab (Seeds Guide)
            }
          }
        ],
      })
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <LinearGradient
        colors={[meditation.imageGradient[0], meditation.imageGradient[1], Colors.espresso]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        {/* Background decoration */}
        <View style={styles.backgroundPattern}>
          {[...Array(6)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.patternDot,
                {
                  left: 20 + (i % 3) * (width / 3),
                  top: 100 + Math.floor(i / 3) * 150,
                  opacity: 0.1,
                },
              ]}
            />
          ))}
        </View>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeIcon}>×</Text>
          </TouchableOpacity>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>☕ {t('meditations.player.badge')}</Text>
          </View>
          <View style={styles.headerRight}>
          <View style={styles.moreButton}>
            {hasAudio ? (
              <Text style={styles.audioIndicator}>🎧</Text>
            ) : (
              <Text style={styles.moreIcon}>⋯</Text>
            )}
            </View>
          </View>
        </View>

        {showWateringNote ? (
          <View style={styles.wateringNote}>
            <TouchableOpacity
              style={styles.wateringNoteClose}
              onPress={dismissWateringNote}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.wateringNoteCloseText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.wateringNoteTitle}>
              {t('meditations.player.wateringNoteTitle', { defaultValue: 'Water your seeds after' })}
            </Text>
            <Text style={styles.wateringNoteBody}>
              {t('meditations.player.wateringNoteBody', {
                defaultValue:
                  'After the meditation you’ll be asked which seeds you watered. Don’t exit early — otherwise your progress won’t be saved.',
              })}
            </Text>
          </View>
        ) : null}

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
          {/* Coffee Cup Visualization */}
          <View style={styles.visualizationContainer}>
            {/* Pulsing rings when playing */}
            {isPlaying && (
              <>
                <PulsingRing delay={0} size={160} />
                <PulsingRing delay={500} size={190} />
                <PulsingRing delay={1000} size={220} />
              </>
            )}
            
            {/* Main coffee cup */}
            <View style={styles.coffeeCupContainer}>
              {isPlaying && <CoffeeSteam />}
              <View style={styles.coffeeCup}>
                <LinearGradient
                  colors={[Colors.latte, Colors.cream]}
                  style={styles.coffeeGradient}
                >
                  <View style={styles.coffeeRipples}>
                    <View style={styles.ripple1} />
                    <View style={styles.ripple2} />
                  </View>
                </LinearGradient>
                <View style={styles.cupHandle} />
              </View>
              <View style={styles.saucer} />
            </View>
          </View>

          {/* Meditation Info */}
          <View style={styles.infoContainer}>
            <Text style={styles.subtitle}>{meditationSubtitle}</Text>
            <Text style={styles.title} numberOfLines={2}>{meditationTitle}</Text>
            {showDescToggle ? (
              <Pressable
                style={styles.descriptionPressable}
                onPress={() => setDescExpanded(v => !v)}
                hitSlop={8}
              >
                <Text style={styles.description} numberOfLines={descExpanded ? undefined : 3}>
                  {meditationDescription}
                </Text>
                <Text style={styles.descriptionToggle}>
                  {descExpanded ? '▲' : '▼'}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.description}>{meditationDescription}</Text>
            )}
          </View>
        </Animated.View>

        {/* Player Controls */}
        <View style={styles.controlsContainer}>
          {/* Progress */}
          <ProgressBar 
            progress={progress} 
            currentTime={currentTime}
            totalDuration={totalDuration}
            onSeek={handleSeek}
          />

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity style={styles.controlButton} onPress={handleSeekBackward}>
              <Text style={styles.controlIcon}>⟲</Text>
              <Text style={styles.controlLabel}>15s</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.playPauseButton, isLoading && styles.playPauseButtonLoading]}
              onPress={togglePlayPause}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={[Colors.gold, Colors.warmGold]}
                style={styles.playPauseGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color={Colors.espresso} />
                ) : (
                  <Text style={styles.playPauseIcon}>{isPlaying ? '⏸' : '▶'}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} onPress={handleSeekForward}>
              <Text style={styles.controlIcon}>⟳</Text>
              <Text style={styles.controlLabel}>15s</Text>
            </TouchableOpacity>
          </View>

          {/* Audio status / Manual complete button */}
          {!hasAudio && !isLoading && (
            <TouchableOpacity 
              style={styles.manualCompleteButton} 
              onPress={handleManualComplete}
            >
              <Text style={styles.manualCompleteText}>
                ✨ I've Finished Meditating
            </Text>
            </TouchableOpacity>
          )}

        </View>
      </LinearGradient>

      {/* Seed Selection Modal */}
      <SeedSelectionModal
        visible={showSeedSelection}
        seeds={availableSeeds}
        selectedIds={selectedSeedIds}
        onToggleSeed={handleToggleSeed}
        onSelectAll={handleSelectAll}
        onClearAll={handleClearAll}
        onSelectJourney={handleSelectJourney}
        onClearJourney={handleClearJourney}
        onConfirm={handleConfirmWatering}
        onSkip={handleSkipWatering}
        meditationId={meditationId}
      />

      {/* Completion Modal (for users with seeds) */}
      <CompletionModal
        visible={showCompletion}
        wateredCount={wateredCount}
        onDone={handleCompletionDone}
      />

      {/* Preview Completion Modal (for users with NO seeds) */}
      <PreviewCompletionModal
        visible={showPreviewCompletion}
        onDone={handlePreviewDone}
        onPlantSeeds={handleGoPlantSeeds}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  backgroundPattern: {
    ...StyleSheet.absoluteFillObject,
  },
  patternDot: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.cream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 60,
    paddingBottom: Spacing.md,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    fontSize: 28,
    color: Colors.cream,
    marginTop: -2,
  },
  headerBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  headerBadgeText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: Colors.cream,
  },
  moreButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreIcon: {
    fontSize: 24,
    color: Colors.cream,
  },
  audioIndicator: {
    fontSize: 20,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  wateringNote: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  wateringNoteClose: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wateringNoteCloseText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: 14,
    color: Colors.cream,
    opacity: 0.9,
  },
  wateringNoteTitle: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
    marginRight: 24,
    marginBottom: 4,
  },
  wateringNoteBody: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.cream,
    opacity: 0.9,
    lineHeight: 16,
    marginRight: 6,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center', // Groups cup and text together
    alignItems: 'center',
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.sm, // Small consistent gap between cup and text
  },
  visualizationContainer: {
    height: Math.min(height * 0.24, 200),
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pulsingRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  coffeeCupContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  steamContainer: {
    position: 'absolute',
    width: 100,
    height: 60,
    top: -50,
    left: 0,
  },
  steamLine: {
    position: 'absolute',
    width: 4,
    height: 30,
    backgroundColor: Colors.cream,
    borderRadius: 2,
    bottom: 0,
  },
  coffeeCup: {
    width: 100,
    height: 80,
    backgroundColor: Colors.cream,
    borderRadius: 8,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'visible',
    position: 'relative',
    ...Shadows.lg,
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
  coffeeRipples: {
    position: 'absolute',
    top: 15,
    width: '80%',
    height: 20,
    alignItems: 'center',
  },
  ripple1: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(92, 61, 46, 0.2)',
    borderRadius: 2,
    marginBottom: 6,
  },
  ripple2: {
    width: '60%',
    height: 2,
    backgroundColor: 'rgba(92, 61, 46, 0.15)',
    borderRadius: 1,
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
  saucer: {
    width: 120,
    height: 12,
    backgroundColor: Colors.cream,
    borderRadius: 60,
    marginTop: -3,
    ...Shadows.sm,
  },
  infoContainer: {
    alignItems: 'center',
    paddingTop: Spacing.xs, // Closer to cup
    paddingBottom: Spacing.md,
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.md,
  },
  subtitle: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream, // Visible on all backgrounds
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: Spacing.md,
    textShadowColor: 'rgba(0, 0, 0, 0.5)', // Stronger shadow
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  title: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: width > 768 ? 26 : Typography.fontSizeLG,
    color: Colors.cream,
    textAlign: 'center',
    marginBottom: Spacing.lg, // Tighter spacing - description moves up
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  description: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: width > 768 ? 15 : Typography.fontSizeSM,
    color: '#FFF8F0', // Warmer white for better visibility on all backgrounds
    textAlign: 'center',
    lineHeight: width > 768 ? 24 : 22,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  descriptionPressable: {
    alignItems: 'center',
  },
  descriptionToggle: {
    marginTop: 6,
    color: 'rgba(255, 248, 240, 0.55)',
    fontFamily: Typography.fontFamilyBody,
    fontSize: 14,
  },
  controlsContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 40,
    paddingTop: Spacing.md,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  progressContainer: {
    marginBottom: Spacing.lg,
  },
  progressTouchArea: {
    paddingVertical: 16, // Larger touch target for easier tapping
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'visible', // Allow thumb to show outside
    position: 'relative' as const,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.gold,
    borderRadius: 3,
  },
  progressThumb: {
    position: 'absolute' as const,
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.gold,
    marginLeft: -8, // Center on position
    ...Shadows.sm,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  timeText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.latte,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xxl,
    marginBottom: Spacing.xl,
  },
  controlButton: {
    alignItems: 'center',
  },
  controlIcon: {
    fontSize: 28,
    color: Colors.cream,
  },
  controlLabel: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.latte,
    marginTop: 2,
  },
  playPauseButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  playPauseButtonLoading: {
    opacity: 0.7,
  },
  playPauseGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseIcon: {
    fontSize: 32,
    color: Colors.espresso,
    marginLeft: 4,
  },
  manualCompleteButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  manualCompleteText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
  },

  // Seed Selection Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: Math.min(height * 0.82, 720),
    maxHeight: height * 0.85,
    minHeight: 520,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.espresso,
  },
  modalGradient: {
    flex: 1,
    paddingBottom: 20,
  },
  modalHeader: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  modalEmoji: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeLG,
    color: Colors.cream,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.latte,
    textAlign: 'center',
    opacity: 0.9,
  },
  seedsList: {
    flex: 1,
  },
  seedsListContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  journeySection: {
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: Spacing.md,
  },
  journeySectionMatched: {
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212, 175, 55, 0.10)',
  },
  journeyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  journeyHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  journeyTitle: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.cream,
    marginBottom: 4,
  },
  journeyMeta: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.latte,
    opacity: 0.9,
  },
  journeyHeaderRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  journeyMatchBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.18)',
    borderColor: 'rgba(212, 175, 55, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  journeyMatchText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: Colors.gold,
  },
  journeyActionButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  journeyActionText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.gold,
  },
  journeyActionTextActive: {
    color: Colors.cream,
  },
  categorySection: {
    marginBottom: Spacing.lg,
  },
  categorySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  categorySectionTitle: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.gold,
  },
  selectAllRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  selectAllButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  selectAllText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.gold,
  },
  seedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  seedItemSelected: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderColor: Colors.gold,
  },
  seedCheckbox: {
    marginRight: Spacing.md,
  },
  seedCheckboxEmpty: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.latte,
  },
  seedCheckboxChecked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seedCheckmark: {
    color: Colors.espresso,
    fontSize: 14,
    fontWeight: 'bold',
  },
  seedItemContent: {
    flex: 1,
  },
  seedItemText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
    marginBottom: Spacing.xs,
  },
  seedItemMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  seedItemStage: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.latte,
    opacity: 0.8,
  },
  seedItemDays: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.latte,
    opacity: 0.8,
  },
  noSeedsContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  noSeedsEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  noSeedsText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.cream,
    marginBottom: Spacing.sm,
  },
  noSeedsSubtext: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.latte,
    textAlign: 'center',
    opacity: 0.8,
  },
  modalFooter: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedCount: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.latte,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  skipButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  skipButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.latte,
  },
  waterButton: {
    flex: 2,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  waterButtonDisabled: {
    opacity: 0.6,
  },
  waterButtonGradient: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  waterButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.espresso,
  },

  // Completion Modal Styles
  completionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  completionContainer: {
    width: '100%',
    maxWidth: 340,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  completionGradient: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  completionEmoji: {
    fontSize: 64,
    marginBottom: Spacing.md,
  },
  completionTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeXL,
    color: Colors.espresso,
    marginBottom: Spacing.sm,
  },
  completionText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.espresso,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    opacity: 0.9,
  },
  completionHint: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.mocha,
    marginBottom: Spacing.lg,
  },
  completionButton: {
    backgroundColor: Colors.espresso,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.full,
  },
  completionButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.cream,
  },
  
  // Preview Completion Styles (for users with no seeds)
  previewHint: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.mocha,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    opacity: 0.9,
  },
  plantSeedsButton: {
    width: '100%',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  plantSeedsGradient: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  plantSeedsText: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeMD,
    color: Colors.cream,
    textAlign: 'center',
  },
  previewDoneButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  previewDoneText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
  },
});
