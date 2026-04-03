import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  StatusBar,
  Keyboard,
  Modal,
  Pressable,
  InteractionManager,
} from 'react-native';
import { showAlert } from '../utils/crossPlatformAlert';
import { appendNextStepOffer, createNextStepOfferState } from '../utils/nextStepOffer';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

/** Keyboard overlap height for scroll padding (RN metrics), separate from composer motion (KeyboardStickyView). */
function keyboardHeightFromEvent(e?: { endCoordinates?: { height?: number } }): number {
  const h = e?.endCoordinates?.height;
  return Math.max(0, typeof h === 'number' ? h : 0);
}

// Conversation starters are now defined inside the component with translations
import SEED_DATA, { detectCategory, SeedOption } from '../constants/seedOptions';
import { PHASE_RESPONSES, PHASE_BUTTONS, EXPERIENCED_USER_RESPONSES } from '../constants/phaseResponses';
import { sendMessageToDeepSeek, sendPostCompletionMessage, sendDirectChatMessage, sendDirectChatMessageStream, ChatMessage as DeepSeekMessage, DirectChatIntent, getFeelingValidationFromDeepSeek, getPersonalizedExplorationMessage, getPersonalizedMirrorAndSeeds, PersonalizedMirrorAndSeeds, generateProblemTitle, generateExperienceOptions, ExperienceOption, getGoalModeExcitementResponse, getGoalModeValidationResponse, getGoalModeSeeds, generateGoalTitle } from '../services/deepseekApi';
import { 
  savePendingMeditation, 
  getPendingMeditation, 
  completeMeditation,
  addSeedsToGarden,
  getAllGardenSeeds,
  CATEGORY_TO_MEDITATION,
  LoggedSeed,
  PendingMeditation,
  updateSeedsProblemTitle,
  ConversationStyle,
  incrementCompletedConversations,
  getHarvestStoryForConversation,
} from '../services/meditationStorage';
import {
  ChatConversation,
  ChatMessage,
  getAllConversations,
  getOrCreateActiveConversation,
  createConversation,
  updateConversation,
  addMessagesToConversation,
  updateConversationCategory,
  refreshConversationTitle,
  logSeedsToConversation,
  markMeditationCompleted,
  startNewChat,
  setActiveChatId,
  consumeForceOpenChatId,
  isExperiencedUser,
  ChatPhase,
  StoredPersonalizedContent,
  markConversationGardenTicketed,
} from '../services/chatStorage';
import { deleteJourneyEverywhere } from '../services/journeyDeletion';
import { meditations } from '../constants/meditations';
import { RootStackParamList, MainTabParamList } from '../navigation/AppNavigator';
import { bucketTextLength, trackEvent } from '../services/analytics';
import { getFirebaseAuth } from '../services/firebase';
import { maybeRequestNotificationsAfterAuth } from '../services/notificationService';
import { subscribeCloudRestore } from '../services/cloudRestoreEvents';
import { refreshChatFromCloudIfRemoteIsNewer } from '../services/cloudSync';
import {
  canSendUserMessage,
  recordUserMessageSent,
  canSpendGardenTicket,
  recordGardenTicketSpent,
  getEffectivePremiumFlag,
  setDevForcePremium,
  getFreeLimitsSnapshot,
  FREE_MESSAGE_LIMIT,
} from '../services/subscriptionGate';

const { width, height } = Dimensions.get('window');

type ChatScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Chat'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type Phase = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

// Conversation mode type
type ConversationMode = 'problem' | 'goal' | null;

function buildMeditationCompletedMessage(
  t: (key: string, opts?: Record<string, string | number>) => string,
  planted: number,
  watered: number
): string {
  const p = planted || 0;
  const w = watered || 0;
  const footer = t('chat.system.meditationCompleted.footer');
  let lead: string;
  if (p <= 0 && w > 0) {
    lead = t('chat.system.meditationCompleted.zeroPlanted', { watered: w });
  } else if (p === 1 && w === 1) {
    lead = t('chat.system.meditationCompleted.oneOne');
  } else if (p === 1 && w > 1) {
    lead = t('chat.system.meditationCompleted.oneMany', { watered: w });
  } else if (p > 1 && w === 1) {
    lead = t('chat.system.meditationCompleted.manyOne', { planted: p });
  } else if (p > 1 && w > 1) {
    lead = t('chat.system.meditationCompleted.manyMany', { planted: p, watered: w });
  } else {
    lead = t('chat.system.meditationCompleted.oneOne');
  }
  return `${lead}${footer}`;
}

// Initial messages are now created dynamically in the component to support translations

// Message Bubble Component
const MessageBubble = ({ message }: { message: Message }) => {
  const { i18n } = useTranslation();
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideIn = useRef(new Animated.Value(message.isUser ? 20 : -20)).current;
  const [copied, setCopied] = useState(false);
  const [isHoveringCopy, setIsHoveringCopy] = useState(false);

  const normalizeAssistantHeadings = useCallback(
    (input: string) => {
      const raw = (input || '').replace(/\r\n/g, '\n');
      const lines = raw.split('\n');

      const normalizeLine = (line: string) => {
        const t = (line || '').trim();
        if (!t) return line;

        // If the line already starts with an emoji/symbol, keep it.
        if (/^[\p{Extended_Pictographic}🪞💜🌱☕✨🎯✅❌👉]/u.test(t)) return line;

        const lower = t.toLowerCase();
        // EN headings
        if (lower.startsWith('support') || lower.startsWith('validation')) return `💜 ${t}`;
        if (lower.startsWith('possible past seeds')) return `🪞 ${t}`;
        if (lower.startsWith('seeds you can plant now')) return `🌱 ${t}`;
        if (lower.startsWith('here are some seeds you can plant now')) return `🌱 Seeds you can plant now:`;
        if (lower.startsWith('next step')) return `☕ ${t}`;
        if (lower.startsWith('the key') || lower.startsWith('main key') || lower.startsWith('intention'))
          return `🎯 ${t}`;

        // RU headings
        if (/^поддержк/i.test(t) || /^валидац/i.test(t)) return `💜 ${t}`;
        if (/^возможн/i.test(t) && /прошл/i.test(t) && /семен/i.test(t)) return `🪞 ${t}`;
        if (/^семена,?\s+которые\s+ты\s+можешь\s+посеять/i.test(t)) return `🌱 ${t}`;
        if (/^вот\s+несколько\s+семян/i.test(t)) return `🌱 Семена, которые ты можешь посеять сейчас:`;
        if (/^следующий\s+шаг/i.test(t)) return `☕ ${t}`;
        if (/^главный\s+ключ/i.test(t) || /^намерен/i.test(t)) return `🎯 ${t}`;

        return line;
      };

      return lines.map(normalizeLine).join('\n');
    },
    []
  );

  const getAssistantBlocks = useCallback(
    (text: string) => {
      const raw = (text || '').trim();
      if (!raw) return [];
      const blocks = raw
        .split(/\n{2,}/g)
        .map(s => s.trim())
        .filter(Boolean);

      const isListBlock = (b: string) => {
        const t = (b || '').trim();
        if (!t) return false;
        const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) return false;
        return lines.every(l => /^(🌱|🌿|•|-|👉|✅|❌)/.test(l));
      };

      const merged: string[] = [];
      for (const b of blocks) {
        if (merged.length > 0 && isListBlock(b) && isListBlock(merged[merged.length - 1])) {
          merged[merged.length - 1] = `${merged[merged.length - 1]}\n${b}`;
        } else {
          merged.push(b);
        }
      }
      return merged;
    },
    []
  );

  const assistantBlocks = useMemo(() => {
    if (message.isUser) return [];
    const normalized = normalizeAssistantHeadings(message.text || '');
    return getAssistantBlocks(normalized);
  }, [getAssistantBlocks, message.isUser, message.text, normalizeAssistantHeadings]);

  /** Single string for native UITextView-style selection (Select All / Copy) on assistant messages. */
  const assistantSelectableText = useMemo(
    () => (assistantBlocks.length > 0 ? assistantBlocks.join('\n\n') : message.text || ''),
    [assistantBlocks, message.text]
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(slideIn, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleCopy = async () => {
    try {
      if (message.isUser) {
        await Clipboard.setStringAsync(message.text);
      } else {
        await Clipboard.setStringAsync(assistantBlocks.join('\n\n') || message.text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  const copyTooltip =
    i18n.language === 'ru'
      ? (copied ? 'Скопировано' : 'Копировать')
      : (copied ? 'Copied' : 'Copy');

  return (
    <Animated.View
      style={[
        styles.messageContainer,
        !message.isUser && message.id === '1' && styles.welcomeMessageContainer,
        message.isUser ? styles.userMessageContainer : styles.aiMessageContainer,
        { opacity: fadeIn, transform: [{ translateX: slideIn }] },
      ]}
    >
      {!message.isUser && (
        <View style={styles.aiAvatar}>
          <LinearGradient colors={[Colors.mocha, Colors.latte]} style={styles.avatarGradient}>
            <Text style={styles.avatarEmoji}>🌱</Text>
          </LinearGradient>
        </View>
      )}
      {message.isUser ? (
        <View style={[styles.messageBubble, styles.userBubble]}>
          {Platform.OS === 'web' ? (
            <Text style={[styles.messageText, styles.userMessageText]} selectable>
              {message.text}
            </Text>
          ) : (
            <TextInput
              value={message.text}
              editable={false}
              multiline
              scrollEnabled={false}
              showSoftInputOnFocus={false}
              contextMenuHidden={false}
              onChangeText={() => {}}
              selectionColor={Platform.OS === 'ios' ? '#007AFF' : undefined}
              style={[styles.bubbleSelectableInput, styles.bubbleSelectableInputUser]}
            />
          )}
        </View>
      ) : (
        <View style={styles.aiBlock}>
          <View style={styles.aiCard}>
            {Platform.OS === 'web' ? (
              assistantBlocks.length > 0 ? (
                assistantBlocks.map((block, idx) => {
                  const next = assistantBlocks[idx + 1];
                  const isHeading = (b?: string) =>
                    !!b &&
                    b.length <= 80 &&
                    !b.includes('\n') &&
                    /^[\p{Extended_Pictographic}🪞💜🌱☕🎯]/u.test(b.trim());
                  const showDivider = idx < assistantBlocks.length - 1 && isHeading(next);
                  return (
                    <View key={`${message.id}-blk-${idx}`} style={styles.aiSection}>
                      <Text style={styles.aiMessageText} selectable>
                        {block}
                      </Text>
                      {showDivider && <View style={styles.aiSectionDivider} />}
                    </View>
                  );
                })
              ) : (
                <Text style={styles.aiMessageText} selectable>
                  {message.text}
                </Text>
              )
            ) : (
              <TextInput
                value={assistantSelectableText}
                editable={false}
                multiline
                scrollEnabled={false}
                showSoftInputOnFocus={false}
                contextMenuHidden={false}
                onChangeText={() => {}}
                selectionColor={Platform.OS === 'ios' ? '#007AFF' : undefined}
                style={[styles.bubbleSelectableInput, styles.bubbleSelectableInputAssistant]}
              />
            )}

            {/* Copy (always visible) */}
            <Pressable
              onPress={handleCopy}
              onHoverIn={Platform.OS === 'web' ? () => setIsHoveringCopy(true) : undefined}
              onHoverOut={Platform.OS === 'web' ? () => setIsHoveringCopy(false) : undefined}
              hitSlop={10}
              style={({ pressed }) => [styles.copyActionFloating, pressed && { opacity: 0.45 }]}
            >
              <MaterialIcons name={copied ? 'check' : 'content-copy'} size={18} color={Colors.textMuted} />
            </Pressable>

            {Platform.OS === 'web' && isHoveringCopy && (
              <View style={styles.copyTooltipFloating}>
                <Text style={styles.copyTooltipText}>{copyTooltip}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </Animated.View>
  );
};

// Phase Transition Button
const PhaseButton = ({ text, onPress, variant = 'primary' }: { text: string; onPress: () => void; variant?: 'primary' | 'secondary' }) => (
  <TouchableOpacity
    style={[styles.phaseButton, variant === 'secondary' && styles.phaseButtonSecondary]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <LinearGradient
      colors={variant === 'primary' ? [Colors.mocha, Colors.latte] : [Colors.cream, Colors.cream]}
      style={styles.phaseButtonGradient}
    >
      <Text style={[styles.phaseButtonText, variant === 'secondary' && styles.phaseButtonTextSecondary]}>
        {text}
      </Text>
    </LinearGradient>
  </TouchableOpacity>
);

// Mode Selection Card - for choosing between Problem and Goal flows
const ModeSelectionCard = ({ 
  onSelectProblem, 
  onSelectGoal 
}: { 
  onSelectProblem: () => void; 
  onSelectGoal: () => void; 
}) => {
  const { t } = useTranslation();
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.modeSelectionContainer, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
      <Text style={styles.modeSelectionTitle}>{t('chat.modeSelection.title')}</Text>
      
      <TouchableOpacity 
        style={styles.modeCard} 
        onPress={onSelectProblem}
        activeOpacity={0.8}
      >
        <View style={styles.modeCardContent}>
          <Text style={styles.modeCardEmoji}>🌧️</Text>
          <View style={styles.modeCardTextContainer}>
            <Text style={styles.modeCardTitle}>{t('chat.modeSelection.problemTitle')}</Text>
            <Text style={styles.modeCardSubtitle}>{t('chat.modeSelection.problemSubtitle')}</Text>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.modeCard, styles.modeCardGoal]} 
        onPress={onSelectGoal}
        activeOpacity={0.8}
      >
        <View style={styles.modeCardContent}>
          <Text style={styles.modeCardEmoji}>✨</Text>
          <View style={styles.modeCardTextContainer}>
            <Text style={styles.modeCardTitle}>{t('chat.modeSelection.goalTitle')}</Text>
            <Text style={styles.modeCardSubtitle}>{t('chat.modeSelection.goalSubtitle')}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Experience Selection Card - for gathering more context about user's situation
const ExperienceSelectionCard = ({ 
  options, 
  selectedOptions, 
  onToggleOption, 
  onContinue,
  isCollapsed = false,
  onToggle,
  canCollapse = false,
  isSubmitted = false,
}: { 
  options: ExperienceOption[];
  selectedOptions: string[];
  onToggleOption: (text: string) => void;
  onContinue: () => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  canCollapse?: boolean;
  isSubmitted?: boolean;
}) => {
  const isSelected = (text: string) => selectedOptions.includes(text);
  
  // Collapsed view - shows summary of what was selected
  if (isCollapsed) {
    const selectedCount = selectedOptions.length;
    const summaryText = selectedCount === 0 
      ? 'No specific experiences selected'
      : selectedCount === 1 
        ? `1 experience shared`
        : `${selectedCount} experiences shared`;
    
    return (
      <TouchableOpacity style={styles.collapsedCardLight} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.collapsedEmoji}>💭</Text>
        <View style={styles.collapsedContent}>
          <Text style={styles.collapsedTitleDark}>What You're Going Through</Text>
          <Text style={styles.collapsedHintDark}>{summaryText} • Tap to review</Text>
        </View>
        <Text style={styles.collapsedExpandDark}>▼</Text>
      </TouchableOpacity>
    );
  }
  
  return (
    <View style={styles.experienceCard}>
      {/* Collapse button - only show if card can be collapsed (after Continue was clicked once) */}
      {canCollapse && onToggle && (
        <TouchableOpacity style={styles.collapseButtonLight} onPress={onToggle} activeOpacity={0.7}>
          <Text style={styles.collapseIconDark}>▲</Text>
        </TouchableOpacity>
      )}
      
      {/* Header */}
      <Text style={styles.experienceTitle}>
        {isSubmitted ? 'What you shared:' : 'I want to understand more about what you\'re going through...'}
      </Text>
      {!isSubmitted && (
        <Text style={styles.experienceSubtitle}>
          Select any that feel true for you
        </Text>
      )}
      
      {/* Selection Chips */}
      <View style={styles.experienceChipsContainer}>
        {options.map((option, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.experienceChip,
              isSelected(option.text) && styles.experienceChipSelected,
            ]}
            onPress={isSubmitted ? undefined : () => onToggleOption(option.text)}
            activeOpacity={isSubmitted ? 1 : 0.7}
            disabled={isSubmitted}
          >
            <Text style={styles.experienceChipEmoji}>{option.emoji}</Text>
            <Text style={[
              styles.experienceChipText,
              isSelected(option.text) && styles.experienceChipTextSelected,
            ]}>
              {option.text}
            </Text>
            {isSelected(option.text) && (
              <Text style={styles.experienceChipCheck}>✓</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
      
      {/* Helper text - only show before submission */}
      {!isSubmitted && (
        <Text style={styles.experienceHelperText}>
          You can select multiple, or none at all
        </Text>
      )}
      
      {/* Continue Button - only show before submission */}
      {!isSubmitted && (
        <TouchableOpacity style={styles.experienceContinueButton} onPress={onContinue} activeOpacity={0.8}>
          <LinearGradient
            colors={[Colors.mocha, Colors.espresso]}
            style={styles.experienceContinueGradient}
          >
            <Text style={styles.experienceContinueText}>Continue →</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
};

// NOTE: Legacy guided cards (The Mirror / Your Seeds / Ready to Plant) were removed.
// SeedMind now uses Direct Chat + a lightweight seed logging modal instead.

// Log Seeds Card (Phase 6) - Multi-entry input
const LogSeedsCard = ({ 
  loggedSeeds, 
  currentSeedInput,
  onSeedInputChange,
  onAddSeed,
  onRemoveSeed,
  onStartMeditation,
  onSwitchToChat,
  showSwitchOption = false,
}: { 
  loggedSeeds: LoggedSeed[];
  currentSeedInput: string;
  onSeedInputChange: (text: string) => void;
  onAddSeed: () => void;
  onRemoveSeed: (id: string) => void;
  onStartMeditation: () => void;
  onSwitchToChat?: () => void;
  showSwitchOption?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <View style={styles.structuredCard}>
      <View style={styles.logSeedsContainer}>
        <Text style={styles.logSeedsTitle}>{t('chat.logSeeds.title')}</Text>
        <Text style={styles.logSeedsSubtitle}>
          {t('chat.logSeeds.subtitle')}
        </Text>
        
        {/* Already logged seeds */}
        {loggedSeeds.map((seed, index) => (
          <View key={seed.id} style={styles.loggedSeedItem}>
            <View style={styles.loggedSeedContent}>
              <Text style={styles.loggedSeedNumber}>{index + 1}</Text>
              <Text style={styles.loggedSeedText}>{seed.action}</Text>
            </View>
            <TouchableOpacity onPress={() => onRemoveSeed(seed.id)} style={styles.removeSeedButton}>
              <Text style={styles.removeSeedText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
        
        {/* Input for new seed */}
        <View style={styles.seedInputContainer}>
          <TextInput
            style={styles.seedInput}
            placeholder={t('chat.logSeeds.placeholder')}
            placeholderTextColor={Colors.textMuted}
            value={currentSeedInput}
            onChangeText={onSeedInputChange}
            multiline
            maxLength={200}
          />
          <TouchableOpacity 
            style={[styles.addSeedButton, !currentSeedInput.trim() && styles.addSeedButtonDisabled]} 
            onPress={onAddSeed}
            disabled={!currentSeedInput.trim()}
          >
            <Text style={styles.addSeedButtonText}>{t('chat.logSeeds.addButton')}</Text>
          </TouchableOpacity>
        </View>
        
        {loggedSeeds.length > 0 && (
          <>
            <View style={styles.logSeedsDivider} />
            <Text style={styles.logSeedsReady}>
              {t('chat.logSeeds.readyToWater', { count: loggedSeeds.length })}
            </Text>
            <TouchableOpacity style={styles.startMeditationButton} onPress={onStartMeditation} activeOpacity={0.8}>
              <LinearGradient colors={[Colors.espresso, Colors.darkRoast]} style={styles.startMeditationGradient}>
                <Text style={styles.startMeditationText}>{t('chat.logSeeds.startMeditation')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}
        
        {/* Switch to chat option */}
        {showSwitchOption && onSwitchToChat && (
          <TouchableOpacity style={styles.switchModeLink} onPress={onSwitchToChat} activeOpacity={0.7}>
            <Text style={styles.switchModeLinkText}>{t('chat.logSeeds.switchToChat')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// Typing Indicator
const TypingIndicator = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -8, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      ).start();
    };
    animateDot(dot1, 0);
    animateDot(dot2, 150);
    animateDot(dot3, 300);
  }, []);

  return (
    <View style={styles.typingContainer}>
      <View style={styles.aiAvatar}>
        <LinearGradient colors={[Colors.mocha, Colors.latte]} style={styles.avatarGradient}>
          <Text style={styles.avatarEmoji}>🌱</Text>
        </LinearGradient>
      </View>
      <View style={styles.typingBubble}>
        <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1 }] }]} />
        <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2 }] }]} />
        <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3 }] }]} />
      </View>
    </View>
  );
};

// Suggestion Chip
const SuggestionChip = ({
  text,
  onPress,
  style,
}: {
  text: string;
  onPress: () => void;
  style?: any;
}) => (
  <TouchableOpacity style={[styles.suggestionChip, style]} onPress={onPress} activeOpacity={0.7}>
    <Text style={styles.suggestionText}>{text}</Text>
  </TouchableOpacity>
);

// Note: Feeling validation is now handled by getFeelingValidationFromDeepSeek in deepseekApi.ts
// This gives personalized responses based on the user's specific situation

// Main Chat Screen
export default function ChatScreen() {
  console.log('[ChatScreen] Component rendering...');
  const { t, i18n, ready } = useTranslation();
  const navigation = useNavigation<ChatScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const ENABLE_TOPIC_CHANGE_PROMPT = false;

  const [isPremiumUi, setIsPremiumUi] = useState(false);
  const [freeMessagesUsed, setFreeMessagesUsed] = useState<number | null>(null);
  const [isCloudRestoring, setIsCloudRestoring] = useState(false);
  const cloudRestoreUidRef = useRef<string | null>(null);
  const restoreOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadConversationIntoStateRef = useRef<(c: ChatConversation) => Promise<void>>(async () => {});

  const refreshPremiumAndUsage = useCallback(async () => {
    try {
      const premium = await getEffectivePremiumFlag();
      setIsPremiumUi(premium);
      if (!premium) {
        const snap = await getFreeLimitsSnapshot();
        setFreeMessagesUsed(snap.messagesUsed);
      } else {
        setFreeMessagesUsed(null);
      }
    } catch {
      setIsPremiumUi(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshPremiumAndUsage();
    }, [refreshPremiumAndUsage])
  );

  // Keep Chat UI consistent while cloud restore is running.
  // Without this, users can see an "empty" state after updates until some unrelated action re-renders.
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
      // Avoid a jarring flash when restore completes quickly.
      restoreOverlayTimerRef.current = setTimeout(() => {
        restoreOverlayTimerRef.current = null;
        setIsCloudRestoring(true);
      }, 520);
    };

    const unsub = subscribeCloudRestore((s) => {
      const uid = getFirebaseAuth().currentUser?.uid ?? null;
      cloudRestoreUidRef.current = uid;
      if (!uid) {
        stopOverlay();
        return;
      }
      if (s.uid !== uid) return;
      if (s.phase === 'restoring') startOverlayWithDelay();
      else stopOverlay();
      if (s.phase === 'done') {
        // Force refresh so restored conversations appear immediately (no "type something" needed).
        Promise.resolve()
          .then(() => getAllConversations())
          .then(async (allConvos) => {
            setConversations(allConvos);
            const id = currentChatIdRef.current;
            if (id) {
              const c = allConvos.find((x) => x.id === id);
              if (c) {
                await loadConversationIntoStateRef.current(c);
              }
            }
          })
          .catch(() => {});
      }
    });
    return () => {
      stopOverlay();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Create initial messages with translations
  // Depend on i18n.language so messages update when language changes
  const getInitialMessagesGuided = useCallback((): Message[] => [
    {
      id: '1',
      text: t('chat.initialMessages.guidedWelcome'),
      isUser: false,
      timestamp: new Date(),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [i18n.language]);

  const getInitialMessagesDirect = useCallback((): Message[] => [
    {
      id: '1',
      text: t('chat.initialMessages.directWelcome'),
      isUser: false,
      timestamp: new Date(),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [i18n.language]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getProblemModeOpener = useCallback(() => t('chat.modeOpeners.problem'), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getGoalModeOpener = useCallback(() => t('chat.modeOpeners.goal'), []);

  // Conversation starters with translations
  const getConversationStarters = useCallback(() => [
    t('chat.starters.money'),
    t('chat.starters.relationships'),
    t('chat.starters.peace'),
    t('chat.starters.career'),
    t('chat.starters.health'),
    t('chat.starters.lonely'),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [i18n.language]);

  const getGoalStarters = useCallback(() => [
    t('chat.starters.competition'),
    t('chat.starters.promoted'),
    t('chat.starters.soulmate'),
    t('chat.starters.moreMoney'),
    t('chat.starters.exams'),
    t('chat.starters.business'),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [i18n.language]);

  // Translated versions of date and phase display
  const formatConversationDateTranslated = useCallback((dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return t('common.today');
    } else if (diffDays === 1) {
      return t('common.yesterday');
    } else if (diffDays < 7) {
      return t('chat.history.daysAgo', { count: diffDays });
    } else {
      const locale = i18n.language === 'ru' ? 'ru-RU' : 'en-US';
      return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

  const getPhaseDisplayTextTranslated = useCallback((phase: string | number): string => {
    if (phase === 'completed') return t('chat.phases.completed');
    
    const phaseKeys: Record<number, string> = {
      1: 'sharing',
      2: 'exploring',
      3: 'understanding',
      4: 'gettingIdeas',
      5: 'readyToPlant',
      6: 'logging',
      7: 'meditating',
    };
    
    const key = phaseKeys[phase as number];
    return key ? t(`chat.phases.${key}`) : t('chat.phases.inProgress');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);
  
  const [messages, setMessages] = useState<Message[]>([]); // Will be initialized in useEffect
  const userMessageCount = messages.filter(m => m.isUser).length;
  const [isInitialized, setIsInitialized] = useState(false);
  const nextStepOfferStateRef = useRef(createNextStepOfferState());
  
  // Initialize messages once on mount
  useEffect(() => {
    console.log('[ChatScreen] Init useEffect - messages:', messages.length);
    if (messages.length === 0) {
      try {
        const translatedText = t('chat.initialMessages.directWelcome');
        // Use fallback if translation key is returned as-is
        const welcomeText = translatedText && !translatedText.includes('chat.initialMessages') 
          ? translatedText 
          : "Hey there, friend! ☕\n\nI'm your Seeds Guide — think of me as your personal karma coach. Whatever's on your mind — a challenge, a dream, a feeling — I'm here to help you plant the right seeds.\n\nWhat's going on today?";
        
        setMessages([{
          id: '1',
          text: welcomeText,
          isUser: false,
          timestamp: new Date(),
        }]);
        setIsInitialized(true);
        console.log('[ChatScreen] Initial messages set');
      } catch (error) {
        console.error('[ChatScreen] Error initializing messages:', error);
        setMessages([{
          id: '1',
          text: 'Welcome to SeedMind ☕ What\'s on your mind today?',
          isUser: false,
          timestamp: new Date(),
        }]);
        setIsInitialized(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // Run once on mount - t is stable from i18n
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingChatId, setTypingChatId] = useState<string | null>(null);
  const cancelStreamRef = useRef<null | (() => void)>(null);
  const streamCancelledRef = useRef(false);
  const [phase, setPhase] = useState<Phase>(1);
  const [category, setCategory] = useState<string>('general');
  const [hasSharedFeeling, setHasSharedFeeling] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const isKeyboardVisibleRef = useRef(false);
  /** Synced in keyboard listeners (not only after render) so layout/resync logic stays accurate. */
  const keyboardOpenRef = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showSuggestionsHint, setShowSuggestionsHint] = useState(true);
  const [suggestionsScrollable, setSuggestionsScrollable] = useState(false);
  const suggestionsLayoutWRef = useRef(0);
  const suggestionsContentWRef = useRef(0);
  const [inputBarHeight, setInputBarHeight] = useState(0);

  useEffect(() => {
    if (userMessageCount === 0) {
      setShowSuggestionsHint(true);
    }
  }, [userMessageCount]);
  
  // Phase visibility states
  const [showPhase1Button, setShowPhase1Button] = useState(false);
  const [showPhase2Buttons, setShowPhase2Buttons] = useState(false);
  const [, setShowAha] = useState(false);
  const [, setShowSeedIdeas] = useState(false);
  const [, setShowGoPlant] = useState(false);
  const [showSeedLog, setShowSeedLog] = useState(false);
  
  // Card expand/collapse states (collapsed cards can be tapped to expand)
  const [, setAhaExpanded] = useState(true);
  const [, setSeedIdeasExpanded] = useState(true);
  const [, setGoPlantExpanded] = useState(true);
  
  // Personalized Mirror & Seeds content (generated by DeepSeek)
  const [personalizedContent, setPersonalizedContent] = useState<PersonalizedMirrorAndSeeds | null>(null);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  
  // Generated problem title (clean, short title for conversation and seeds)
  const [generatedProblemTitle, setGeneratedProblemTitle] = useState<string | null>(null);
  
  // Track if this is the user's first conversation (for layout decisions)
  const [isFirstConversation, setIsFirstConversation] = useState(true);
  
  // Track if user clicked "Let me think..." (skeptical mode - use softer language)
  const [isSkepticalMode, setIsSkepticalMode] = useState(false);
  
  // Track if "Show me" button should be visible (for skeptical users)
  const [, setShowShowMeButton] = useState(false);
  
  // Track if this is a "heavy topic" that requires a different flow (skip Mirror)
  const [isHeavyTopic, setIsHeavyTopic] = useState(false);
  
  // Experience selection states (for better personalization)
  const [showExperienceSelection, setShowExperienceSelection] = useState(false);
  const [experienceOptions, setExperienceOptions] = useState<ExperienceOption[]>([]);
  const [selectedExperiences, setSelectedExperiences] = useState<string[]>([]);
  const [isGeneratingExperiences, setIsGeneratingExperiences] = useState(false);
  const [experienceExpanded, setExperienceExpanded] = useState(true);
  
  // Seed logging states
  const [loggedSeeds, setLoggedSeeds] = useState<LoggedSeed[]>([]);
  const [currentSeedInput, setCurrentSeedInput] = useState('');
  
  // Chat history states
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showPostCompletionOptions, setShowPostCompletionOptions] = useState(false);
  const [isExperienced, setIsExperienced] = useState(false);
  const [isConversationHarvested, setIsConversationHarvested] = useState(false);
  
  // Title editing states
  const [editingConvoId, setEditingConvoId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isInPostCompletionMode, setIsInPostCompletionMode] = useState(false); // Track if user picked an option
  const [postCompletionChatMode, setPostCompletionChatMode] = useState(false); // Track if in chat mode after completion
  
  // Topic change detection states
  const [showTopicChangePrompt, setShowTopicChangePrompt] = useState(false);
  // Variant B: don't disable prompts forever; instead keep a baseline category and re-prompt on the next real topic shift.
  const [topicBaselineCategory, setTopicBaselineCategory] = useState<string>('general');
  const [topicChangeFromCategory, setTopicChangeFromCategory] = useState<string>('general');
  const [lastTopicChangePromptKey, setLastTopicChangePromptKey] = useState<string>('');
  const [pendingMessage, setPendingMessage] = useState<string>('');
  const [detectedNewCategory, setDetectedNewCategory] = useState<string>('');
  
  // Conversation mode: 'problem' for challenges, 'goal' for aspirations, null for not yet chosen
  const [conversationMode, setConversationMode] = useState<ConversationMode>(null);
  const [showModeSelection, setShowModeSelection] = useState(true);
  
  // Conversation style: we now run Direct chat mode by default (full welcome + freeform mentor chat)
  const [conversationStylePref, setConversationStylePref] = useState<ConversationStyle>('direct');
  
  // Direct Chat mode: seed logging modal states
  const [showDirectChatSeedModal, setShowDirectChatSeedModal] = useState(false);
  const [directChatSeedInput, setDirectChatSeedInput] = useState('');
  const [directChatSeeds, setDirectChatSeeds] = useState<LoggedSeed[]>([]);
  
  // Helper to get the right initial messages based on style preference
  const getInitialMessages = useCallback(() => {
    return conversationStylePref === 'direct' ? getInitialMessagesDirect() : getInitialMessagesGuided();
  }, [conversationStylePref, getInitialMessagesDirect, getInitialMessagesGuided]);
  
  const scrollViewRef = useRef<ScrollView>(null);
  // Jump-to-bottom once after loading a conversation to avoid visible "speed run" scrolling.
  const shouldJumpToBottomRef = useRef(false);
  // Track whether the user is already at the bottom to avoid jumpy auto-scroll while reading.
  const isNearBottomRef = useRef(true);
  // Track current scroll offset so we can restore after modals/navigation.
  const lastScrollYRef = useRef(0);
  const savedScrollAnchorRef = useRef<{ y: number; wasNearBottom: boolean } | null>(null);
  /** Set when Chat loses focus (e.g. switching tabs); next focus restores scroll so action rows stay visible. */
  const shouldRestoreScrollAfterBlurRef = useRef(false);
  // Track which assistant reply is currently streaming.
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [showNewBelowMain, setShowNewBelowMain] = useState(false);
  const lastMainContentHRef = useRef(0);

  const currentChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  // When starting a brand-new conversation, `currentChatId` can be null for one render
  // even after we have already created a new chat and set `typingChatId`.
  // Treat "null currentChatId + active typingChatId" as typing in this screen so the first reply can't be dropped.
  const isTypingHere =
    isTyping &&
    typingChatId != null &&
    (typingChatId === currentChatId || currentChatId == null);

  const canStopGenerating = isTypingHere || streamingMessageId != null;
  const handleStopGenerating = useCallback(() => {
    streamCancelledRef.current = true;
    try {
      cancelStreamRef.current?.();
    } catch {
      // ignore
    }
    // Hide the typing indicator immediately; keep whatever text already streamed.
    setIsTyping(false);
    setTypingChatId(null);
  }, [isTypingHere, streamingMessageId]);

  const directChatActionsEnabled = userMessageCount > 0;
  const CHAT_ACTIONS_INFO_SEEN_KEY = 'seedmind_chat_actions_info_seen_v1';
  const [showChatActionsInfoDot, setShowChatActionsInfoDot] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const seen = await AsyncStorage.getItem(CHAT_ACTIONS_INFO_SEEN_KEY);
        if (!seen) setShowChatActionsInfoDot(true);
      } catch {
        // ignore
      }
    })();
  }, []);
  const handleDirectChatActionsLocked = useCallback(() => {
    const title = t('chat.actions.sendFirstTitle');
    const body = t('chat.actions.sendFirstBody');
    const titleSafe =
      title && !title.includes('chat.actions')
        ? title
        : i18n.language === 'ru'
          ? 'Один маленький шаг'
          : 'One small step';
    const bodySafe =
      body && !body.includes('chat.actions')
        ? body
        : i18n.language === 'ru'
          ? 'Сначала отправь одно сообщение — так я подберу семена и медитацию именно для этого пути. После этого кнопки станут активны. 🌱'
          : 'Send one message first so I can tailor your seeds and meditation to this journey. Then these buttons unlock. 🌱';
    showAlert(
      titleSafe,
      bodySafe,
      [{ text: t('common.gotIt'), style: 'default' }]
    );
  }, [i18n.language, t]);

  const dismissChatActionsInfoDot = useCallback(() => {
    setShowChatActionsInfoDot(false);
    AsyncStorage.setItem(CHAT_ACTIONS_INFO_SEEN_KEY, '1').catch(() => {});
  }, []);

  const scrollToBottomInstant = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: false });
  }, []);

  const captureScrollAnchor = useCallback(() => {
    savedScrollAnchorRef.current = {
      y: lastScrollYRef.current || 0,
      wasNearBottom: !!isNearBottomRef.current,
    };
  }, []);

  const restoreScrollAnchor = useCallback((opts?: { animated?: boolean }) => {
    const a = savedScrollAnchorRef.current;
    if (!a) return;
    const animated = opts?.animated ?? true;
    // Always restore the saved offset. Treating "near bottom" as scrollToEnd was hiding the
    // Plant/Meditate row after tab switches because the threshold fired too early.
    scrollViewRef.current?.scrollTo({ y: Math.max(0, a.y), animated });
  }, []);

  const handleMessagesScroll = useCallback((e: any) => {
    try {
      const { layoutMeasurement, contentOffset, contentSize } = e?.nativeEvent || {};
      lastScrollYRef.current = contentOffset?.y || 0;
      const paddingToBottom = 90;
      const nearBottom =
        (layoutMeasurement?.height || 0) + (contentOffset?.y || 0) >=
        (contentSize?.height || 0) - paddingToBottom;
      isNearBottomRef.current = !!nearBottom;
      if (nearBottom) setShowNewBelowMain(false);
    } catch {
      // ignore
    }
  }, []);
  
  // Refs for tracking card positions for smart scrolling
  const cardPositions = useRef<{[key: string]: number}>({});

  // Load conversation style preference - reload when screen comes into focus (e.g., after changing in Settings)
  // Use a ref to track if user has messages to avoid stale closure and infinite loop
  const hasUserMessagesRef = useRef(false);
  
  // Keep the ref in sync with messages state
  useEffect(() => {
    hasUserMessagesRef.current = messages.some(m => m.isUser);
  }, [messages]);
  
  useFocusEffect(
    useCallback(() => {
      const loadStyle = async () => {
        // Force Direct mode (we no longer use Guided flow)
        setConversationStylePref('direct');
        // Ensure initial message is always the full direct welcome (only if no user messages yet)
        if (!hasUserMessagesRef.current) {
          setMessages(getInitialMessagesDirect());
        }
      };
      loadStyle();
    }, [getInitialMessagesDirect]) // Re-run when language changes (callback depends on i18n.language)
  );

  // Update initial messages when language changes (for users who haven't started chatting yet)
  useEffect(() => {
    // Use messages state (not ref) to avoid stale ref issues when language changes.
    const hasUserMessages = messages.some(m => m.isUser);
    if (hasUserMessages) return;

    const expectedText = t('chat.initialMessages.directWelcome');
    if (!expectedText || expectedText.includes('chat.initialMessages')) return;

    const shouldReplace =
      messages.length === 0 ||
      (messages.length === 1 && !messages[0].isUser && messages[0].text !== expectedText);

    if (!shouldReplace) return;

    setMessages([
      {
        id: '1',
        text: expectedText,
        isUser: false,
        timestamp: new Date(),
      },
    ]);
  }, [i18n.language, messages, t]);

  // Keep a global pointer to the active chat for other tabs (e.g., Meditations recommendations).
  useEffect(() => {
    void setActiveChatId(currentChatId);
  }, [currentChatId]);

  const refreshConversationsList = async () => {
    const allConvos = await getAllConversations();
    setConversations(allConvos);

    // Check if user is experienced (has completed at least 1 conversation)
    const experienced = await isExperiencedUser();
    setIsExperienced(experienced);
  };

  const resetGuideUiToFresh = useCallback(() => {
    setCurrentChatId(null);
    setMessages(getInitialMessages());
    setPhase(1);
    setCategory('general');
    setHasSharedFeeling(false);
    setShowPhase1Button(false);
    setShowPhase2Buttons(false);
    setShowAha(false);
    setShowSeedIdeas(false);
    setShowGoPlant(false);
    setShowSeedLog(false);
    setLoggedSeeds([]);
    setIsCompleted(false);
    setShowPostCompletionOptions(false);
    setShowHistoryDrawer(false);
    setIsInPostCompletionMode(false);
    setPostCompletionChatMode(false);
    setAhaExpanded(true);
    setSeedIdeasExpanded(true);
    setGoPlantExpanded(true);
    setShowExperienceSelection(false);
    setExperienceOptions([]);
    setSelectedExperiences([]);
    setIsGeneratingExperiences(false);
    setExperienceExpanded(true);
    setIsHeavyTopic(false);
    setShowTopicChangePrompt(false);
    setPendingMessage('');
    setDetectedNewCategory('');
    setTopicBaselineCategory('general');
    setTopicChangeFromCategory('general');
    setLastTopicChangePromptKey('');
    setPersonalizedContent(null);
    setIsGeneratingContent(false);
    setGeneratedProblemTitle(null);
    setIsFirstConversation(true);
    setIsSkepticalMode(false);
    setShowShowMeButton(false);
    setConversationMode(null);
    setShowModeSelection(true);
    setIsConversationHarvested(false);
    setInputText('');
    setShowDirectChatSeedModal(false);
    setDirectChatSeeds([]);
    setDirectChatSeedInput('');
  }, [getInitialMessages]);

  const guideSessionBootstrapDoneRef = useRef(false);

  // Load conversation list on mount (Chat may mount before it is first focused).
  useEffect(() => {
    void refreshConversationsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConversationIntoState = async (convo: ChatConversation) => {
    // Persist immediately so the Meditations tab always knows which conversation is active,
    // even if the user switches tabs before React effects run.
    await setActiveChatId(convo.id);
    setCurrentChatId(convo.id);
    setCategory(convo.category);
    
    // Check if this conversation has been harvested
    const harvestStory = await getHarvestStoryForConversation(convo.id);
    setIsConversationHarvested(harvestStory !== null);
    
    // Restore personalized content if available
    if (convo.personalizedContent) {
      setPersonalizedContent({
        mirrorExplanation: convo.personalizedContent.mirrorExplanation,
        reciprocalLaw: convo.personalizedContent.reciprocalLaw,
        seeds: convo.personalizedContent.seeds,
      });
    } else {
      setPersonalizedContent(null);
    }
    
    // Restore isFirstConversation flag
    setIsFirstConversation(convo.isFirstConversation ?? true);
    
    // Use conversation title as the generated problem title
    setGeneratedProblemTitle(convo.title);
    
    // Convert stored messages to Message format
    if (convo.messages.length > 0) {
      // Ensure we land at the bottom instantly once content is laid out.
      shouldJumpToBottomRef.current = true;

      // Determine the language this conversation was created in.
      // - Prefer stored `convo.language`
      // - Fallback: infer from stored messages (Cyrillic => Russian)
      const inferredLang: 'en' | 'ru' = (() => {
        if (convo.language === 'ru' || convo.language === 'en') return convo.language;
        const combined = convo.messages.map(m => m.text).join(' ');
        return /[А-Яа-яЁё]/.test(combined) ? 'ru' : 'en';
      })();

      const loadedMessages: Message[] = convo.messages.map(m => ({
        id: m.id,
        text: m.text,
        isUser: m.isUser,
        timestamp: new Date(m.timestamp),
      }));
      // Prepend the welcome in the conversation's original language (not the current app language).
      const welcomeKey =
        conversationStylePref === 'direct'
          ? 'chat.initialMessages.directWelcome'
          : 'chat.initialMessages.guidedWelcome';
      const welcomeText = t(welcomeKey, { lng: inferredLang });
      const initialMsgs: Message[] = [
        {
          id: '1',
          text: welcomeText,
          isUser: false,
          timestamp: new Date(),
        },
      ];
      setMessages([...initialMsgs, ...loadedMessages]);
      setHasSharedFeeling(true);
      
      // Restore phase and ALL UI states based on phase
      const phase = convo.phase === 'completed' ? 7 : (convo.phase as Phase);
      setPhase(phase);
      
      // Restore UI flags based on how far the conversation progressed
      // Phase 1 & 2 buttons only show during active conversation, not when loading
      setShowPhase1Button(false);
      setShowPhase2Buttons(false);
      
      // Show cards based on phase progress
      setShowAha(phase >= 3);
      setShowSeedIdeas(phase >= 4);
      setShowGoPlant(phase >= 5);
      setShowSeedLog(false); // Don't auto-show - user must click "Log more seeds" button
      
      // Set expand states - past cards collapsed, current card expanded
      setAhaExpanded(phase === 3);
      setSeedIdeasExpanded(phase === 4);
      setGoPlantExpanded(phase === 5);
      
      // Handle completion state
      const isComplete = convo.meditationCompleted || convo.phase === 'completed';
      setIsCompleted(isComplete);
      
      // Restore post-completion mode states from saved conversation
      const wasInPostCompletionMode = convo.isInPostCompletionMode ?? false;
      const wasInChatMode = convo.postCompletionChatMode ?? false;
      setIsInPostCompletionMode(wasInPostCompletionMode);
      setPostCompletionChatMode(wasInChatMode);
      
      // Only show post-completion options if user hasn't already picked a mode
      // If they were in chat mode, don't show options - they can use the switch link
      setShowPostCompletionOptions(isComplete && !wasInPostCompletionMode);
      
      // Reset skeptical mode and show me button (they'll be set if needed during conversation)
      setIsSkepticalMode(false);
      setShowShowMeButton(false);
      
      // Restore experience selection card (collapsed) if past that phase
      setShowExperienceSelection(phase >= 2);
      setExperienceOptions(convo.experienceOptions || []);
      setSelectedExperiences(convo.selectedExperiences || []);
      setIsGeneratingExperiences(false);
      setExperienceExpanded(false); // Always collapsed when loading
      
      // Restore heavy topic flag
      setIsHeavyTopic(convo.isHeavyTopic ?? false);
      
      // Restore conversation mode (problem or goal)
      setConversationMode(convo.conversationMode || 'problem');
      setShowModeSelection(false); // Don't show mode selection for existing conversations
      
      // Restore logged seeds
      if (convo.seedsLogged.length > 0) {
        setLoggedSeeds(convo.seedsLogged.map(s => ({
          id: s.id,
          action: s.action,
          whoHelped: '',
        })));
      }
    }
  };

  // Save current conversation to storage
  const saveCurrentConversation = async (newMessages?: Message[]) => {
    if (!currentChatId) return;
    
    const messagesToSave: ChatMessage[] = (newMessages || messages)
      .filter(m => !getInitialMessages().find(im => im.id === m.id))
      .map(m => ({
        id: m.id,
        text: m.text,
        isUser: m.isUser,
        timestamp: m.timestamp.toISOString(),
      }));
    
    await updateConversation(currentChatId, {
      messages: messagesToSave,
      phase: isCompleted ? 'completed' : phase,
      category,
      // Save experience selection data
      selectedExperiences: selectedExperiences,
      experienceOptions: experienceOptions,
      // Save heavy topic flag for different flow
      isHeavyTopic: isHeavyTopic,
      // Save post-completion mode states (for restoring chat state)
      isInPostCompletionMode: isInPostCompletionMode,
      postCompletionChatMode: postCompletionChatMode,
      // Save conversation mode (problem or goal)
      conversationMode: conversationMode || undefined,
    });
  };

  loadConversationIntoStateRef.current = loadConversationIntoState;

  // Auto-save conversation when messages or key states change
  useEffect(() => {
    if (messages.length > getInitialMessages().length && currentChatId) {
      saveCurrentConversation();
    }
  }, [messages, phase, isCompleted, isInPostCompletionMode, postCompletionChatMode]);

  useEffect(() => {
    isKeyboardVisibleRef.current = isKeyboardVisible;
  }, [isKeyboardVisible]);

  /** Legacy hook after scroll/streaming; composer position is handled by KeyboardStickyView. */
  const scheduleComposerResyncIfKeyboardClosed = useCallback(() => {
    InteractionManager.runAfterInteractions(() => {});
  }, []);

  // Scroll padding only — composer tracks keyboard via KeyboardStickyView (react-native-keyboard-controller).
  useEffect(() => {
    if (Platform.OS === 'ios') {
      const willChangeFrame = Keyboard.addListener('keyboardWillChangeFrame', (e?: any) => {
        const liftPx = keyboardHeightFromEvent(e);
        const open = liftPx > 1;
        keyboardOpenRef.current = open;
        setIsKeyboardVisible(open);
        setKeyboardHeight(open ? liftPx : 0);
      });
      const willHide = Keyboard.addListener('keyboardWillHide', () => {
        keyboardOpenRef.current = false;
        setIsKeyboardVisible(false);
        setKeyboardHeight(0);
      });
      const didHide = Keyboard.addListener('keyboardDidHide', () => {
        keyboardOpenRef.current = false;
        setIsKeyboardVisible(false);
        setKeyboardHeight(0);
      });
      return () => {
        willChangeFrame.remove();
        willHide.remove();
        didHide.remove();
      };
    }

    const keyboardDidShow = Keyboard.addListener('keyboardDidShow', (e?: any) => {
      const liftPx = keyboardHeightFromEvent(e);
      keyboardOpenRef.current = true;
      setIsKeyboardVisible(true);
      setKeyboardHeight(liftPx);
    });
    const keyboardDidHide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardOpenRef.current = false;
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      keyboardDidShow.remove();
      keyboardDidHide.remove();
    };
  }, []);

  // If the user switches tabs while the keyboard is open, iOS can skip the "keyboardWillHide" event.
  // That leaves the input translated upward when returning to Chat. Force a reset on blur.
  useFocusEffect(
    useCallback(() => {
      return () => {
        try {
          captureScrollAnchor();
          shouldRestoreScrollAfterBlurRef.current = true;
        } catch {
          // ignore
        }
        try {
          Keyboard.dismiss();
        } catch {
          // ignore
        }
        try {
          keyboardOpenRef.current = false;
          setIsKeyboardVisible(false);
          setKeyboardHeight(0);
        } catch {
          // ignore
        }
      };
    }, [captureScrollAnchor, tabBarHeight])
  );

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Main refresh function that runs sequentially to avoid race conditions
      const refreshOnFocus = async () => {
        let remoteChatPulled = false;
        try {
          const authUser = getFirebaseAuth().currentUser;
          if (authUser) {
            remoteChatPulled = await refreshChatFromCloudIfRemoteIsNewer(authUser.uid);
          }
        } catch {
          // ignore
        }

        // First focus: always start a fresh Seeds Guide unless a Garden force-open is pending.
        // Later focuses: only apply a new force-open (e.g. Garden → Chat while Chat stays mounted).
        const isFirstGuideBootstrap = !guideSessionBootstrapDoneRef.current;
        if (isFirstGuideBootstrap) {
          guideSessionBootstrapDoneRef.current = true;
        }

        let openedJourneyFromGarden = false;
        const forceOpenId = await consumeForceOpenChatId();
        if (forceOpenId) {
          const allForForce = await getAllConversations();
          const convoForce = allForForce.find((c) => c.id === forceOpenId);
          if (convoForce) {
            await loadConversationIntoState(convoForce);
            openedJourneyFromGarden = true;
            shouldRestoreScrollAfterBlurRef.current = false;
          } else if (isFirstGuideBootstrap) {
            await startNewChat();
            resetGuideUiToFresh();
          }
        } else if (isFirstGuideBootstrap) {
          await startNewChat();
          resetGuideUiToFresh();
        }

        // FIRST: Check for pending meditation completion
        // This must run BEFORE loading conversations to avoid state conflicts
        const pending = await getPendingMeditation();
        let handledMeditationCompletion = false;
        
        if (pending && pending.completed && currentChatId) {
          // Only show completion in the conversation that created the pending meditation.
          if (pending.conversationId && pending.conversationId !== currentChatId) {
            // Not for this conversation; leave it pending so it can be consumed when that conversation is opened.
          } else {
          // User has a pending meditation that was ACTUALLY completed in MeditationPlayerScreen
          // Only process if there's an active conversation (don't show on fresh/new screen)
          // Now process it and show the completion message
          const completed = await completeMeditation(currentChatId);
          if (completed) {
            const plantedCount = completed.seeds?.length ?? 0;
            const wateredCount =
              typeof completed.completedWateredCount === 'number'
                ? completed.completedWateredCount
                : completed.completedWateredSeedIds?.length ?? 0;
            addAIMessage(buildMeditationCompletedMessage(t, plantedCount, wateredCount), {
              skipNextStepOffer: true,
            });
            
            // Mark chat as completed in storage
            if (currentChatId) {
              await markMeditationCompleted(currentChatId);
            }
            
            // Reset state but keep conversation accessible
            setShowSeedLog(false);
            setShowGoPlant(false);
            setLoggedSeeds([]);
            setPhase(7);
            setIsCompleted(true);
            // Old UI block ("What would you like to do?") has been removed; keep this false.
            setShowPostCompletionOptions(false);
            handledMeditationCompletion = true;
            
            setTimeout(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 100);
          }
          }
        }
        
        // SECOND: Refresh experienced status (in case they just completed their first meditation)
        const experienced = await isExperiencedUser();
        setIsExperienced(experienced);
        
        // THIRD: Refresh conversations list
        const allConvos = await getAllConversations();
        setConversations(allConvos);

        if (remoteChatPulled && currentChatId) {
          const refreshed = allConvos.find((c) => c.id === currentChatId);
          if (refreshed) {
            await loadConversationIntoState(refreshed);
          }
        }

        // Check if current conversation was deleted (e.g., after clearing history)
        if (currentChatId && !allConvos.find(c => c.id === currentChatId)) {
          setCurrentChatId(null);
          setMessages(getInitialMessages());
          setPhase(1);
          setCategory('general');
          setHasSharedFeeling(false);
          setShowPhase1Button(false);
          setShowPhase2Buttons(false);
          setShowAha(false);
          setShowSeedIdeas(false);
          setShowGoPlant(false);
          setShowSeedLog(false);
          setLoggedSeeds([]);
          setIsCompleted(false);
          setShowPostCompletionOptions(false);
          // Reset experience selection state
          setShowExperienceSelection(false);
          setExperienceOptions([]);
          setSelectedExperiences([]);
          setIsGeneratingExperiences(false);
          setExperienceExpanded(true);
        }
        
        // Also reset if no conversations exist at all (full data clear)
        if (allConvos.length === 0) {
          setCurrentChatId(null);
          setMessages(getInitialMessages());
          setPhase(1);
          setCategory('general');
          setHasSharedFeeling(false);
          setShowPhase1Button(false);
          setShowPhase2Buttons(false);
          setShowAha(false);
          setShowSeedIdeas(false);
          setShowGoPlant(false);
          setShowSeedLog(false);
          setLoggedSeeds([]);
          setIsCompleted(false);
          setShowPostCompletionOptions(false);
          setShowExperienceSelection(false);
          setExperienceOptions([]);
          setSelectedExperiences([]);
          setIsGeneratingExperiences(false);
          setExperienceExpanded(true);
          setPersonalizedContent(null);
          setGeneratedProblemTitle(null);
          setIsSkepticalMode(false);
          setShowShowMeButton(false);
          setIsHeavyTopic(false);
        }
        
        // FOURTH: Only load active conversation if we didn't just handle a meditation completion
        // (If we did, we already have the correct state set)
        if (!handledMeditationCompletion && !remoteChatPulled) {
          // If we're on the "New chat" screen (no active chat), do NOT auto-open the most recent conversation
          // just because an activeChatId exists in storage.
          if (currentChatId) {
            const activeConvo = await getOrCreateActiveConversation();
            if (activeConvo && activeConvo.id !== currentChatId) {
              // Only load if it's a different conversation
              await loadConversationIntoState(activeConvo);
            }
          }
        }

        // Restore scroll after leaving Chat (tabs / stack) so Plant/Meditate stay on-screen.
        if (shouldRestoreScrollAfterBlurRef.current && !openedJourneyFromGarden) {
          shouldRestoreScrollAfterBlurRef.current = false;
          setTimeout(() => restoreScrollAnchor({ animated: false }), 80);
        }

        // Garden → Seeds Guide: scroll after messages + action row layout (first onContentSizeChange can be too early).
        if (openedJourneyFromGarden) {
          shouldJumpToBottomRef.current = true;
          InteractionManager.runAfterInteractions(() => {
            requestAnimationFrame(() => {
              scrollViewRef.current?.scrollToEnd({ animated: false });
              setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 100);
              setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 280);
              setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 450);
            });
          });
        }
      };
      
      refreshOnFocus();
    }, [currentChatId, restoreScrollAnchor])
  );

  // Show the real OS notification prompt after auth, when the user lands on Seeds Guide.
  useFocusEffect(
    useCallback(() => {
      const u = getFirebaseAuth().currentUser;
      if (!u) return;
      maybeRequestNotificationsAfterAuth().catch(() => {});
    }, [])
  );

  // Detect if a topic is "heavy" - requires different flow (skip Mirror exploration)
  // These are situations where asking "did you ever do X?" would be absurd or cruel
  const detectHeavyTopic = (text: string): boolean => {
    const lowerText = text.toLowerCase();
    const heavyKeywords = [
      // War & conflict
      'war', 'bomb', 'bombing', 'genocide', 'refugee', 'displaced', 'conflict zone',
      'military attack', 'invasion', 'terrorism', 'terrorist',
      // Death & terminal illness
      'terminal', 'dying', 'death', 'cancer', 'tumor', 'fatal', 'hospice',
      'passed away', 'lost my', 'died', 'funeral', 'grief',
      // Disability & severe illness
      'down syndrome', 'disability', 'disabled', 'cerebral palsy', 'autism',
      'paralyzed', 'blind', 'deaf', 'wheelchair', 'special needs',
      'born with', 'genetic condition', 'chronic illness',
      // Severe trauma
      'abuse', 'abused', 'molest', 'rape', 'assault', 'trafficking',
      'torture', 'kidnap', 'violence', 'domestic violence',
      // Extreme circumstances
      'born into poverty', 'extreme poverty', 'homeless', 'starvation', 'famine',
      'natural disaster', 'earthquake', 'flood', 'tsunami', 'hurricane',
      // Systemic injustice
      'genocide', 'ethnic cleansing', 'persecution', 'discriminat',
      'why was i born', 'why did this happen to my child', 'why my country',
    ];
    
    return heavyKeywords.some(keyword => lowerText.includes(keyword));
  };

  const scrollToBottom = () => {
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Smart scroll that positions the card with the collapsed previous card visible
  const scrollToCard = (cardKey: string, offset: number = 80) => {
    setTimeout(() => {
      const cardY = cardPositions.current[cardKey];
      if (cardY !== undefined && scrollViewRef.current) {
        // Scroll so the card appears with 'offset' pixels from top
        // This shows the collapsed previous card above it
        scrollViewRef.current.scrollTo({ y: Math.max(0, cardY - offset), animated: true });
      } else {
        // Fallback to scrollToEnd if position not found
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }
    }, 150);
  };

  // Helper to track card positions via onLayout
  const handleCardLayout = (cardKey: string) => (event: any) => {
    const { y } = event.nativeEvent.layout;
    cardPositions.current[cardKey] = y;
  };

  // Add AI message (no delay - typing indicator is shown during API call)
  // NOTE: Don't auto-scroll after AI messages - user naturally sees their message + beginning of AI response
  // They can scroll down to read more. This is better UX for long messages.
  const addAIMessage = (
    text: string,
    options?: {
      skipNextStepOffer?: boolean;
      categoryOverride?: string;
      conversationModeOverride?: 'problem' | 'goal';
      phaseOverride?: number | 'completed';
      isCompletedOverride?: boolean;
      isHeavyTopicOverride?: boolean;
      offerIntentOverride?: DirectChatIntent;
      offerInJourneyContextOverride?: boolean;
    }
  ): string => {
    setIsTyping(false); // Hide typing indicator

    // Niche-first Direct chat: the model itself generates high-quality “If you want…” continuations.
    // Avoid appending the hardcoded offer library in Direct mode.
    const shouldSkipOffer = conversationStylePref === 'direct' || options?.skipNextStepOffer;

    const finalText =
      shouldSkipOffer
        ? text
        : appendNextStepOffer(text, {
            language: i18n.language === 'ru' ? 'ru' : 'en',
            category: options?.categoryOverride ?? category,
            conversationMode:
              (options?.conversationModeOverride ?? conversationMode) || undefined,
            phase: options?.phaseOverride ?? phase,
            isCompleted: options?.isCompletedOverride ?? isCompleted,
            isHeavyTopic: options?.isHeavyTopicOverride ?? isHeavyTopic,
            intent: options?.offerIntentOverride,
            inJourneyContext: options?.offerInJourneyContextOverride,
          },
          nextStepOfferStateRef.current,
          // Avoid repeating the same offer: look at a couple of recent assistant messages.
          messages.slice(-6).filter(m => !m.isUser).map(m => m.text)
        );

    const aiMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: finalText,
      isUser: false,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiMessage]);
    // Don't scroll - let user see beginning of AI response naturally
    return finalText;
  };

  // Helper to convert messages for DeepSeek API
  const convertMessagesForDeepSeek = (msgs: Message[]): DeepSeekMessage[] => {
    return msgs
      .filter(m => !getInitialMessages().find(im => im.id === m.id)) // Exclude initial messages
      .map(m => ({
        id: m.id,
        text: m.text,
        isUser: m.isUser,
        timestamp: m.timestamp,
      }));
  };

  // Call DeepSeek API with smart fallback
  const getAIResponse = async (
    userMessage: string, 
    conversationHistory: Message[],
    fallbackResponse: string
  ): Promise<string> => {
    try {
      const deepSeekMessages = convertMessagesForDeepSeek(conversationHistory);
      const response = await sendMessageToDeepSeek(deepSeekMessages, userMessage);
      return response;
    } catch (error) {
      console.log('DeepSeek API error, using fallback:', error);
      return fallbackResponse;
    }
  };

  // Pattern to detect explicit "new problem" phrases (EN + RU)
  // Note: keep it intentionally specific to avoid false positives.
  const explicitNewProblemPattern = new RegExp(
    [
      // EN
      'another problem',
      'something else',
      'different (problem|issue|topic)',
      'also (need help|struggling|dealing) with',
      'another (issue|thing|challenge)',
      "there's something else",
      'i also have',
      'new (topic|issue|problem)',
      'switch topics',
      'different topic',
      'separate (issue|topic|problem)',
      'in addition',
      'one more thing',
      'by the way',
      'also,\\s*i',
      // RU
      'у меня (?:ещ[её]|также) (?:есть )?(?:ещ[её] )?(?:одна )?(?:проблема|вопрос|тема)',
      'ещ[её] (?:одна )?(?:проблема|тема|вопрос)',
      'другая (?:проблема|тема)',
      'кроме этого',
      'помимо этого',
      'кстати',
      'а\\s+ещ[её]',
    ].join('|'),
    'i'
  );

  // Get the dominant (most frequent) non-general category from recent user messages.
  // This helps detect topic shifts even when the current state category isn't updated yet.
  const getDominantCategory = (recentMessages: Message[], fallback: string) => {
    const counts: Record<string, number> = {};
    const userMsgs = recentMessages.filter(m => m.isUser).slice(-6);
    for (const m of userMsgs) {
      const c = detectCategory(m.text);
      if (c !== 'general') {
        counts[c] = (counts[c] ?? 0) + 1;
      }
    }
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return dominant ?? fallback;
  };

  // Some detected "categories" are really emotional overlays, not new topics.
  // Example: a user continuing a competition conversation says "я не волнуюсь" → detectCategory() hits peace,
  // but that should NOT trigger the "new topic" prompt.
  const EMOTIONAL_CATEGORIES = new Set(['peace', 'loneliness']);
  const isEmotionalOverlay = (baseline: string, next: string) =>
    EMOTIONAL_CATEGORIES.has(next) && !EMOTIONAL_CATEGORIES.has(baseline);

  const getTechnicalHelpResponse = useCallback(
    (text: string): string | null => {
      const raw = (text || '').trim();
      if (!raw) return null;

      // IMPORTANT: This router should ONLY answer technical "how/where do I do X in the app?" questions.
      // It must NOT hijack normal conversation just because the user mentioned "meditation".
      const looksLikeHowTo =
        /(\bwhere\b|\bfind\b|\bhow\b|\bbutton\b|\bcan't\b|\bcant\b|\bdo i\b)/i.test(raw) ||
        /(где|как\b|кнопк|найти|не могу|не вижу|как мне|что делать)/i.test(raw);

      // Advice / opinion questions are NOT technical help.
      const looksLikeAdvice =
        /(\bshould i\b|\bdo you think\b|\bwhat do you think\b|\brecommend\b|\bis it worth\b)/i.test(raw) ||
        /(стоит ли|как думаешь|что думаешь|посовету(й|йте))/i.test(raw);

      if (!looksLikeHowTo || looksLikeAdvice) return null;

      const wantsPlantSeeds =
        /(plant\s+seeds?|log\s+seeds?|seed\s+modal|add\s+seeds?)/i.test(raw) ||
        /(посад(ить|ка)\s+семен|запис(ать|ывать)\s+семен|добав(ить|ление)\s+семен|семя\s+в\s+сад)/i.test(raw);

      const wantsMeditate =
        /(meditat(e|ion)s?|coffee|☕)/i.test(raw) ||
        /(медит(ация|ировать)|☕)/i.test(raw);

      const wantsWater =
        /(water\s+(?:the\s+)?seeds?|water\s+my\s+seeds?|watering\s+seeds?)/i.test(raw) ||
        /(how\s+do\s+i\s+water|how\s+to\s+water)/i.test(raw) ||
        /(полив(ать|аю)\s+семен|как\s+полив(ать|ать)\s+семен)/i.test(raw);

      // Only match explicit in-app navigation questions — not casual words like "garden" or "journey" in metaphorical chat.
      const wantsGarden =
        /\b(where|how)\b[\s\S]{0,90}\b(find|see|open|access|located|locate)\b[\s\S]{0,60}\b(journeys?|my\s+garden|garden\s+tab)\b/i.test(
          raw
        ) ||
        /\b(find|locate|open|see)\b[\s\S]{0,40}\b(my\s+journeys?|journeys?\b[\s\S]{0,24}\b(in\s+the\s+app|in\s+seedmind)|garden\s+tab|my\s+garden\s+tab)\b/i.test(
          raw
        ) ||
        /\b(delete|rename)\s+journey\b/i.test(raw) ||
        /\b(удал(ить|ение)|переимен)\b[\s\S]{0,20}\bпут(ь|и|ей)\b/i.test(raw) ||
        /\bгде\b[\s\S]{0,60}\b(пут(ь|и|ей)|мой\s+сад|вкладк\w*\s+сад)\b/i.test(raw) ||
        /\bкак\b[\s\S]{0,50}\b(найти|открыть|увидеть)\b[\s\S]{0,50}\b(пут(ь|и|ей)|сад\w*|вкладк)/i.test(raw) ||
        /\b(three\s*dots|⋯)\b[\s\S]{0,50}\b(journey|rename|delete)\b/i.test(raw);

      const wantsNewJourney =
        /(new\s+(chat|conversation|journey)|start\s+new|\\b\\+\\b)/i.test(raw) ||
        /(нов(ый|ую)\s+(разговор|пут)|начат(ь|ь)\s+нов|\\+|плюс)/i.test(raw);

      const parts: string[] = [];
      if (wantsPlantSeeds) parts.push(t('chat.help.plantSeeds'));
      if (wantsMeditate) parts.push(t('chat.help.meditate'));
      if (wantsWater) parts.push(t('chat.help.waterSeeds'));
      if (wantsGarden) parts.push(t('chat.help.garden'));
      if (wantsNewJourney) parts.push(t('chat.help.newJourney'));

      // If user asked "where are the buttons" but matched nothing specific, still give the general pointer.
      const wantsButtons =
        /(where.*button|find.*button|кнопк|где.*кноп)/i.test(raw) ||
        /(plant\s+seeds|meditat|посад|медит)/i.test(raw);

      if (parts.length === 0 && wantsButtons) {
        parts.push(t('chat.help.buttons'));
      }

      if (parts.length === 0) return null;
      return parts.join('\n\n');
    },
    [t]
  );

  const streamLocalAssistantReply = useCallback(
    async (opts: { chatId: string; text: string; assistantMessageId?: string }) => {
      const full = (opts.text || '').trim();
      if (!full) return '';

      const assistantId =
        opts.assistantMessageId || `${Date.now()}-local-${Math.random().toString(36).slice(2)}`;

      let cancelled = false;
      streamCancelledRef.current = false;
      cancelStreamRef.current = () => {
        cancelled = true;
        streamCancelledRef.current = true;
      };

      setTypingChatId(opts.chatId);
      setIsTyping(true);

      const tokens = full.split(/(\s+)/); // keep spaces for natural flow
      let i = 0;
      let acc = '';
      let started = false;

      const TICK_MS = 30;
      const WORDS_PER_TICK = 3; // same chunking idea, faster ticks

      await new Promise<void>((resolve) => {
        const tick = () => {
          if (cancelled) {
            setIsTyping(false);
            setTypingChatId(null);
            setStreamingMessageId(null);
            cancelStreamRef.current = null;
            resolve();
            return;
          }

          // Take N "word tokens" (words + spaces).
          const take = Math.max(2, WORDS_PER_TICK * 2);
          const chunk = tokens.slice(i, i + take).join('');
          i += take;
          if (chunk) acc += chunk;

          if (!started && acc) {
            started = true;
            setIsTyping(false);
            setStreamingMessageId(assistantId);
            setMessages((prev) => [
              ...prev,
              { id: assistantId, text: acc, isUser: false, timestamp: new Date() },
            ]);
          } else if (started && chunk) {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: acc } : m)));
          }

          if (i >= tokens.length) {
            setStreamingMessageId(null);
            setTypingChatId(null);
            setIsTyping(false);
            cancelStreamRef.current = null;
            resolve();
            return;
          }

          setTimeout(tick, TICK_MS);
        };

        setTimeout(tick, 90); // brief "thinking" pause for consistency
      });

      return acc.trim();
    },
    []
  );

  // Handle user sending a message
  const handleSend = async (text?: string) => {
    const messageText = text || inputText.trim();
    if (!messageText || isTypingHere) return;

    // Phase 1 gating: Free users have 40 user-sent messages per rolling 30-day cycle.
    // Premium (or dev-forced premium) bypasses limits.
    const sendGate = await canSendUserMessage();
    if (!sendGate.allowed) {
      const resetDate = new Date(sendGate.cycleEndAt).toLocaleDateString();
      const buttons: any[] = [{ text: t('common.gotIt'), style: 'default' }];
      buttons.unshift({
        text: t('settings.premium.upgrade'),
        style: 'default',
        onPress: () => navigation.navigate('Paywall', { source: 'chat_message_limit', mode: 'upgrade' }),
      });
      if (__DEV__) {
        buttons.unshift({
          text: 'Enable Premium (Testing)',
          style: 'default',
          onPress: async () => {
            await setDevForcePremium(true);
          },
        });
      }
      showAlert(
        t('settings.premium.title'),
        `You’ve used your ${FREE_MESSAGE_LIMIT} free messages. It resets on ${resetDate}.`,
        buttons
      );
      return;
    }
    await recordUserMessageSent();
    refreshPremiumAndUsage();

    trackEvent('chat_message_sent', {
      journey_id: currentChatId ?? 'none',
      mode:
        conversationStylePref === 'direct'
          ? 'direct'
          : conversationMode === 'goal'
            ? 'goal'
            : conversationMode === 'problem'
              ? 'problem'
              : 'unknown',
      phase: typeof phase === 'number' ? phase : String(phase),
      len: bucketTextLength(messageText),
    }).catch(() => {});

    // =====================
    // DIRECT CHAT MODE
    // =====================
    // When user prefers Direct Chat, skip all guided flow logic and use natural conversation
    if (conversationStylePref === 'direct') {
      setShowPhase1Button(false);
      setShowModeSelection(false);
      
      // Topic change detection for Direct Chat mode
      // (In direct mode, the user can naturally switch topics mid-thread; prompt them to start a fresh chat.)
      const priorUserCount = messages.filter(m => m.isUser).length;
      const hasExplicitNewProblem = explicitNewProblemPattern.test(messageText);
      const newDetectedCategory = detectCategory(messageText);
      // If the user is discussing/listing seeds inside the same thread, do NOT force a new conversation.
      // Example: "What do you think about these two seeds... first... second..."
      const isSeedFollowup =
        // EN
        /\b(these (?:two|2) seeds|first (?:seed|one)|second (?:seed|one)|seed\s*#\s*\d)\b/i.test(messageText) ||
        /\b(what do you think|thoughts on|does this work|is this a good)\b[\s\S]{0,40}\bseed\b/i.test(messageText) ||
        // RU
        /\b(эти (?:два|2) семен|перв(ое|ый)\s+семя|втор(ое|ой)\s+семя|семя\s*№\s*\d)\b/i.test(messageText) ||
        /\b(что думаешь|как тебе|как считаешь)\b[\s\S]{0,40}\b(семя|семена)\b/i.test(messageText);
      const dominantCategory = getDominantCategory(messages, category);
      const baselineCategory = topicBaselineCategory !== 'general' ? topicBaselineCategory : dominantCategory;
      const categoryForPastSeeds =
        (baselineCategory && baselineCategory !== 'general')
          ? baselineCategory
          : (newDetectedCategory && newDetectedCategory !== 'general' ? newDetectedCategory : 'general');
      const categoryChanged =
        baselineCategory !== 'general' &&
        newDetectedCategory !== 'general' &&
        newDetectedCategory !== baselineCategory &&
        !isEmotionalOverlay(baselineCategory, newDetectedCategory);
      const promptKey = categoryChanged
        ? `${baselineCategory}->${newDetectedCategory}`
        : `explicit->${baselineCategory}`;
      
      const userMessage: Message = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: messageText,
        isUser: true,
        timestamp: new Date(),
      };
      setInputText('');
      scheduleComposerResyncIfKeyboardClosed();

      const techHelp = getTechnicalHelpResponse(messageText);
      if (techHelp) {
        // Ensure the conversation exists so help Q/A is persisted and the typing indicator is scoped correctly.
        let chatIdToUse = currentChatId;
        if (!chatIdToUse) {
          const detectedCategory = detectCategory(messageText);
          const newConvo = await createConversation(
            messageText,
            detectedCategory !== 'general' ? detectedCategory : 'general',
            i18n.language === 'ru' ? 'ru' : 'en'
          );
          chatIdToUse = newConvo.id;
          setCurrentChatId(newConvo.id);
          currentChatIdRef.current = newConvo.id;
          setCategory(newConvo.category);
        }

        setMessages(prev => [...prev, userMessage]);
        scrollToBottom();

        const aiMessageId = `${Date.now()}-help-${Math.random().toString(36).slice(2)}`;
        const streamed = await streamLocalAssistantReply({ chatId: chatIdToUse || 'none', text: techHelp, assistantMessageId: aiMessageId });

        if (chatIdToUse) {
          const messagesToSave: ChatMessage[] = [
            {
              id: userMessage.id,
              text: userMessage.text,
              isUser: true,
              timestamp: userMessage.timestamp.toISOString(),
            },
            {
              id: aiMessageId,
              text: streamed || techHelp,
              isUser: false,
              timestamp: new Date().toISOString(),
            },
          ];
          await addMessagesToConversation(chatIdToUse, messagesToSave);
        }
        return;
      }

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      scrollToBottom();

      // Show topic-change prompt on the 2nd+ user message (avoid prompting on the first message).
      if (ENABLE_TOPIC_CHANGE_PROMPT && !isSeedFollowup && !showTopicChangePrompt && !postCompletionChatMode && priorUserCount > 0 && (hasExplicitNewProblem || categoryChanged) && promptKey !== lastTopicChangePromptKey) {
        setPendingMessage(messageText);
        setDetectedNewCategory(newDetectedCategory);
        setTopicChangeFromCategory(baselineCategory);
        setLastTopicChangePromptKey(promptKey);
        setShowTopicChangePrompt(true);
        Keyboard.dismiss();
        scrollToBottom();
        return;
      }

      setIsTyping(true);
      streamCancelledRef.current = false;
      cancelStreamRef.current = null;

      // Create conversation if first user message
      let chatIdToUse = currentChatId;
      if (!currentChatId) {
        const detectedCategory = detectCategory(messageText);
        const newConvo = await createConversation(
          messageText,
          detectedCategory !== 'general' ? detectedCategory : 'general',
          i18n.language === 'ru' ? 'ru' : 'en'
        );
        chatIdToUse = newConvo.id;
        setCurrentChatId(newConvo.id);
        currentChatIdRef.current = newConvo.id;
        setCategory(newConvo.category);
      }
      // Tie this in-flight response to the originating chat.
      setTypingChatId(chatIdToUse);

      // Convert messages for API
      const deepSeekMessages: DeepSeekMessage[] = updatedMessages.map(m => ({
        id: m.id,
        text: m.text,
        isUser: m.isUser,
        timestamp: m.timestamp
      }));

      // Get AI response using Direct Chat mode
      try {
        const hasSeedAdviceInThread = (msgs: Message[]) =>
          msgs
            .filter(m => !m.isUser)
            .some(m =>
              /(🌱\s|here are some seeds|seeds you could plant|seed actions|specific seeds|seeds you can plant now|какие семена|вот (?:несколько|пара) семян|семена, которые)/i.test(
                m.text || ''
              )
            );

        const detectDirectChatIntent = (text: string, lastAssistantText: string): DirectChatIntent => {
          const t = (text || '').trim();
          if (!t) return 'default';

          const explicitBigListPattern =
            /\b(list|список)\b[\s\S]{0,40}\b(15|20|25|30)\b[\s\S]{0,16}\b(seeds?|семен[а-я]*)\b/i.test(t) ||
            /\b(15|20|25|30)\b[\s\S]{0,16}\b(seeds?|семен[а-я]*)\b[\s\S]{0,40}\b(list|список|идей|вариант)\b/i.test(
              t
            );
          if (explicitBigListPattern) return 'seed_list_request';

          const motivationPattern =
            /\b(motivat(e|ion)?|pep talk|encourag(e|ing)?|inspir(e|ation)?|support me|calm me)\b/i.test(t) ||
            /\b(замотивир|мотивац|поддерж(и|ите)|ободр(и|ите)|успокой|вдохнов(и|и))\b/i.test(t);
          if (motivationPattern) return 'motivation_request';

          // Treat explicit questions as questions, even if they include progress.
          const questionPattern =
            /[?？]/.test(t) ||
            /^\s*(why|what|how|can you|could you|do you|is it|are you)\b/i.test(t) ||
            /^\s*(почему|что|как|можешь|можете|подскажи|подскажите)\b/i.test(t);
          if (questionPattern) return 'direct_question';

          const progressEn =
            /\b(i\s+(?:did|managed|helped|supported|stood up|defended|complimented|encouraged|apologiz(?:ed|ed)|donated|gave|reached out|set a boundary|said no|kept|went|ran|worked out|exercised))\b/i.test(
              t
            ) || /\b(today|just now|this week)\b/i.test(t) && /\b(i\s+(?:did|managed|helped|supported|stood up|defended|complimented|encouraged|apologiz(?:ed|ed)|donated|gave|reached out|set a boundary|said no|kept))\b/i.test(t);

          const progressRu =
            /\b(я\s+(?:сделал(а)?|смог(ла)?|помог(ла)?|поддержал(а)?|защитил(а)?|вступил(а)?|сказал(а)?|написал(а)?|позвонил(а)?|извинил(ся|ась)|пожертвовал(а)?|подарил(а)?|поставил(а)?\s+границ|сказал(а)?\s+нет|сдержал(а)?\s+слово|сходил(а)?))\b/i.test(
              t
            ) || /\b(сегодня|на этой неделе|только что)\b/i.test(t) && /\b(я\s+(?:сделал(а)?|помог(ла)?|поддержал(а)?|защитил(а)?|сказал(а)?|написал(а)?))\b/i.test(t);

          if (progressEn || progressRu) return 'progress_update';

          // If the last assistant message was a question, but the user isn't answering it with progress,
          // we still keep default; forceFinal logic will handle the "2nd message = final" path.
          void lastAssistantText;
          return 'default';
        };

        const lastAssistantText = [...messages].reverse().find(m => !m.isUser)?.text || '';
        const intent = detectDirectChatIntent(messageText, lastAssistantText);
        const inJourneyContext = hasSeedAdviceInThread(messages);

        // Past-seed "why this might be happening" is for PROBLEMS (or mixed problem+goal), not goal-only.
        // It should appear ONCE early (2nd AI reply after the user gives specifics), never for safety topics.
        const problemSignalPattern =
          /(^|\b)(problem|issue|not working|doesn't work|isn't working|can'?t|cannot|won't|stuck|blocked|error|bug|broken|failing|blocked|ignored|unheard|no response|no reply|support (?:won't|doesn't|isn't)|they (?:won't|dont|don't) respond|struggling|i'?m struggling|scared|afraid|worried|i'?m worried|not enough|can'?t afford|bills?|debt|meet ends|make ends meet)\b|(^|\b)(проблем|не работает|не работает снова|не получается|не могу|не уда(е|ё)тся|застрял|заблокир|ошибк|баг|не отвеча(ют|ет)|служба поддержки|поддержк(а|и)\s+не\s+отвеч|игнорир|не\s+слышат|страшно|боюсь|переживаю|тревож|не\s+хватает|не\s+достаточно|не\s+могу\s+оплатить|сч(е|ё)т(а|ы)|долг|кредит|сводить\s+концы\s+с\s+концами)\b/i;
        const hasProblemSignalNow = problemSignalPattern.test(messageText);
        // If user starts with a problem and then answers a clarifying question with feelings ("ignored/powerless"),
        // we should still treat the thread as a problem.
        const hasProblemSignalThread =
          hasProblemSignalNow || messages.some(m => m.isUser && problemSignalPattern.test(m.text));
        const explicitPastSeedsRequest =
          /(^|\b)(past seeds|possible past seeds|why is this happening|what did i do|what could i have done)\b|(^|\b)(прошл(ые|ые)\s+семен|возможн(ые|ые)\s+прошл(ые|ые)\s+семен|почему это происходит|из-за чего это|что я сдела(л|ла)|что я мог(ла)? сделать)/i.test(
            messageText
          );
        const hasPastSeedsAlready = messages
          .filter(m => !m.isUser)
          .some(m =>
            /(possible past seeds|past seeds \(problem-only\)|возможн(ые|ые)\s+прошл(ые|ые)\s+семен|прошл(ые|ые)\s+семен)/i.test(
              m.text
            )
          );
        // Auto: only on the user's 2nd message (priorUserCount === 1), only once, only if problem signal, never safety.
        const includePastSeedsAuto =
          priorUserCount === 1 &&
          hasProblemSignalThread &&
          categoryForPastSeeds !== 'safety' &&
          !hasPastSeedsAlready;
        // Explicit request can trigger past seeds later, but still never for safety.
        const includePastSeeds =
          (intent === 'default') &&
          ((includePastSeedsAuto || explicitPastSeedsRequest) && categoryForPastSeeds !== 'safety');
        // Deterministic Direct Chat: on the 2nd user message, produce the final answer (no further questions).
        const forceFinal = (intent === 'default') && priorUserCount === 1;
        // Streaming UX (Option A): show ONLY the typing indicator until we have text.
        // Do not render an empty assistant bubble.
        const aiMessageId = `${Date.now()}-ai-${Math.random().toString(36).slice(2)}`;

        let acc = '';
        let hasAnyDelta = false;
        let lastScrollAt = 0;

        const requestChatId = chatIdToUse;
        const onDelta = (deltaText: string) => {
          if (!deltaText) return;
          acc += deltaText;

          // Only render typing/streaming into the chat where the user sent the message.
          if (currentChatIdRef.current !== requestChatId) return;

          if (!hasAnyDelta) {
            hasAnyDelta = true;
            setIsTyping(false);
            setStreamingMessageId(aiMessageId);
            setMessages(prev => [
              ...prev,
              { id: aiMessageId, text: acc, isUser: false, timestamp: new Date() },
            ]);
          } else {
            setMessages(prev =>
              prev.map(m => (m.id === aiMessageId ? { ...m, text: acc } : m))
            );
          }

          const now = Date.now();
          void now;
          void lastScrollAt;
        };

        const aiResponse = await sendDirectChatMessageStream(
          deepSeekMessages,
          messageText,
          isConversationHarvested,
          {
            category: categoryForPastSeeds,
            intent,
            inJourneyContext,
          },
          onDelta,
          {
            registerCancel: (fn) => {
              cancelStreamRef.current = fn;
            },
            isCancelled: () => streamCancelledRef.current,
          }
        );

        const finalAiResponseRaw = streamCancelledRef.current ? (acc || '') : (aiResponse || acc || '');
        const finalAiResponseToSave = (finalAiResponseRaw || '').trim();
        // If user cancelled before we received any text, just stop (don’t add an empty assistant bubble).
        if (streamCancelledRef.current && !hasAnyDelta && !finalAiResponseToSave) {
          if (currentChatIdRef.current === requestChatId) setStreamingMessageId(null);
          setIsTyping(false);
          setTypingChatId(null);
          cancelStreamRef.current = null;
          return;
        }
        // If we never received deltas, create the assistant message now.
        if (currentChatIdRef.current === requestChatId) {
          if (!hasAnyDelta) {
            setIsTyping(false);
            setMessages(prev => [
              ...prev,
              { id: aiMessageId, text: finalAiResponseRaw, isUser: false, timestamp: new Date() },
            ]);
          } else {
            // Ensure final text is set (in case stream ended mid-buffer).
            setMessages(prev =>
              prev.map(m => (m.id === aiMessageId ? { ...m, text: finalAiResponseRaw } : m))
            );
          }

          // No auto-scroll. If user isn't at bottom, show a hint that more text is below.
          if (!isNearBottomRef.current) setShowNewBelowMain(true);
          setStreamingMessageId(null);
        }

        // Clear typing state for the originating chat.
        if (typingChatId === requestChatId) {
          setIsTyping(false);
          setTypingChatId(null);
        }

        // Save to storage
        if (chatIdToUse) {
          const messagesToSave: ChatMessage[] = [
            { id: userMessage.id, text: userMessage.text, isUser: true, timestamp: userMessage.timestamp.toISOString() },
            { id: aiMessageId, text: finalAiResponseToSave, isUser: false, timestamp: new Date().toISOString() }
          ];
          await addMessagesToConversation(chatIdToUse, messagesToSave);
        }
      } catch (error) {
        console.error('Direct Chat Error:', error);
        // Only recover inside the chat where the request started.
        if (currentChatIdRef.current === chatIdToUse) {
          setStreamingMessageId(null);
          // If streaming fails (common on some runtimes / transient proxy issues), fall back to a non-stream request
          // so TestFlight users still get a real response instead of the hardcoded fallback.
          try {
            const fallbackText = await sendDirectChatMessage(
              deepSeekMessages,
              messageText,
              isConversationHarvested,
              { category: categoryForPastSeeds }
            );
            const finalFallback = (fallbackText || '').trim();
            if (finalFallback) {
              const aiId = `${Date.now()}-ai-fallback-${Math.random().toString(36).slice(2)}`;
              setMessages(prev => [
                ...prev,
                { id: aiId, text: finalFallback, isUser: false, timestamp: new Date() },
              ]);
              if (chatIdToUse) {
                const messagesToSave: ChatMessage[] = [
                  {
                    id: userMessage.id,
                    text: userMessage.text,
                    isUser: true,
                    timestamp: userMessage.timestamp.toISOString(),
                  },
                  { id: aiId, text: finalFallback, isUser: false, timestamp: new Date().toISOString() },
                ];
                await addMessagesToConversation(chatIdToUse, messagesToSave);
              }
            } else {
              addAIMessage("I'm here to help. Tell me more about what's on your heart. 💜");
            }
          } catch {
            addAIMessage("I'm here to help. Tell me more about what's on your heart. 💜");
          }
        }
        setIsTyping(false);
        setTypingChatId(null);
      }
      
      if (currentChatIdRef.current === chatIdToUse) setStreamingMessageId(null);
      setIsTyping(false);
      setTypingChatId(null);
      cancelStreamRef.current = null;
      return; // Exit - we've handled the message in direct mode
    }

    // =====================
    // GUIDED JOURNEY MODE (existing flow below)
    // =====================

    // TOPIC CHANGE DETECTION
    // Check for explicit "new problem" phrases (any time after Phase 1) or category change (after category is established)
    // BUT don't trigger in post-completion CHAT mode (user is just sharing feelings about current problem)
    const priorUserCount = messages.filter(m => m.isUser).length;
    if (ENABLE_TOPIC_CHANGE_PROMPT && !showTopicChangePrompt && !postCompletionChatMode && priorUserCount > 0) {
      const hasExplicitNewProblem = explicitNewProblemPattern.test(messageText);
      const newDetectedCategory = detectCategory(messageText);
      const dominantCategory = getDominantCategory(messages, category);
      const baselineCategory = topicBaselineCategory !== 'general' ? topicBaselineCategory : dominantCategory;
      const categoryChanged =
        baselineCategory !== 'general' &&
        newDetectedCategory !== 'general' &&
        newDetectedCategory !== baselineCategory &&
        !isEmotionalOverlay(baselineCategory, newDetectedCategory);
      const promptKey = categoryChanged
        ? `${baselineCategory}->${newDetectedCategory}`
        : `explicit->${baselineCategory}`;
      
      // Trigger 1: Explicit "new problem" phrase (any time after Phase 1)
      // Trigger 2: Category change in post-completion mode (but NOT if user is in chat mode)
      if ((hasExplicitNewProblem || categoryChanged) && promptKey !== lastTopicChangePromptKey) {
        // Add user message to chat so it's visible
        const userMessage: Message = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          text: messageText,
          isUser: true,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMessage]);
        
        // Store the message and detected category, show prompt
        setPendingMessage(messageText);
        setDetectedNewCategory(newDetectedCategory);
        setTopicChangeFromCategory(baselineCategory);
        setLastTopicChangePromptKey(promptKey);
        setShowTopicChangePrompt(true);
        setInputText(''); // Clear input since we stored it
        Keyboard.dismiss(); // Hide keyboard so user can see the full prompt
        scheduleComposerResyncIfKeyboardClosed();
        scrollToBottom(); // Scroll to show the message and prompt
        return; // Don't process message yet - wait for user choice
      }
    }

    setShowPhase1Button(false);
    setShowPhase2Buttons(false);
    setShowPostCompletionOptions(false);

    const userMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: messageText,
      isUser: true,
      timestamp: new Date(),
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText('');
    scheduleComposerResyncIfKeyboardClosed();
    scrollToBottom();
    
    // Show typing indicator immediately (before API call)
    setIsTyping(true);

    // Create conversation if first user message
    let chatIdToUse = currentChatId;
    if (!currentChatId) {
      const detectedCategory = detectCategory(messageText);
      const newConvo = await createConversation(
        messageText,
        detectedCategory !== 'general' ? detectedCategory : 'general',
        i18n.language === 'ru' ? 'ru' : 'en'
      );
      chatIdToUse = newConvo.id;
      setCurrentChatId(newConvo.id);
      currentChatIdRef.current = newConvo.id;
      setCategory(newConvo.category);
      setIsFirstConversation(newConvo.isFirstConversation ?? true);
    }

    // PHASE 1 - FIRST EXCHANGE: User states their problem or goal
    // Uses DeepSeek for natural, personalized responses
    if (phase === 1 && !hasSharedFeeling) {
      const detectedCategory = detectCategory(messageText);
      // IMPORTANT: Journey category must be stable and user-controlled (changed only via Garden picker).
      // We still compute `detectedCategory` for response tailoring below, but never persist or set it here.
      
      // GOAL MODE: Use excitement response
      if (conversationMode === 'goal') {
        const deepSeekMessages: DeepSeekMessage[] = updatedMessages.map(m => ({
          id: m.id,
          text: m.text,
          isUser: m.isUser,
          timestamp: m.timestamp
        }));
        
        const excitementResponse = await getGoalModeExcitementResponse(deepSeekMessages, messageText);
        addAIMessage(excitementResponse);
        setHasSharedFeeling(true);
        
        // Generate a goal title in the background
        const conversationId = chatIdToUse;
        generateGoalTitle(messageText).then(async (cleanTitle) => {
          setGeneratedProblemTitle(cleanTitle);
          if (conversationId) {
            await updateConversation(conversationId, { title: cleanTitle });
            const updatedConvos = await getAllConversations();
            setConversations(updatedConvos);
          }
        }).catch(err => {
          console.log('Goal title generation failed:', err);
        });
      } 
      // PROBLEM MODE: Use empathy response (existing flow)
      else {
        // Detect if this is a "heavy topic" that requires a different flow
        // Heavy topics skip the Mirror exploration (asking "did you ever do X?" would be absurd/cruel)
        const isHeavy = detectHeavyTopic(messageText);
        setIsHeavyTopic(isHeavy);
        
        const categoryToUse = detectedCategory !== 'general' ? detectedCategory : category;
        // Use shorter responses for experienced users
        const responseSet = isExperienced ? EXPERIENCED_USER_RESPONSES : PHASE_RESPONSES;
        const fallbackResponses = responseSet[categoryToUse] || responseSet.general;
        
        // Use DeepSeek with fallback to hardcoded response
        const aiResponse = await getAIResponse(
          messageText,
          updatedMessages,
          fallbackResponses.phase1
        );
        
        addAIMessage(aiResponse);
        setHasSharedFeeling(true);
        
        // Generate a clean, short problem title in the background
        // This will be used for both the conversation and seeds
        // Use chatIdToUse instead of currentChatId since state update is async
        const conversationId = chatIdToUse;
        generateProblemTitle(messageText).then(async (cleanTitle) => {
          setGeneratedProblemTitle(cleanTitle);
          // Update the conversation title with the clean generated title
          if (conversationId) {
            await updateConversation(conversationId, { title: cleanTitle });
            // Refresh the conversations list to show the new title
            const updatedConvos = await getAllConversations();
            setConversations(updatedConvos);
          }
        }).catch(err => {
          console.log('Title generation failed, using fallback:', err);
        });
      }
    } 
    // PHASE 1 - SECOND EXCHANGE: User shares more details
    else if (phase === 1 && hasSharedFeeling) {
      // GOAL MODE: Skip mirror exploration, go straight to seeds
      if (conversationMode === 'goal') {
        const deepSeekMessages: DeepSeekMessage[] = [...messages, 
          { id: Date.now().toString(), text: messageText, isUser: true, timestamp: new Date() }
        ].map(m => ({
          id: m.id,
          text: m.text,
          isUser: m.isUser,
          timestamp: m.timestamp
        }));
        
        // Generate warm, validating transition message (honors what they shared)
        try {
          const warmValidation = await getGoalModeValidationResponse(deepSeekMessages, messageText);
          addAIMessage(warmValidation);
        } catch (error) {
          // Fallback to a warm generic message
          addAIMessage("What you just shared is beautiful - that's a real vision of what you want. 💜 And you deserve to have it. Here's the powerful thing: to receive this, you plant seeds of giving it to others. Let me show you how...");
        }
        
        // Generate Goal Mode seeds
        setIsGeneratingContent(true);
        try {
          const goalSeeds = await getGoalModeSeeds(deepSeekMessages);
          setPersonalizedContent(goalSeeds);
          
          // Skip straight to seed ideas (phase 4)
          setShowSeedIdeas(true);
          setPhase(4);
        } catch (error) {
          console.log('Error generating goal seeds:', error);
          // Fallback
          setPersonalizedContent({
            reciprocalLaw: 'Want to receive? → Consciously give that to others.',
            mirrorExplanation: 'When you consciously create for others what you want to receive - with full awareness you\'re planting seeds - that energy multiplies back to you.',
            seeds: [
              { emoji: '🚪', action: 'Help someone get an opportunity they want', theyFeel: 'doors opening', youReceive: 'opportunities appearing', seedType: 'opportunity' },
              { emoji: '🎉', action: 'Genuinely celebrate someone\'s milestone', theyFeel: 'their joy is honored', youReceive: 'celebrations in your future', seedType: 'opportunity' },
              { emoji: '🤫', action: 'Keep someone\'s important secret completely sacred', theyFeel: 'safe and trusted', youReceive: 'trustworthy people', seedType: 'quality' },
              { emoji: '💜', action: 'Be the first to express care or appreciation', theyFeel: 'loved without asking', youReceive: 'love coming to you', seedType: 'quality' },
            ],
          });
          setShowSeedIdeas(true);
          setPhase(4);
        }
        setIsGeneratingContent(false);
        
        // Don't scroll to bottom - let user see the validation message with seeds below
        // They can scroll naturally to explore the seeds
      }
      // PROBLEM MODE: Use validation and experience selection (existing flow)
      else {
        // Use DeepSeek with a specific prompt that ONLY allows validation
        // This gives personalized responses while maintaining phase structure
        const deepSeekMessages: DeepSeekMessage[] = messages.map(m => ({
          id: m.id,
          text: m.text,
          isUser: m.isUser,
          timestamp: m.timestamp
        }));
        
        const validationResponse = await getFeelingValidationFromDeepSeek(deepSeekMessages, messageText);
        
        addAIMessage(validationResponse);
        
        // Generate experience options for better personalization
        // NO auto-scroll - let user read the empathetic message and scroll when ready
        setIsGeneratingExperiences(true);
        setShowExperienceSelection(true);
        
        try {
          const allMessages: DeepSeekMessage[] = [...messages, 
            { id: Date.now().toString(), text: messageText, isUser: true, timestamp: new Date() }
          ].map(m => ({
            id: m.id,
            text: m.text,
            isUser: m.isUser,
            timestamp: m.timestamp
          }));
          
          const options = await generateExperienceOptions(allMessages);
          setExperienceOptions(options);
        } catch (error) {
          console.log('Error generating experience options:', error);
          // Fallback options - PRIMARY experiences
          setExperienceOptions([
            { emoji: '😔', text: 'This happens to me regularly' },
            { emoji: '😰', text: 'It affects how I feel about myself' },
            { emoji: '💔', text: 'I feel alone in this' },
            { emoji: '😶', text: 'Others don\'t understand' },
            { emoji: '🚪', text: 'I want things to change' },
          ]);
        }
        
        setIsGeneratingExperiences(false);
        
        // Refresh the conversation title now that we have more context
        if (currentChatId) {
          await refreshConversationTitle(currentChatId);
        }
      }
    }
    // PHASE 2: After button click, handle any typed response
    // Uses DeepSeek for personalized mirror exploration
    else if (phase === 2) {
      // Use shorter responses for experienced users
      const responseSet = isExperienced ? EXPERIENCED_USER_RESPONSES : PHASE_RESPONSES;
      const fallbackResponses = responseSet[category] || responseSet.general;
      
      // Use DeepSeek with fallback to hardcoded response
      const aiResponse = await getAIResponse(
        messageText,
        updatedMessages,
        fallbackResponses.phase2
      );
      
      addAIMessage(aiResponse);
      setShowPhase2Buttons(true);
      setPhase(3);
    }
    // POST-COMPLETION: Continue conversation with emotional support only
    else if (isCompleted) {
      // If in post-completion chat mode, use simpler emotional support prompt
      // This prevents the AI from re-explaining cause-and-effect or starting exploration again
      if (postCompletionChatMode || isInPostCompletionMode) {
        const deepSeekMessages: DeepSeekMessage[] = updatedMessages.map(m => ({
          id: m.id,
          text: m.text,
          isUser: m.isUser,
          timestamp: m.timestamp
        }));
        
        try {
          const aiResponse = await sendPostCompletionMessage(deepSeekMessages, messageText);
          addAIMessage(aiResponse);
        } catch (error) {
          addAIMessage("I hear you. Remember, change takes time - seeds don't bloom overnight. Keep watering them with your meditations. 💜");
        }
      } else {
        // First message after completion - use regular response
        const fallbackResponse = `Great to hear from you again! 🌱

How have things been going since you planted those seeds? Remember, every meditation—even on past seeds—helps them grow.

What's on your mind?`;
        
        const aiResponse = await getAIResponse(
          messageText,
          updatedMessages,
          fallbackResponse
        );
        
        addAIMessage(aiResponse);
      }
      
      // Only show options box if user hasn't already picked a mode (chat or seeds)
      // Otherwise they'll see duplicate buttons
      if (!isInPostCompletionMode) {
        setShowPostCompletionOptions(true);
      }
    }
  };

  // Start a new chat
  const handleNewChat = async () => {
    // Save current conversation before switching
    await saveCurrentConversation();
    
    await startNewChat();
    setCurrentChatId(null);
    setMessages(getInitialMessages());
    setPhase(1);
    setCategory('general');
    setHasSharedFeeling(false);
    setShowPhase1Button(false);
    setShowPhase2Buttons(false);
    setShowAha(false);
    setShowSeedIdeas(false);
    setShowGoPlant(false);
    setShowSeedLog(false);
    setLoggedSeeds([]);
    setIsCompleted(false);
    setShowPostCompletionOptions(false);
    setShowHistoryDrawer(false);
    setIsInPostCompletionMode(false);
    setPostCompletionChatMode(false);
    // Reset expand states for cards
    setAhaExpanded(true);
    setSeedIdeasExpanded(true);
    setGoPlantExpanded(true);
    // Reset experience selection state
    setShowExperienceSelection(false);
    setExperienceOptions([]);
    setSelectedExperiences([]);
    setIsGeneratingExperiences(false);
    setExperienceExpanded(true);
    // Reset heavy topic flag
    setIsHeavyTopic(false);
    // Reset topic change detection
    setShowTopicChangePrompt(false);
    setPendingMessage('');
    setDetectedNewCategory('');
    setTopicBaselineCategory('general');
    setTopicChangeFromCategory('general');
    setLastTopicChangePromptKey('');
    // Reset personalized content
    setPersonalizedContent(null);
    setIsGeneratingContent(false);
    // Reset generated title
    setGeneratedProblemTitle(null);
    // Reset first conversation flag (will be set properly when new convo is created)
    setIsFirstConversation(true);
    // Reset skeptical mode and show me button
    setIsSkepticalMode(false);
    setShowShowMeButton(false);
    // Reset experience selection
    setShowExperienceSelection(false);
    setExperienceOptions([]);
    setSelectedExperiences([]);
    setIsGeneratingExperiences(false);
    setExperienceExpanded(true);
    // Reset conversation mode selection
    setConversationMode(null);
    setShowModeSelection(true);
    // Reset harvest state for new conversations
    setIsConversationHarvested(false);
  };

  // Topic Change: User wants to start fresh conversation for new issue
  const handleStartFreshChat = async () => {
    setShowTopicChangePrompt(false);
    setPendingMessage('');
    setDetectedNewCategory('');
    
    // Save current conversation
    await saveCurrentConversation();
    
    // Start new chat with experienced flow
    await startNewChat();
    setCurrentChatId(null);
    setMessages(getInitialMessages());
    setPhase(1);
    setCategory('general');
    setHasSharedFeeling(false);
    setShowPhase1Button(false);
    setShowPhase2Buttons(false);
    setShowAha(false);
    setShowSeedIdeas(false);
    setShowGoPlant(false);
    setShowSeedLog(false);
    setLoggedSeeds([]);
    setIsCompleted(false);
    setShowPostCompletionOptions(false);
    setIsInPostCompletionMode(false);
    setPostCompletionChatMode(false);
    setAhaExpanded(true);
    setSeedIdeasExpanded(true);
    setGoPlantExpanded(true);
    setTopicBaselineCategory('general');
    setTopicChangeFromCategory('general');
    setLastTopicChangePromptKey('');
    // Reset experience selection state
    setShowExperienceSelection(false);
    setExperienceOptions([]);
    setSelectedExperiences([]);
    setIsGeneratingExperiences(false);
    setExperienceExpanded(true);
    // Reset heavy topic flag
    setIsHeavyTopic(false);
    // Reset personalized content
    setPersonalizedContent(null);
    setIsGeneratingContent(false);
    // Reset generated title
    setGeneratedProblemTitle(null);
    // This is NOT their first conversation anymore
    setIsFirstConversation(false);
    // Ensure experienced flow for new chat
    setIsExperienced(true);
    // Reset skeptical mode and show me button
    setIsSkepticalMode(false);
    setShowShowMeButton(false);
    // Reset experience selection
    setShowExperienceSelection(false);
    setExperienceOptions([]);
    setSelectedExperiences([]);
    setIsGeneratingExperiences(false);
    setExperienceExpanded(true);
    // Reset conversation mode selection
    setConversationMode(null);
    setShowModeSelection(true);
    // Reset harvest state for new conversations
    setIsConversationHarvested(false);
  };

  // Topic Change: User wants to continue in current chat
  const handleContinueHere = async () => {
    setShowTopicChangePrompt(false);
    // Variant B: accept the new topic as the baseline, but allow prompting again if they later switch topics again.
    if (detectedNewCategory && detectedNewCategory !== 'general') {
      setTopicBaselineCategory(detectedNewCategory);
    } else if (topicChangeFromCategory && topicChangeFromCategory !== 'general') {
      setTopicBaselineCategory(topicChangeFromCategory);
    }
    
    // Process the pending message normally (message already added to chat when prompt was shown)
    if (pendingMessage) {
      const messageToSend = pendingMessage;
      setPendingMessage('');
      setDetectedNewCategory('');
      
      // Show typing indicator immediately
      setIsTyping(true);
      
      // DIRECT MODE: use the direct-chat endpoint + system prompt
      if (conversationStylePref === 'direct') {
        try {
          const hasSeedAdviceInThread = (msgs: Message[]) =>
            msgs
              .filter(m => !m.isUser)
              .some(m =>
                /(🌱\s|here are some seeds|seeds you could plant|seed actions|specific seeds|seeds you can plant now|какие семена|вот (?:несколько|пара) семян|семена, которые)/i.test(
                  m.text || ''
                )
              );

          const deepSeekMessages: DeepSeekMessage[] = messages.map(m => ({
            id: m.id,
            text: m.text,
            isUser: m.isUser,
            timestamp: m.timestamp,
          }));

          // If user taps "Continue here" after a topic prompt, do NOT auto-insert past seeds.
          // Past seeds should only appear early (2nd AI reply) OR later only when explicitly requested.
          const intent: DirectChatIntent = (() => {
            const t = (messageToSend || '').trim();
            if (!t) return 'default';
            if (
              /\b(list|список)\b[\s\S]{0,40}\b(15|20|25|30)\b[\s\S]{0,16}\b(seeds?|семен[а-я]*)\b/i.test(t) ||
              /\b(15|20|25|30)\b[\s\S]{0,16}\b(seeds?|семен[а-я]*)\b[\s\S]{0,40}\b(list|список|идей|вариант)\b/i.test(
                t
              )
            )
              return 'seed_list_request';
            if (
              /\b(motivat(e|ion)?|pep talk|encourag(e|ing)?|inspir(e|ation)?|support me|calm me)\b/i.test(t) ||
              /\b(замотивир|мотивац|поддерж(и|ите)|ободр(и|ите)|успокой|вдохнов(и|и))\b/i.test(t)
            )
              return 'motivation_request';
            if (
              /[?？]/.test(t) ||
              /^\s*(why|what|how|can you|could you|do you|is it|are you)\b/i.test(t) ||
              /^\s*(почему|что|как|можешь|можете|подскажи|подскажите)\b/i.test(t)
            )
              return 'direct_question';
            if (
              /\b(i\s+(?:did|managed|helped|supported|stood up|defended|complimented|encouraged|apologiz(?:ed|ed)|donated|gave|reached out|set a boundary|said no|kept))\b/i.test(
                t
              ) ||
              /\b(я\s+(?:сделал(а)?|смог(ла)?|помог(ла)?|поддержал(а)?|защитил(а)?|вступил(а)?|сказал(а)?|написал(а)?|извинил(ся|ась)|пожертвовал(а)?|подарил(а)?|сказал(а)?\s+нет|сдержал(а)?\s+слово))\b/i.test(
                t
              )
            )
              return 'progress_update';
            return 'default';
          })();

          const explicitPastSeedsRequest =
            /(^|\b)(past seeds|possible past seeds|why is this happening|what did i do|what could i have done)\b|(^|\b)(прошл(ые|ые)\s+семен|возможн(ые|ые)\s+прошл(ые|ые)\s+семен|почему это происходит|из-за чего это|что я сдела(л|ла)|что я мог(ла)? сделать)/i.test(
              messageToSend
            );
          const cat = detectCategory(messageToSend);
          const includePastSeeds = (intent === 'default') && explicitPastSeedsRequest && cat !== 'safety';
          const inJourneyContext = hasSeedAdviceInThread(messages);
          const aiResponse = await sendDirectChatMessage(deepSeekMessages, messageToSend, isConversationHarvested, {
            category: cat,
            includePastSeeds,
            intent,
            inJourneyContext,
          });
          const finalAiResponse = addAIMessage(aiResponse, {
            categoryOverride: cat,
            offerIntentOverride: intent,
            offerInJourneyContextOverride: inJourneyContext,
          });

          // Save to storage (the prompt flow doesn't save the user's message until now)
          if (currentChatId) {
            const messagesToSave: ChatMessage[] = [
              { id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, text: messageToSend, isUser: true, timestamp: new Date().toISOString() },
              { id: `${Date.now()}-ai`, text: finalAiResponse, isUser: false, timestamp: new Date().toISOString() },
            ];
            await addMessagesToConversation(currentChatId, messagesToSave);
          }
        } catch (error) {
          console.error('Direct Chat Error (continue here):', error);
          addAIMessage("I'm here with you. Tell me more about what's on your heart. 💜");
        }
        return;
      }

      // Get AI response for post-completion (message is already in messages array)
      const fallbackResponse = `I hear you. Let's talk about that. 💜

What's been weighing on you?`;
      
      const aiResponse = await getAIResponse(
        messageToSend,
        // Ensure the message we prompted on is included, even if state hasn't updated yet.
        [...messages, { id: `${Date.now()}-pending`, text: messageToSend, isUser: true, timestamp: new Date() }],
        fallbackResponse
      );
      
      const finalAiResponse = addAIMessage(aiResponse);

      // Save to storage (the prompt flow doesn't save the user's message until now)
      if (currentChatId) {
        const messagesToSave: ChatMessage[] = [
          { id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, text: messageToSend, isUser: true, timestamp: new Date().toISOString() },
          { id: `${Date.now()}-ai`, text: finalAiResponse, isUser: false, timestamp: new Date().toISOString() },
        ];
        await addMessagesToConversation(currentChatId, messagesToSave);
      }
    }
  };

  // Load a conversation from history
  const handleLoadConversation = async (convo: ChatConversation) => {
    // Save current conversation before switching
    await saveCurrentConversation();
    
    await setActiveChatId(convo.id);
    await loadConversationIntoState(convo);
    // Reset topic-change baseline for the newly loaded thread
    setShowTopicChangePrompt(false);
    setPendingMessage('');
    setDetectedNewCategory('');
    setTopicBaselineCategory('general');
    setTopicChangeFromCategory('general');
    setLastTopicChangePromptKey('');
    setShowHistoryDrawer(false);
  };

  // Delete a conversation
  const handleDeleteConversation = (convoId: string) => {
    showAlert(
      t('chat.alerts.deleteConvoTitle'),
      t('chat.alerts.deleteConvoMessage'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteJourneyEverywhere(convoId);
            const updatedConvos = await getAllConversations();
            setConversations(updatedConvos);
            
            // If deleting current chat, start fresh
            if (convoId === currentChatId) {
              handleNewChat();
            }
          },
        },
      ]
    );
  };

  // Start editing a conversation title
  const handleStartEditTitle = (convoId: string, currentTitle: string) => {
    setEditingConvoId(convoId);
    setEditTitle(currentTitle);
  };

  // Save edited title
  const handleSaveTitle = async (convoId: string) => {
    const trimmedTitle = editTitle.trim();
    if (trimmedTitle && trimmedTitle.length > 0) {
      // Update conversation title
      await updateConversation(convoId, { title: trimmedTitle });
      
      // Update all garden seeds for this conversation
      await updateSeedsProblemTitle(convoId, trimmedTitle);
      
      // Refresh conversations list
      const updatedConvos = await getAllConversations();
      setConversations(updatedConvos);
      
      // If editing current chat, update the generated title state
      if (convoId === currentChatId) {
        setGeneratedProblemTitle(trimmedTitle);
      }
    }
    
    // Clear edit state
    setEditingConvoId(null);
    setEditTitle('');
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingConvoId(null);
    setEditTitle('');
  };

  // Post-completion: Log more seeds
  const handleLogMoreSeeds = () => {
    setShowPostCompletionOptions(false);
    setIsCompleted(false);
    setShowSeedLog(true);
    setPhase(6);
    setIsInPostCompletionMode(true);
    setPostCompletionChatMode(false);
    scrollToBottom();
  };

  // Post-completion: Check in on progress
  const handleHowsItGoing = async () => {
    // Reset all card states to ensure input bar is visible
    setShowPostCompletionOptions(false);
    setShowAha(false);
    setShowSeedIdeas(false);
    setShowGoPlant(false);
    setShowSeedLog(false);
    setShowPhase1Button(false);
    setShowPhase2Buttons(false);
    
    // Set chat mode states
    setIsInPostCompletionMode(true);
    setPostCompletionChatMode(true);
    setIsCompleted(true); // Ensure this is true so handleSend knows to respond
    
    const userMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: "I'd like to talk about how things are going.",
      isUser: true,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    scrollToBottom();
    
    // Show brief typing for UX consistency
    setIsTyping(true);
    setTimeout(() => {
      addAIMessage(`I'd love to hear! 🌱

How have things been shifting since you started planting seeds? 

Sometimes changes are subtle at first—small coincidences, unexpected opportunities, a slight shift in how things feel.

What have you noticed?`);
    }, 800);
  };

  // Switch from seed logging to chat mode
  const handleSwitchToChat = async () => {
    // Reset all card states to ensure input bar is visible
    setShowSeedLog(false);
    setShowAha(false);
    setShowSeedIdeas(false);
    setShowGoPlant(false);
    setShowPhase1Button(false);
    setShowPhase2Buttons(false);
    
    // Set chat mode states
    setPostCompletionChatMode(true);
    setIsCompleted(true); // Ensure this is true so handleSend knows to respond
    
    const userMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: "Actually, I'd like to share how I'm feeling.",
      isUser: true,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    scrollToBottom();
    
    // Show brief typing for UX consistency
    setIsTyping(true);
    setTimeout(() => {
      addAIMessage(`Of course! I'm here to listen. 💜

How are you feeling? What's been on your mind?`);
    }, 800);
  };

  // Switch from chat mode back to seed logging
  const handleSwitchToSeeds = () => {
    setShowSeedLog(true);
    setPostCompletionChatMode(false);
    setIsCompleted(false);
    setPhase(6);
    scrollToBottom();
  };

  // =====================
  // DIRECT CHAT MODE HANDLERS
  // =====================

  // Open the seed logging modal in Direct Chat mode
  const handleOpenDirectChatSeedModal = () => {
    // If conversation is harvested, prompt user to start a new journey
    if (isConversationHarvested) {
      showAlert(
        t('chat.alerts.harvestedTitle'),
        t('chat.alerts.harvestedMessage'),
        [{ text: t('common.gotIt'), style: 'default' }]
      );
      return;
    }
    
    captureScrollAnchor();
    setShowDirectChatSeedModal(true);
    setDirectChatSeeds([]);
    setDirectChatSeedInput('');
  };

  const closeDirectChatSeedModal = useCallback(() => {
    setShowDirectChatSeedModal(false);
    // After closing, bring the action row back into view so it doesn't feel like it disappeared.
    setTimeout(() => restoreScrollAnchor({ animated: true }), 80);
  }, [restoreScrollAnchor]);

  const handleDirectChatSeedBackdropPress = useCallback(() => {
    if (isKeyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    closeDirectChatSeedModal();
  }, [closeDirectChatSeedModal, isKeyboardVisible]);

  // Add a seed in Direct Chat modal
  const handleAddDirectChatSeed = () => {
    if (!directChatSeedInput.trim()) return;
    
    const newSeed: LoggedSeed = {
      id: `seed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action: directChatSeedInput.trim(),
      whoHelped: '', // Will be determined on save
    };
    
    setDirectChatSeeds(prev => [...prev, newSeed]);
    setDirectChatSeedInput('');
  };

  // Remove a seed from Direct Chat modal
  const handleRemoveDirectChatSeed = (seedId: string) => {
    setDirectChatSeeds(prev => prev.filter(s => s.id !== seedId));
  };

  // Save seeds from Direct Chat modal to garden
  const handleSaveDirectChatSeeds = async () => {
    if (directChatSeeds.length === 0) return;
    
    try {
      // Journey category must be stable and user-controlled (Garden picker).
      // Do NOT derive it from topic detection/baselines here.
      const conversationCategory = category || 'general';
      
      // Create or get conversation ID for these seeds
      let chatId = currentChatId;
      let problemTitle = '';  // Will hold the actual conversation title
      
      if (!chatId) {
        // Create a new conversation for direct chat seeds
        const title = directChatSeeds.length > 0 
          ? directChatSeeds[0].action.substring(0, 30) + '...'
          : 'My Seeds';
        const newConvo = await createConversation(
          title,
          conversationCategory,
          i18n.language === 'ru' ? 'ru' : 'en'
        );
        chatId = newConvo.id;
        setCurrentChatId(chatId);
        currentChatIdRef.current = chatId;
        problemTitle = title;
      } else {
        // Get title from existing conversation
        const currentConvo = conversations.find(c => c.id === chatId);
        problemTitle = currentConvo?.title || 'My Seeds';
      }

      // Phase 1 gating: "Garden Ticket" is spent only when the user plants seeds in a conversation
      // for the first time. Once ticketed, unlimited seeds can be planted in that conversation.
      const isPremium = await getEffectivePremiumFlag();
      const convo = conversations.find(c => c.id === chatId);
      const alreadyTicketed = !!convo?.gardenTicketed;
      if (!isPremium && !alreadyTicketed) {
        const ticketGate = await canSpendGardenTicket();
        if (!ticketGate.allowed) {
          const resetDate = new Date(ticketGate.cycleEndAt).toLocaleDateString();
          const buttons: any[] = [{ text: t('common.gotIt'), style: 'default' }];
          buttons.unshift({
            text: 'Upgrade',
            style: 'default',
            onPress: () => navigation.navigate('Paywall', { source: 'garden_ticket_limit_direct' }),
          });
          if (__DEV__) {
            buttons.unshift({
              text: 'Enable Premium (Testing)',
              style: 'default',
              onPress: async () => {
                await setDevForcePremium(true);
              },
            });
          }
          showAlert(
            'Premium required',
            `You’ve used your ${2} free Garden Journeys. It resets on ${resetDate}.`,
            buttons
          );
          return;
        }

        const remainingAfter = ticketGate.remainingAfter;
        let confirmed = false;
        await new Promise<void>((resolve) => {
          showAlert(
            t('chat.gardenTicket.confirmTitle'),
            t('chat.gardenTicket.confirmBody', { remaining: remainingAfter }),
            [
              { text: t('common.cancel'), style: 'cancel', onPress: () => resolve() },
              {
                text: t('chat.gardenTicket.confirmContinue'),
                style: 'default',
                onPress: async () => {
                  confirmed = true;
                  await recordGardenTicketSpent();
                  await markConversationGardenTicketed(chatId);
                  setConversations(prev =>
                    prev.map(c => (c.id === chatId ? { ...c, gardenTicketed: true } : c))
                  );
                  resolve();
                },
              },
            ]
          );
        });

        if (!confirmed) {
          return;
        }
      }
      
      // Add seeds to garden
      await addSeedsToGarden(
        directChatSeeds,
        conversationCategory,
        chatId,
        problemTitle
      );

      // Create a pending meditation so the Meditations banner and Chat congratulations
      // can reflect completion after the user finishes the audio.
      await savePendingMeditation(directChatSeeds, conversationCategory, chatId);
      
      // Log seeds to conversation
      await logSeedsToConversation(chatId, directChatSeeds.map(s => ({ id: s.id, action: s.action })));
      
      // Increment completed conversations count (for auto-switching to Direct Chat)
      await incrementCompletedConversations();
      
      // Close modal and show success message
      setShowDirectChatSeedModal(false);
      
      // Add confirmation message
      addAIMessage(t('chat.system.directSeedsSaved', { count: directChatSeeds.length }), {
        skipNextStepOffer: true,
      });
      scrollToBottom();
      
      // Reload conversations
      // Refresh the history list without clearing the active chat id.
      // Clearing it breaks seed-based meditation recommendations when switching tabs.
      refreshConversationsList();
    } catch (error) {
      console.error('Error saving direct chat seeds:', error);
      showAlert(t('common.error'), t('chat.alerts.saveError'));
    }
  };

  // Navigate to Meditations from Direct Chat
  const handleDirectChatMeditate = () => {
    // In Direct Chat, the user can switch topics mid-thread; use the active topic (baseline/dominant),
    // not the potentially stale conversation `category`.
    const dominant = getDominantCategory(messages, category);
    const baseline = topicBaselineCategory !== 'general' ? topicBaselineCategory : dominant;
    const activeCategory = baseline !== 'general' ? baseline : (category || 'general');

    const go = async () => {
      // Preserve current scroll position so when the user comes back from Meditations,
      // the action row is still visible (no "buttons disappeared" confusion).
      captureScrollAnchor();

      const premium = await getEffectivePremiumFlag();
      // Make the Meditations tab aware of which conversation the user is in.
      await setActiveChatId(currentChatId);

      // Only recommend "Based on your seeds" when this conversation actually has seeds.
      // If no seeds, open Meditations normally (no recommendation).
      const hasSeedsHere = await (async () => {
        if (!currentChatId) return false;
        try {
          const all = await getAllGardenSeeds();
          return all.some(s => s.conversationId === currentChatId);
        } catch {
          return false;
        }
      })();

      if (!hasSeedsHere) {
        navigation.navigate('Meditations');
        return;
      }

      const recommendedMeditationId = premium
        ? (CATEGORY_TO_MEDITATION[activeCategory] || CATEGORY_TO_MEDITATION.general)
        : '4';

      navigation.navigate('Meditations', {
        recommendedMeditationId,
        fromChat: true,
        conversationId: currentChatId || undefined,
      });
    };
    void go();
  };

  // Handle mode selection - Problem Mode
  const handleSelectProblemMode = () => {
    setConversationMode('problem');
    setShowModeSelection(false);
    
    // Add the problem mode opening message
    const openerMessage: Message = {
      id: `${Date.now()}-opener`,
      text: getProblemModeOpener(),
      isUser: false,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, openerMessage]);
    
    setTimeout(() => scrollToBottom(), 100);
  };

  // Handle mode selection - Goal Mode
  const handleSelectGoalMode = () => {
    setConversationMode('goal');
    setShowModeSelection(false);
    
    // Add the goal mode opening message
    const openerMessage: Message = {
      id: `${Date.now()}-opener`,
      text: getGoalModeOpener(),
      isUser: false,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, openerMessage]);
    
    setTimeout(() => scrollToBottom(), 100);
  };

  // Handle experience option toggle
  const handleToggleExperience = (experienceText: string) => {
    setSelectedExperiences(prev => {
      if (prev.includes(experienceText)) {
        return prev.filter(e => e !== experienceText);
      } else {
        return [...prev, experienceText];
      }
    });
  };
  
  // Handle continue from experience selection
  const handleExperienceContinue = async () => {
    // Collapse the experience card (keep it visible)
    setExperienceExpanded(false);
    
    // HEAVY TOPIC FLOW: Skip the button, go straight to empowerment + seeds
    if (isHeavyTopic) {
      // One unified message: empathy + acknowledgment + empowerment
      const unifiedMessage: Message = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: "Thank you for sharing that with me. 💛\n\nThis is incredibly hard. And while we may never fully understand all the reasons why some people experience this and others don't...\n\nWhat IS clear is that the seeds you plant now—even small acts of kindness, peace, and support—shape your future reality. Like ripples in water, what you give tends to come back.\n\nLet me show you some powerful seeds you can plant.",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, unifiedMessage]);
      setPhase(4); // Skip to seeds phase
      
      // Show typing indicator while generating seeds
      setIsTyping(true);
      setIsGeneratingContent(true);
      
      try {
        // Generate personalized seeds
        const allMessages = [...messages, unifiedMessage];
        const deepSeekMessages: DeepSeekMessage[] = allMessages.map(m => ({
          id: m.id,
          text: m.text,
          isUser: m.isUser,
          timestamp: m.timestamp
        }));
        
        const content = await getPersonalizedMirrorAndSeeds(deepSeekMessages, false, selectedExperiences);
        setPersonalizedContent(content);
        
        // Save personalized content
        if (currentChatId && content) {
          const storedContent: StoredPersonalizedContent = {
            mirrorExplanation: content.mirrorExplanation,
            reciprocalLaw: content.reciprocalLaw,
            seeds: content.seeds,
          };
          await updateConversation(currentChatId, { personalizedContent: storedContent });
        }
      } catch (error) {
        console.log('Error generating personalized content for heavy topic');
        setPersonalizedContent(null);
      }
      
      setIsTyping(false);
      setIsGeneratingContent(false);
      
      // Show seeds card directly
      setTimeout(() => {
        setShowSeedIdeas(true);
        scrollToCard('seedIdeas', 80);
      }, 300);
      
      return;
    }
    
    // NORMAL FLOW: Show thank you message + button
    const reassuringMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: "Thank you for sharing that with me. 💛 This really helps me understand what you're going through.\n\nWhen you're ready, let's gently explore why this might be happening.",
      isUser: false,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, reassuringMessage]);
    
    setShowPhase1Button(true);
    setPhase(2);
    
    // Scroll to show the message and button
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Handle Phase 1 button click
  const handlePhase1Continue = async () => {
    setShowPhase1Button(false);
    
    const userMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: "I'm ready to understand why this might be happening.",
      isUser: true,
      timestamp: new Date(),
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    scrollToBottom();
    
    // Show typing indicator immediately
    setIsTyping(true);
    
    // HEAVY TOPIC FLOW: Skip Mirror exploration, go straight to empathy → seeds
    if (isHeavyTopic) {
      // For heavy topics, we don't ask "did you ever do X?" - it would be absurd/cruel
      // Instead, we acknowledge the difficulty and go straight to empowering seeds
      const heavyTopicResponse = `This is incredibly hard. And while we may never fully understand all the reasons why some people experience this and others don't...

What IS clear is that the seeds you plant now—even small acts of the opposite energy—shape your future reality.

Cause and effect works like ripples in water. The kindness, peace, and support you give to others tends to come back to you.

Let me show you some powerful seeds you can plant.`;
      
      addAIMessage(heavyTopicResponse);
      
      // Generate personalized seeds (skip Mirror, go straight to Seeds)
      setIsGeneratingContent(true);
      
      try {
        const deepSeekMessages: DeepSeekMessage[] = updatedMessages.map(m => ({
          id: m.id,
          text: m.text,
          isUser: m.isUser,
          timestamp: m.timestamp
        }));
        
        // Generate seeds focused on the future (not exploring past) - pass isHeavyTopic=true
        const content = await getPersonalizedMirrorAndSeeds(deepSeekMessages, false, selectedExperiences, true);
        setPersonalizedContent(content);
        
        // Save personalized content
        if (currentChatId && content) {
          const storedContent: StoredPersonalizedContent = {
            mirrorExplanation: content.mirrorExplanation,
            reciprocalLaw: content.reciprocalLaw,
            seeds: content.seeds,
          };
          await updateConversation(currentChatId, { personalizedContent: storedContent });
        }
      } catch (error) {
        console.log('Error generating personalized content for heavy topic');
        setPersonalizedContent(null);
      }
      
      setIsGeneratingContent(false);
      
      // Skip Phase 2 buttons (yes/no) and Mirror card, go straight to Seeds
      setPhase(4);
      setTimeout(() => {
        setShowSeedIdeas(true);
        scrollToCard('seedIdeas', 80);
      }, 300);
      
      return;
    }
    
    // NORMAL FLOW: Exploration phase
    let aiResponse: string;
    
    // If user selected experiences, generate personalized exploration message
    if (selectedExperiences.length > 0) {
      const deepSeekMessages: DeepSeekMessage[] = updatedMessages.map(m => ({
        id: m.id,
        text: m.text,
        isUser: m.isUser,
        timestamp: m.timestamp
      }));
      
      const personalizedMessage = await getPersonalizedExplorationMessage(deepSeekMessages, selectedExperiences);
      
      if (personalizedMessage) {
        aiResponse = personalizedMessage;
      } else {
        // Fallback to generic exploration
        const responseSet = isExperienced ? EXPERIENCED_USER_RESPONSES : PHASE_RESPONSES;
        const fallbackResponses = responseSet[category] || responseSet.general;
        aiResponse = await getAIResponse(
      userMessage.text,
      updatedMessages,
      fallbackResponses.phase2
    );
      }
    } else {
      // No experiences selected - use existing behavior
      const responseSet = isExperienced ? EXPERIENCED_USER_RESPONSES : PHASE_RESPONSES;
      const fallbackResponses = responseSet[category] || responseSet.general;
      aiResponse = await getAIResponse(
        userMessage.text,
        updatedMessages,
        fallbackResponses.phase2
      );
    }
    
    addAIMessage(aiResponse);
    setShowPhase2Buttons(true);
    setPhase(3);
  };

  // Handle Phase 2 buttons
  const handlePhase2Yes = async () => {
    setShowPhase2Buttons(false);
    setIsSkepticalMode(false); // User confirmed they can think of something - not skeptical
    
    const userMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: "Yes, I can think of something...",
      isUser: true,
      timestamp: new Date(),
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    // Show typing indicator while generating personalized content
    setIsTyping(true);
    setIsGeneratingContent(true);
    
    // Scroll to show the typing indicator
    scrollToBottom();
    
    try {
      // Generate personalized Mirror & Seeds content based on the conversation
      const deepSeekMessages: DeepSeekMessage[] = updatedMessages.map(m => ({
        id: m.id,
        text: m.text,
        isUser: m.isUser,
        timestamp: m.timestamp
      }));
      
      const content = await getPersonalizedMirrorAndSeeds(deepSeekMessages, false, selectedExperiences); // Not skeptical, pass selected experiences
      setPersonalizedContent(content);
      
      // Save personalized content to conversation for persistence
      if (currentChatId && content) {
        const storedContent: StoredPersonalizedContent = {
          mirrorExplanation: content.mirrorExplanation,
          reciprocalLaw: content.reciprocalLaw,
          seeds: content.seeds,
        };
        await updateConversation(currentChatId, { personalizedContent: storedContent });
      }
    } catch (error) {
      console.log('Error generating personalized content, using defaults');
      setPersonalizedContent(null);
    }
    
    setIsTyping(false);
    setIsGeneratingContent(false);
    
    // Show Aha card with personalized content
    setTimeout(() => {
      setShowAha(true);
      scrollToCard('aha', 80); // Smart scroll showing previous content
    }, 300);
  };

  const handlePhase2Think = async () => {
    setShowPhase2Buttons(false);
    setIsSkepticalMode(true); // User is skeptical, use softer language
    
    const userMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: "Let me think about this...",
      isUser: true,
      timestamp: new Date(),
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    // Show typing indicator immediately
    setIsTyping(true);
    
    // Add AI message first
    const aiMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: `Take your time. Sometimes the connection isn't obvious at first—it might be something small you've forgotten, or even a thought you had about someone.\n\nEven if nothing specific comes to mind, that's okay. Let me show you what I mean...`,
      isUser: false,
      timestamp: new Date(),
    };
    
    setTimeout(async () => {
      setIsTyping(false);
      setMessages(prev => [...prev, aiMessage]);
      
      // Scroll to show the AI message immediately after it's added
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
        // Show "Show me" button after scroll animation
        setTimeout(() => {
          setShowShowMeButton(true);
        }, 300);
      }, 100);
      
      // Generate personalized content in the background (don't block UI)
      setIsGeneratingContent(true);
      
      try {
        const deepSeekMessages: DeepSeekMessage[] = [...updatedMessages, aiMessage].map(m => ({
          id: m.id,
          text: m.text,
          isUser: m.isUser,
          timestamp: m.timestamp
        }));
        
        const content = await getPersonalizedMirrorAndSeeds(deepSeekMessages, false, selectedExperiences); // Same content as non-skeptical, "might've" added client-side
        setPersonalizedContent(content);
        
        // Save personalized content to conversation for persistence
        if (currentChatId && content) {
          const storedContent: StoredPersonalizedContent = {
            mirrorExplanation: content.mirrorExplanation,
            reciprocalLaw: content.reciprocalLaw,
            seeds: content.seeds,
          };
          await updateConversation(currentChatId, { personalizedContent: storedContent });
        }
      } catch (error) {
        console.log('Error generating personalized content, using defaults');
        setPersonalizedContent(null);
      }
      
      setIsGeneratingContent(false);
    }, 800);
  };

  // Seed logging functions
  const handleAddSeed = async () => {
    if (!currentSeedInput.trim()) return;

    // Phase 1 gating: require a Garden Ticket on the first plant in this conversation.
    const isPremium = await getEffectivePremiumFlag();
    const chatId = currentChatId;
    const convo = chatId ? conversations.find(c => c.id === chatId) : null;
    const alreadyTicketed = !!convo?.gardenTicketed;
    if (!isPremium && !alreadyTicketed) {
      const ticketGate = await canSpendGardenTicket();
      if (!ticketGate.allowed) {
        const resetDate = new Date(ticketGate.cycleEndAt).toLocaleDateString();
        const buttons: any[] = [{ text: t('common.gotIt'), style: 'default' }];
        buttons.unshift({
          text: 'Upgrade',
          style: 'default',
          onPress: () => navigation.navigate('Paywall', { source: 'garden_ticket_limit_guided' }),
        });
        if (__DEV__) {
          buttons.unshift({
            text: 'Enable Premium (Testing)',
            style: 'default',
            onPress: async () => {
              await setDevForcePremium(true);
            },
          });
        }
        showAlert(
          'Premium required',
          `You’ve used your ${2} free Garden Journeys. It resets on ${resetDate}.`,
          buttons
        );
        return;
      }

      let confirmed = false;
      await new Promise<void>((resolve) => {
        showAlert(
          t('chat.gardenTicket.confirmTitle'),
          t('chat.gardenTicket.confirmBody', { remaining: ticketGate.remainingAfter }),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => resolve() },
            {
              text: t('chat.gardenTicket.confirmContinue'),
              style: 'default',
              onPress: async () => {
                confirmed = true;
                await recordGardenTicketSpent();
                if (chatId) {
                  await markConversationGardenTicketed(chatId);
                  setConversations(prev =>
                    prev.map(c => (c.id === chatId ? { ...c, gardenTicketed: true } : c))
                  );
                }
                resolve();
              },
            },
          ]
        );
      });

      if (!confirmed) return;
    }
    
    const newSeed: LoggedSeed = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action: currentSeedInput.trim(),
      whoHelped: '',
    };
    
    // Add to local state
    setLoggedSeeds(prev => [...prev, newSeed]);
    setCurrentSeedInput('');
    Keyboard.dismiss();
    
    // Use the generated clean title if available, otherwise fall back to first message
    const firstUserMessage = messages.find(m => m.isUser);
    const problemTitle = generatedProblemTitle || firstUserMessage?.text || 'My goal';
    
    // Immediately save to garden so it appears right away
    // Include conversationId to keep this problem's seeds separate from other problems
    await addSeedsToGarden(
      [newSeed], 
      category, 
      currentChatId || `temp_${Date.now()}`,
      problemTitle
    );
  };

  const handleRemoveSeed = (id: string) => {
    setLoggedSeeds(prev => prev.filter(s => s.id !== id));
  };

  // Start audio meditation - save state and navigate
  const handleStartAudioMeditation = async () => {
    // Save pending meditation to storage
    await savePendingMeditation(loggedSeeds, category, currentChatId || undefined);
    
    // Increment completed conversations count (for auto-switching to Direct Chat)
    await incrementCompletedConversations();
    
    // Get the recommended meditation
    const premium = await getEffectivePremiumFlag();
    const meditationId = premium ? (CATEGORY_TO_MEDITATION[category] || CATEGORY_TO_MEDITATION.general) : '4';
    const meditation = meditations.find(m => m.id === meditationId);
    
    // Add a message before navigating
    addAIMessage(
      t('chat.system.guidedSeedsSaved', {
        count: loggedSeeds.length,
        meditationTitle: meditation?.title || 'Daily Gratitude Brew',
      }),
      { skipNextStepOffer: true }
    );
    setShowSeedLog(false);
    scrollToBottom();
    
    // Navigate to Meditations tab with the recommended meditation
    setTimeout(() => {
      navigation.navigate('Meditations', {
        recommendedMeditationId: meditationId,
        fromChat: true,
      });
    }, 1500);
  };
  const currentJourneyTitle = useMemo(() => {
    if (!currentChatId) return '';
    const convo = conversations.find(c => c.id === currentChatId);
    return convo?.title || '';
  }, [conversations, currentChatId]);
  // Show input when no active cards are expanded (experience selection expanded blocks input)
  // Also hide input until user selects a conversation mode (problem or goal) - BUT show immediately in Direct Chat mode
  const isDirectMode = conversationStylePref === 'direct';
  // In Direct Chat mode we never hide the input based on legacy guided UI flags.
  const showInput = isDirectMode
    ? true
    : !showModeSelection &&
      !showPhase1Button &&
      !showPhase2Buttons &&
      !(showExperienceSelection && experienceExpanded) &&
      !showSeedLog;

  // Note: We removed the loading guard to prevent blocking navigation
  // The UI will work with fallback values if translations aren't ready
  console.log('[ChatScreen] Ready to render, messages:', messages.length);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerButton}
          onPress={() => setShowHistoryDrawer(true)}
        >
          <Text style={styles.headerButtonText}>☰</Text>
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>{t('chat.seedsGuide.name')}</Text>
            <View style={styles.onlineIndicator} />
          </View>
          <Text style={styles.headerSubtitle}>{t('chat.seedsGuide.subtitle')}</Text>

          {/* Subtle premium entry: crown icon only (no extra header height). */}
          <TouchableOpacity
            style={[
              styles.premiumCrownButton,
              isPremiumUi ? styles.premiumCrownButtonActive : styles.premiumCrownButtonFree,
            ]}
            onPress={() =>
              navigation.navigate('Paywall', {
                source: 'seeds_guide_crown',
                mode: isPremiumUi ? 'manage' : 'upgrade',
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.premiumCrownIcon}>👑</Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity 
          style={styles.headerButton}
          onPress={handleNewChat}
        >
          <Text style={styles.headerButtonText}>✚</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <View style={styles.dividerDot} />
        <View style={styles.dividerLine} />
      </View>

      {isCloudRestoring ? (
        <View style={styles.restoreBanner} pointerEvents="none">
          <View style={styles.restoreBannerCard}>
            <Text style={styles.restoreBannerText}>
              ☁️ {i18n.language === 'ru' ? 'Восстанавливаем данные…' : 'Restoring your data…'}
            </Text>
          </View>
        </View>
      ) : null}

      {/* History Drawer Modal */}
      <Modal
        visible={showHistoryDrawer}
        animationType="slide"
        transparent
        onRequestClose={() => setShowHistoryDrawer(false)}
      >
        <View style={styles.drawerOverlay}>
          <TouchableOpacity 
            style={styles.drawerBackdrop}
            onPress={() => setShowHistoryDrawer(false)}
          />
          <View style={styles.drawerContainer}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>{t('chat.history.title')}</Text>
              <TouchableOpacity onPress={() => setShowHistoryDrawer(false)}>
                <Text style={styles.drawerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={styles.newChatButton}
              onPress={handleNewChat}
            >
              <Text style={styles.newChatIcon}>✚</Text>
              <Text style={styles.newChatText}>{t('chat.welcome.newChat')}</Text>
            </TouchableOpacity>

            <Text style={styles.newChatTip}>
              {t('chat.history.newTopicTip')}
            </Text>
            
            <ScrollView style={styles.conversationsList}>
              {conversations.length === 0 ? (
                <View style={styles.emptyHistory}>
                  <Text style={styles.emptyHistoryEmoji}>🌱</Text>
                  <Text style={styles.emptyHistoryText}>{t('chat.history.empty')}</Text>
                  <Text style={styles.emptyHistoryHint}>{t('chat.history.emptyHint')}</Text>
                </View>
              ) : (
                conversations.map((convo) => (
                  <TouchableOpacity
                    key={convo.id}
                    style={[
                      styles.conversationItem,
                      convo.id === currentChatId && styles.conversationItemActive
                    ]}
                    onPress={() => editingConvoId !== convo.id && handleLoadConversation(convo)}
                    activeOpacity={editingConvoId === convo.id ? 1 : 0.7}
                  >
                    <View style={styles.conversationContent}>
                      {editingConvoId === convo.id ? (
                        <TextInput
                          style={styles.editTitleInput}
                          value={editTitle}
                          onChangeText={setEditTitle}
                          autoCorrect
                          spellCheck
                          autoCapitalize="sentences"
                          autoFocus
                          selectTextOnFocus
                          onSubmitEditing={() => handleSaveTitle(convo.id)}
                          returnKeyType="done"
                        />
                      ) : (
                        <Text style={styles.conversationTitle} numberOfLines={1}>
                          {convo.title}
                        </Text>
                      )}
                      <View style={styles.conversationMeta}>
                        <Text style={styles.conversationDate}>
                          {formatConversationDateTranslated(convo.updatedAt)}
                        </Text>
                        {convo.seedsLogged && convo.seedsLogged.length > 0 && (
                          <Text style={styles.conversationStatus}>
                            • 🌱 {convo.seedsLogged.length}
                          </Text>
                        )}
                      </View>
                    </View>
                    
                    {/* Action buttons */}
                    <View style={styles.convoActionButtons}>
                      {editingConvoId === convo.id ? (
                        <>
                          <TouchableOpacity
                            style={styles.convoActionButton}
                            onPress={() => handleSaveTitle(convo.id)}
                          >
                            <Text style={styles.convoActionIcon}>✓</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.convoActionButton}
                            onPress={handleCancelEdit}
                          >
                            <Text style={styles.convoActionIcon}>✕</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={styles.convoActionButton}
                            onPress={() => handleStartEditTitle(convo.id, convo.title)}
                          >
                            <Text style={styles.convoActionIcon}>✏️</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.convoActionButton}
                            onPress={() => handleDeleteConversation(convo.id)}
                          >
                            <Text style={styles.convoActionIcon}>🗑️</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={styles.keyboardView}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={[
            styles.messagesContent,
            {
              paddingBottom:
                Math.max(inputBarHeight, 0) + (isKeyboardVisible ? keyboardHeight : tabBarHeight) + 12,
            }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onScroll={handleMessagesScroll}
          scrollEventThrottle={16}
          onContentSizeChange={(_, h) => {
            const prevH = lastMainContentHRef.current || 0;
            lastMainContentHRef.current = h || 0;
            if (shouldJumpToBottomRef.current) {
              shouldJumpToBottomRef.current = false;
              scrollViewRef.current?.scrollToEnd({ animated: false });
            }
            // If content is growing while streaming and the user isn't at bottom,
            // show a passive hint that more text is below.
            if (streamingMessageId && !isNearBottomRef.current && (h || 0) > prevH + 8) {
              setShowNewBelowMain(true);
            }
          }}
        >
          <View style={styles.dateSeparator}>
            <Text style={styles.dateText}>{t('common.today')}</Text>
          </View>

          {(() => {
            // Find the index where Experience Selection Card should be inserted
            // It should appear BEFORE the "Thank you for sharing" message (which comes after experience selection)
            const thankYouMessageIndex = messages.findIndex(
              m => !m.isUser && m.text.startsWith("Thank you for sharing that with me.")
            );
            // Fallback: look for the "I'm ready to understand" message
            const phase1MessageIndex = thankYouMessageIndex >= 0 
              ? thankYouMessageIndex 
              : messages.findIndex(m => m.isUser && m.text === "I'm ready to understand why this might be happening.");
            
            // If found and experience selection should show, split the rendering
            if (showExperienceSelection && phase1MessageIndex > 0) {
              const messagesBefore = messages.slice(0, phase1MessageIndex);
              const messagesAfter = messages.slice(phase1MessageIndex);
              
              return (
                <>
                  {messagesBefore.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                    />
          ))}

                  {/* Experience Selection Card - positioned correctly in flow */}
                  {!isGeneratingExperiences && experienceOptions.length > 0 && (
                    <View onLayout={handleCardLayout('experienceSelection')}>
                      <ExperienceSelectionCard
                        options={experienceOptions}
                        selectedOptions={selectedExperiences}
                        onToggleOption={handleToggleExperience}
                        onContinue={handleExperienceContinue}
                        isCollapsed={!experienceExpanded}
                        onToggle={() => setExperienceExpanded(!experienceExpanded)}
                        canCollapse={phase >= 2}
                        isSubmitted={phase >= 2}
                      />
                    </View>
                  )}
                  
                  {messagesAfter.map((message, idx) => (
                    <MessageBubble
                      key={`${message.id}-${idx}`}
                      message={message}
                    />
                  ))}
                </>
              );
            }
            
            // Default: render all messages normally
            return messages.map((message, idx) => (
              <MessageBubble key={`${message.id}-${idx}`} message={message} />
            ));
          })()}

          {((isTypingHere) || isGeneratingExperiences || isGeneratingContent) && <TypingIndicator />}

          {/* Mode Selection Card - shown when starting a new conversation (only in Guided Journey mode) */}
          {!isDirectMode && showModeSelection && conversationMode === null && !isCompleted && (
            <ModeSelectionCard
              onSelectProblem={handleSelectProblemMode}
              onSelectGoal={handleSelectGoalMode}
            />
          )}

          {/* Experience Selection Card - legacy guided flow (disabled in Direct Chat mode) */}
          {!isDirectMode && showExperienceSelection && !isGeneratingExperiences && experienceOptions.length > 0 && !messages.some(m => !m.isUser && m.text.startsWith("Thank you for sharing that with me.")) && !messages.some(m => m.isUser && m.text === "I'm ready to understand why this might be happening.") && (
            <View onLayout={handleCardLayout('experienceSelection')}>
              <ExperienceSelectionCard
                options={experienceOptions}
                selectedOptions={selectedExperiences}
                onToggleOption={handleToggleExperience}
                onContinue={handleExperienceContinue}
                isCollapsed={!experienceExpanded}
                onToggle={() => setExperienceExpanded(!experienceExpanded)}
                canCollapse={phase >= 2}
                isSubmitted={phase >= 2}
              />
            </View>
          )}

          {/* Phase 1 Button - legacy guided flow (disabled in Direct Chat mode) */}
          {!isDirectMode && showPhase1Button && (
            <View style={styles.phaseButtonContainer}>
              <PhaseButton text={PHASE_BUTTONS.afterPhase1} onPress={handlePhase1Continue} />
            </View>
          )}

          {/* Phase 2 Buttons - legacy guided flow (disabled in Direct Chat mode) */}
          {!isDirectMode && showPhase2Buttons && (
            <View style={styles.phaseButtonContainer}>
              <PhaseButton text={PHASE_BUTTONS.afterPhase2Yes} onPress={handlePhase2Yes} />
              <PhaseButton text={PHASE_BUTTONS.afterPhase2Think} onPress={handlePhase2Think} variant="secondary" />
            </View>
          )}

          {/* Legacy guided cards (The Mirror / Your Seeds / Ready to Plant) were removed. */}

          {/* Seed logging card - legacy guided flow (disabled in Direct Chat mode) */}
          {!isDirectMode && showSeedLog && (
            <LogSeedsCard 
              loggedSeeds={loggedSeeds}
              currentSeedInput={currentSeedInput}
              onSeedInputChange={setCurrentSeedInput}
              onAddSeed={handleAddSeed}
              onRemoveSeed={handleRemoveSeed}
              onStartMeditation={handleStartAudioMeditation}
              onSwitchToChat={handleSwitchToChat}
              showSwitchOption={isInPostCompletionMode}
            />
          )}

          {/* Suggestions - show after mode is selected OR in Direct Chat mode */}
          {userMessageCount === 0 && !isTypingHere && !isGeneratingExperiences && (isDirectMode || (conversationMode !== null && !showModeSelection)) && (
            <View style={[styles.suggestionsContainer, userMessageCount === 0 && styles.suggestionsContainerInitial]}>
              <Text style={[styles.suggestionsLabel, userMessageCount === 0 && styles.suggestionsLabelInitial]}>
                {isDirectMode ? t('chat.prompts.whatsOnHeart') : (conversationMode === 'goal' ? t('chat.prompts.popularGoals') : t('chat.prompts.whatsOnMind'))}
              </Text>
              {Platform.OS === 'web' ? (
                <View style={styles.suggestionsGrid}>
                  {(isDirectMode
                    ? [...getConversationStarters().slice(0, 3), ...getGoalStarters().slice(0, 3)]
                    : (conversationMode === 'goal' ? getGoalStarters() : getConversationStarters())
                  ).map((suggestion, index) => (
                    <SuggestionChip key={index} text={suggestion} onPress={() => handleSend(suggestion)} />
                  ))}
                </View>
              ) : (
                <View style={styles.suggestionsCarouselWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.suggestionsRow}
                    keyboardShouldPersistTaps="handled"
                    scrollEventThrottle={16}
                    onLayout={(e) => {
                      suggestionsLayoutWRef.current = e.nativeEvent.layout.width;
                      const canScroll = suggestionsContentWRef.current > suggestionsLayoutWRef.current + 4;
                      setSuggestionsScrollable(canScroll);
                      if (!canScroll) setShowSuggestionsHint(false);
                    }}
                    onContentSizeChange={(w) => {
                      suggestionsContentWRef.current = w;
                      const canScroll = suggestionsContentWRef.current > suggestionsLayoutWRef.current + 4;
                      setSuggestionsScrollable(canScroll);
                      if (!canScroll) setShowSuggestionsHint(false);
                    }}
                    onScroll={(e) => {
                      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                      if (contentOffset.x > 8) {
                        setShowSuggestionsHint(false);
                        return;
                      }
                      // Also hide if we've reached the end.
                      if (contentOffset.x + layoutMeasurement.width >= contentSize.width - 8) {
                        setShowSuggestionsHint(false);
                      }
                    }}
                  >
                    {(isDirectMode
                      ? [...getConversationStarters().slice(0, 3), ...getGoalStarters().slice(0, 3)]
                      : (conversationMode === 'goal' ? getGoalStarters() : getConversationStarters())
                    ).map((suggestion, index) => (
                      <SuggestionChip
                        key={index}
                        text={suggestion}
                        onPress={() => handleSend(suggestion)}
                        style={styles.suggestionChipRow}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* Topic Change Prompt (disabled) */}
          {ENABLE_TOPIC_CHANGE_PROMPT && showTopicChangePrompt && (
            <View style={styles.topicChangeContainer}>
              <Text style={styles.topicChangeEmoji}>💜</Text>
              <Text style={styles.topicChangeTitle}>
                {t('chat.topicChangePrompt.title')}
              </Text>
              <Text style={styles.topicChangeText}>
                {t('chat.topicChangePrompt.text')}
              </Text>
              <Text style={styles.topicChangeQuestion}>
                {t('chat.topicChangePrompt.question')}
              </Text>
              <View style={styles.topicChangeButtons}>
                <TouchableOpacity 
                  style={styles.topicChangeButtonPrimary}
                  onPress={handleStartFreshChat}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[Colors.mocha, Colors.latte]}
                    style={styles.topicChangeButtonGradient}
                  >
                    <Text style={styles.topicChangeButtonTextPrimary}>
                      🌱 {t('chat.topicChangePrompt.startFresh')}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.topicChangeButtonSecondary}
                  onPress={handleContinueHere}
                  activeOpacity={0.7}
                >
                  <Text style={styles.topicChangeButtonTextSecondary}>
                    {t('chat.topicChangePrompt.continueHere')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Switch to seeds option when in post-completion chat mode */}
          {isInPostCompletionMode && postCompletionChatMode && !showSeedLog && !isTypingHere && (
            <TouchableOpacity style={styles.switchModeContainer} onPress={handleSwitchToSeeds} activeOpacity={0.7}>
              <Text style={styles.switchModeLinkText}>🌱 Want to log more seeds instead?</Text>
            </TouchableOpacity>
          )}

          {/* Direct Chat Mode: Actions */}
          {isDirectMode && !isTypingHere && !streamingMessageId && !showDirectChatSeedModal && (
            <View style={styles.directChatActionsOuter}>
              {directChatActionsEnabled ? (
                <View style={styles.directChatActionsContainer}>
                  <TouchableOpacity
                    style={[
                      styles.directChatActionButton,
                      isConversationHarvested && styles.directChatActionButtonHarvested,
                    ]}
                    onPress={handleOpenDirectChatSeedModal}
                    activeOpacity={0.8}
                  >
                    {isConversationHarvested ? (
                      <View style={styles.directChatActionHarvested}>
                        <Text style={styles.directChatActionTextHarvested}>
                          {t('chat.harvested.status')}
                        </Text>
                      </View>
                    ) : (
                      <LinearGradient
                        colors={[Colors.mocha, Colors.latte]}
                        style={styles.directChatActionGradient}
                      >
                        <View style={styles.directChatActionLabelRow}>
                          <Text
                            style={styles.directChatActionLabelText}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.85}
                          >
                            {t('chat.cards.plantSeeds')}
                          </Text>
                          <Text style={styles.directChatActionEmoji}>🌱</Text>
                        </View>
                      </LinearGradient>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.directChatActionButton}
                    onPress={handleDirectChatMeditate}
                    activeOpacity={0.8}
                  >
                    <View style={styles.directChatActionSecondary}>
                      <View style={styles.directChatActionLabelRow}>
                        <Text
                          style={styles.directChatActionLabelTextSecondary}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.85}
                        >
                          {t('chat.cards.meditate')}
                        </Text>
                        <Text style={styles.directChatActionEmoji}>☕</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.directChatActionsCompactRow}>
                  {showChatActionsInfoDot && (
                    <TouchableOpacity
                      style={styles.directChatActionsInfoDot}
                      onPress={() => {
                        handleDirectChatActionsLocked();
                        dismissChatActionsInfoDot();
                      }}
                      activeOpacity={0.8}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <MaterialIcons name="help-outline" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.directChatActionCompactButton}
                    onPress={handleDirectChatActionsLocked}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.cards.plantSeeds')}
                  >
                    <Text style={styles.directChatActionCompactEmoji}>🌱</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.directChatActionCompactButton}
                    onPress={handleDirectChatActionsLocked}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.cards.meditate')}
                  >
                    <Text style={styles.directChatActionCompactEmoji}>☕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          
        </ScrollView>

        {showNewBelowMain && streamingMessageId && !isNearBottomRef.current ? (
          <View
            pointerEvents="none"
            style={[
              styles.newBelowOverlay,
              { bottom: Math.max(inputBarHeight, 0) + 16 },
            ]}
          >
            <MaterialIcons name="south" size={16} color={Colors.textMuted} />
            <Text style={styles.newBelowOverlayText}>
              {i18n.language === 'ru' ? 'Новый текст ниже' : 'New text below'}
            </Text>
          </View>
        ) : null}

        {/* Input Area - fixed at bottom */}
        {showInput && (
          <KeyboardStickyView
            offset={{ closed: -tabBarHeight, opened: 0 }}
            style={[styles.inputContainer, { paddingBottom: 8 }]}
            onLayout={(e) => {
              const h = e?.nativeEvent?.layout?.height ?? 0;
              if (h && Math.abs(h - inputBarHeight) > 2) setInputBarHeight(h);
            }}
          >
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                placeholder={t('chat.input.placeholder')}
                placeholderTextColor={Colors.textMuted}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={10000}
                editable={!isTypingHere}
                contextMenuHidden={false}
                selectionColor={Platform.OS === 'ios' ? '#007AFF' : undefined}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  !canStopGenerating &&
                    (!inputText.trim() || isTypingHere) &&
                    styles.sendButtonDisabled,
                ]}
                onPress={canStopGenerating ? handleStopGenerating : () => handleSend()}
                disabled={canStopGenerating ? false : !inputText.trim() || isTypingHere}
              >
                <LinearGradient
                  colors={
                    canStopGenerating
                      ? [Colors.darkRoast, Colors.mocha]
                      : inputText.trim() && !isTypingHere
                        ? [Colors.mocha, Colors.latte]
                        : [Colors.border, Colors.borderLight]
                  }
                  style={styles.sendButtonGradient}
                >
                  {canStopGenerating ? (
                    <MaterialIcons name="stop" size={18} color={Colors.surface} />
                  ) : (
                    <Text style={styles.sendIcon}>↑</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardStickyView>
        )}
      </View>

        {/* Direct Chat Seed Logging Modal */}
        <Modal
          visible={showDirectChatSeedModal}
          animationType="slide"
          transparent
          onRequestClose={closeDirectChatSeedModal}
        >
          <Pressable style={styles.directChatModalOverlay} onPress={handleDirectChatSeedBackdropPress}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.directChatModalKeyboardAvoid}
              keyboardVerticalOffset={0}
            >
              <Pressable
                onPress={e => e.stopPropagation()}
                style={[
                  styles.directChatModalContainer,
                  { paddingBottom: Spacing.xxl + Math.max(insets.bottom, 0) },
                ]}
              >
              <View style={styles.directChatModalHeader}>
                <Text style={styles.directChatModalTitle}>🌱 {t('chat.seedModal.title')}</Text>
                <TouchableOpacity onPress={closeDirectChatSeedModal}>
                  <Text style={styles.directChatModalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <Text style={styles.directChatModalSubtitle}>
                {t('chat.seedModal.subtitle')}
              </Text>

              {!!currentJourneyTitle && (
                <Text style={styles.directChatModalHint}>
                  {t('chat.seedModal.savingToJourney', { title: currentJourneyTitle })}
                </Text>
              )}
              
              {/* Seed Input */}
              <View style={styles.directChatSeedInputContainer}>
                <TextInput
                  style={styles.directChatSeedInput}
                  placeholder={t('chat.seedModal.actionPlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  value={directChatSeedInput}
                  onChangeText={setDirectChatSeedInput}
                  autoCorrect
                  spellCheck
                  autoCapitalize="sentences"
                  multiline
                  maxLength={200}
                />
                <TouchableOpacity 
                  style={[styles.directChatAddSeedButton, !directChatSeedInput.trim() && styles.directChatAddSeedButtonDisabled]}
                  onPress={handleAddDirectChatSeed}
                  disabled={!directChatSeedInput.trim()}
                >
                  <Text style={styles.directChatAddSeedButtonText}>+ {t('chat.seedModal.addSeed')}</Text>
                </TouchableOpacity>
              </View>
              
              {/* Seeds List */}
              {directChatSeeds.length > 0 && (
                <ScrollView style={styles.directChatSeedsList} keyboardShouldPersistTaps="handled">
                  {directChatSeeds.map((seed, index) => (
                    <View key={seed.id} style={styles.directChatSeedItem}>
                      <Text style={styles.directChatSeedNumber}>{index + 1}.</Text>
                      <Text style={styles.directChatSeedText}>{seed.action}</Text>
                      <TouchableOpacity onPress={() => handleRemoveDirectChatSeed(seed.id)}>
                        <Text style={styles.directChatSeedRemove}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
              
              {/* Save Button */}
              <TouchableOpacity 
                style={[styles.directChatSaveButton, directChatSeeds.length === 0 && styles.directChatSaveButtonDisabled]}
                onPress={handleSaveDirectChatSeeds}
                disabled={directChatSeeds.length === 0}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={directChatSeeds.length > 0 ? [Colors.mocha, Colors.latte] : [Colors.border, Colors.borderLight]}
                  style={styles.directChatSaveGradient}
                >
                  <Text style={styles.directChatSaveText}>
                    {directChatSeeds.length > 0 
                      ? t('chat.seedModal.plantSeeds', { count: directChatSeeds.length })
                      : t('chat.seedModal.addSeedsFirst')}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
              </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
  },
  headerButton: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: Colors.cream, 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  headerButtonText: { fontSize: 18, color: Colors.mocha },
  headerContent: { flex: 1, alignItems: 'center', position: 'relative' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, justifyContent: 'center' },
  headerTitle: { fontFamily: Typography.fontFamilyHeading, fontSize: Typography.fontSizeXL, color: Colors.textPrimary },
  onlineIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.sage },
  headerSubtitle: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeXS, color: Colors.textMuted, marginTop: 2 },
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
  premiumCrownButton: {
    position: 'absolute',
    right: 44,
    top: 0,
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
  divider: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.gold, marginHorizontal: Spacing.md },
  keyboardView: { flex: 1 },
  messagesContainer: { flex: 1 },
  // ChatGPT-like: use more width on mobile, keep roomy margins on web.
  messagesContent: {
    paddingHorizontal: Platform.OS === 'web' ? Spacing.xl : Spacing.sm,
    paddingTop: Spacing.sm,
  },
  dateSeparator: { alignItems: 'center', paddingVertical: Spacing.md },
  dateText: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeXS, color: Colors.textMuted, backgroundColor: Colors.cream, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  // ChatGPT-style layout: user is a compact bubble; assistant is a full-width reading block.
  messageContainer: { flexDirection: 'row', marginBottom: Spacing.xl, width: '100%', alignItems: 'flex-start' },
  welcomeMessageContainer: { marginBottom: Spacing.xs },
  userMessageContainer: { alignSelf: 'flex-end', justifyContent: 'flex-end', maxWidth: '82%' },
  aiMessageContainer: { alignSelf: 'stretch' },
  aiAvatar: {
    width: Platform.OS === 'web' ? 36 : 28,
    height: Platform.OS === 'web' ? 36 : 28,
    borderRadius: Platform.OS === 'web' ? 18 : 14,
    marginRight: Platform.OS === 'web' ? Spacing.sm : Spacing.xs,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  avatarGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarEmoji: { fontSize: 18 },
  messageBubble: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.xl, maxWidth: width * 0.78, position: 'relative' },
  userBubble: { backgroundColor: Colors.userBubble, borderBottomRightRadius: 4 },
  aiBlock: { flex: 1, paddingTop: 2, paddingBottom: 2, paddingRight: Spacing.sm },
  aiCard: {
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.xl,
    borderWidth: 0,
    borderColor: Colors.cream,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl, // room for copy button
    ...Shadows.sm,
  },
  newBelowOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  newBelowOverlayText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 12,
    color: Colors.textMuted,
  },
  // (Removed "jump to bottom" chip; streaming bubble does not auto-scroll.)
  aiSection: {
    paddingVertical: 2,
    marginBottom: Spacing.sm,
  },
  aiSectionDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    opacity: 0.5,
  },
  messageText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  userMessageText: { color: Colors.textOnDark },
  aiMessageText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeLG,
    color: Colors.textPrimary,
    lineHeight: 28,
  },
  /** Read-only TextInput = UITextView-like selection + system Copy / Select All (Cut in composer only). */
  bubbleSelectableInput: {
    width: '100%',
    minHeight: 24,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeMD,
    lineHeight: 24,
    color: Colors.textPrimary,
    ...(Platform.OS === 'android' ? { textAlignVertical: 'top' as const } : {}),
  },
  bubbleSelectableInputUser: {
    fontSize: Typography.fontSizeMD,
    lineHeight: 24,
    color: Colors.textOnDark,
  },
  bubbleSelectableInputAssistant: {
    fontSize: Typography.fontSizeLG,
    lineHeight: 28,
    color: Colors.textPrimary,
  },
  bubbleActions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  copyAction: {
    padding: 6,
    borderRadius: 10,
    opacity: 0.85,
  },
  copyActionFloating: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    padding: 6,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  copyTooltip: {
    position: 'absolute',
    top: -30,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  copyTooltipFloating: {
    position: 'absolute',
    right: 10,
    bottom: 48,
    zIndex: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  copyTooltipText: { fontSize: 12, color: '#fff', fontFamily: Typography.fontFamilyBodyMedium },
  typingContainer: { flexDirection: 'row', alignSelf: 'flex-start', marginBottom: Spacing.md },
  typingBubble: { flexDirection: 'row', backgroundColor: Colors.aiBubble, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.xl, borderBottomLeftRadius: 4, gap: 6 },
  typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textMuted },
  
  // Phase Button Styles
  phaseButtonContainer: { marginVertical: Spacing.lg, gap: Spacing.sm },
  phaseButton: { borderRadius: BorderRadius.lg, overflow: 'hidden', ...Shadows.md },
  phaseButtonSecondary: { ...Shadows.sm },
  phaseButtonGradient: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, alignItems: 'center' },
  phaseButtonText: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeMD, color: Colors.cream },
  phaseButtonTextSecondary: { color: Colors.mocha },
  
  // Mode Selection Card Styles
  modeSelectionContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  modeSelectionTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeLG,
    color: Colors.espresso,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  modeCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.cream,
    ...Shadows.sm,
  },
  modeCardGoal: {
    borderColor: Colors.gold + '40',
    backgroundColor: Colors.gold + '08',
  },
  modeCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeCardEmoji: {
    fontSize: 32,
    marginRight: Spacing.md,
  },
  modeCardTextContainer: {
    flex: 1,
  },
  modeCardTitle: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.espresso,
    marginBottom: 2,
  },
  modeCardSubtitle: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
  },
  
  // Experience Selection Card Styles
  experienceCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginVertical: Spacing.md,
    ...Shadows.md,
  },
  experienceLoadingContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  experienceLoadingEmoji: {
    fontSize: 40,
    marginBottom: Spacing.md,
  },
  experienceLoadingText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeMD,
    color: Colors.textMuted,
  },
  experienceTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeLG,
    color: Colors.espresso,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    lineHeight: 26,
  },
  experienceSubtitle: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  experienceChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  experienceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
    maxWidth: '100%',
    flexShrink: 1,
    ...Shadows.sm,
  },
  experienceChipSelected: {
    backgroundColor: Colors.gold + '20',
    borderColor: Colors.gold,
  },
  experienceChipEmoji: {
    fontSize: 16,
    marginRight: Spacing.xs,
  },
  experienceChipText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  experienceChipTextSelected: {
    fontFamily: Typography.fontFamilyBodyMedium,
    color: Colors.espresso,
  },
  experienceChipCheck: {
    fontSize: 12,
    color: Colors.gold,
    marginLeft: Spacing.xs,
    fontWeight: '700',
  },
  experienceHelperText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  experienceContinueButton: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    ...Shadows.md,
  },
  experienceContinueGradient: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  experienceContinueText: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeMD,
    color: Colors.cream,
  },
  
  // Structured Card Styles
  structuredCard: { marginVertical: Spacing.md, borderRadius: BorderRadius.xl, overflow: 'hidden', ...Shadows.lg },
  
  // Collapsed Card Styles
  collapsedCard: { marginVertical: Spacing.xs, borderRadius: BorderRadius.lg, overflow: 'hidden', ...Shadows.sm },
  collapsedGradient: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: Spacing.md, 
    paddingHorizontal: Spacing.lg 
  },
  collapsedCardLight: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: Spacing.md, 
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.lg,
    marginVertical: Spacing.sm,
  },
  collapsedEmoji: { fontSize: 24, marginRight: Spacing.md },
  collapsedContent: { flex: 1 },
  collapsedTitle: { fontFamily: Typography.fontFamilyHeading, fontSize: Typography.fontSizeMD, color: Colors.cream },
  collapsedTitleDark: { fontFamily: Typography.fontFamilyHeading, fontSize: Typography.fontSizeMD, color: Colors.espresso },
  collapsedHint: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeXS, color: Colors.cream, opacity: 0.8 },
  collapsedHintDark: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeXS, color: Colors.textMuted },
  collapsedExpand: { fontSize: 14, color: Colors.cream, opacity: 0.7 },
  collapsedExpandDark: { fontSize: 14, color: Colors.textMuted },
  
  // Collapse Button Styles (for expanded cards)
  collapseButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  collapseIcon: {
    fontSize: 12,
    color: Colors.cream,
    fontWeight: '600',
  },
  collapseButtonLight: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  collapseIconDark: {
    fontSize: 12,
    color: Colors.espresso,
    fontWeight: '600',
  },
  
  // Aha Moment Styles
  ahaGradient: { padding: Spacing.xl, alignItems: 'center' },
  ahaEmoji: { fontSize: 48, marginBottom: Spacing.md },
  ahaTitle: { fontFamily: Typography.fontFamilyHeading, fontSize: Typography.fontSize2XL, color: Colors.cream, marginBottom: Spacing.sm },
  ahaSubtitle: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeMD, color: Colors.cream, opacity: 0.9, fontStyle: 'italic', marginBottom: Spacing.md, textAlign: 'center' },
  ahaText: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeMD, color: Colors.latte, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.sm },
  ahaComfort: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.cream, opacity: 0.85, marginTop: Spacing.sm, marginBottom: Spacing.lg, textAlign: 'center', lineHeight: 20 },
  ahaDivider: { width: 60, height: 2, backgroundColor: Colors.gold, marginBottom: Spacing.lg },
  ahaHope: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeMD, color: Colors.gold, textAlign: 'center', marginBottom: Spacing.lg },
  ahaButton: { backgroundColor: Colors.gold, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.full },
  ahaButtonText: { fontFamily: Typography.fontFamilyBodyBold, fontSize: Typography.fontSizeMD, color: Colors.espresso },
  
  // Seed Ideas Styles
  // Seed Ideas Card - New User Styles
  seedIdeasContainer: { backgroundColor: Colors.surface, padding: Spacing.lg },
  seedIdeasTitle: { fontFamily: Typography.fontFamilyHeading, fontSize: Typography.fontSizeXL, color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.xs },
  seedIdeasSubtitle: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg, lineHeight: 20 },
  // Reciprocal Law Box - prominently displays the goal-matched principle
  reciprocalLawBox: { backgroundColor: Colors.mocha, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.lg },
  reciprocalLawText: { fontFamily: Typography.fontFamilyBodyBold, fontSize: Typography.fontSizeMD, color: Colors.cream, textAlign: 'center', marginBottom: Spacing.xs },
  reciprocalLawSubtext: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.cream, textAlign: 'center', lineHeight: 20, opacity: 0.9 },
  reciprocalLawHint: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeXS, color: Colors.cream, textAlign: 'center', marginTop: Spacing.xs, opacity: 0.75, fontStyle: 'italic' },
  seedTypesExplanation: { backgroundColor: Colors.latte, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.lg, opacity: 0.9 },
  seedTypesText: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.espresso, lineHeight: 20 },
  seedTypeBold: { fontFamily: Typography.fontFamilyBodyMedium },
  seedTypesHint: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeXS, color: Colors.mocha, marginTop: Spacing.sm, fontStyle: 'italic' },
  seedIdeaItem: { backgroundColor: Colors.cream, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  seedIdeaHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  seedEmoji: { fontSize: 24, marginRight: Spacing.sm },
  seedActionContainer: { flex: 1 },
  seedIdeaAction: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeMD, color: Colors.textPrimary },
  seedTypeTag: { alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full, marginTop: 4 },
  seedTypeOpportunity: { backgroundColor: 'rgba(139, 107, 77, 0.15)' },
  seedTypeQuality: { backgroundColor: 'rgba(212, 165, 116, 0.25)' },
  seedTypeText: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeXS, color: Colors.mocha },
  seedIdeaChain: { marginLeft: 36, paddingLeft: Spacing.md, borderLeftWidth: 2, borderLeftColor: Colors.gold },
  seedChainText: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.textSecondary, marginBottom: 4 },
  seedChainArrow: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeXS, color: Colors.gold, marginVertical: 4 },
  seedHighlight: { color: Colors.mocha, fontFamily: Typography.fontFamilyBodyMedium },
  seedIdeasNote: { backgroundColor: Colors.cream, borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.sm, marginBottom: Spacing.lg },
  seedIdeasNoteText: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.textSecondary, textAlign: 'center' },
  seedIdeasButton: { borderRadius: BorderRadius.lg, overflow: 'hidden', ...Shadows.md },
  seedIdeasButtonGradient: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, alignItems: 'center' },
  seedIdeasButtonText: { fontFamily: Typography.fontFamilyBodyBold, fontSize: Typography.fontSizeMD, color: Colors.cream },
  
  // Seed Ideas Card - Experienced User Styles
  seedIdeasExperienced: { padding: Spacing.lg, borderRadius: BorderRadius.lg },
  seedIdeasExpHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md },
  seedIdeasExpIcon: { fontSize: 32, marginRight: Spacing.md },
  seedIdeasExpTextContainer: { flex: 1 },
  seedIdeasExpTitle: { fontFamily: Typography.fontFamilyHeading, fontSize: Typography.fontSizeXL, color: Colors.espresso },
  seedIdeasExpSubtitle: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.textMuted, lineHeight: 20 },
  seedIdeasExpDivider: { height: 1, backgroundColor: Colors.gold, opacity: 0.3, marginBottom: Spacing.md },
  seedIdeaExpItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  seedIdeaExpAction: { flex: 1, fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeMD, color: Colors.espresso, marginLeft: Spacing.sm },
  seedIdeasExpNote: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.md, marginBottom: Spacing.lg },
  seedIdeasExpButton: { borderRadius: BorderRadius.full, overflow: 'hidden' },
  seedIdeasExpButtonGradient: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, alignItems: 'center' },
  seedIdeasExpButtonText: { fontFamily: Typography.fontFamilyBodyBold, fontSize: Typography.fontSizeMD, color: Colors.cream },
  
  // Go Plant Styles
  // Go Plant Card - New User Styles (rich mocha gradient)
  goPlantGradient: { padding: Spacing.xl, alignItems: 'center', borderRadius: BorderRadius.lg },
  goPlantEmoji: { fontSize: 48, marginBottom: Spacing.md },
  goPlantTitleNew: { fontFamily: Typography.fontFamilyHeading, fontSize: Typography.fontSizeXL, color: Colors.cream, textAlign: 'center', marginBottom: Spacing.md },
  goPlantTextNew: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeMD, color: Colors.cream, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.sm, opacity: 0.95 },
  // Subtle container for hints - lighter on dark gradient
  goPlantHintContainer: { backgroundColor: 'rgba(255, 255, 255, 0.15)', borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, marginVertical: Spacing.md, alignItems: 'center' },
  goPlantHintDivider: { width: 40, height: 1, backgroundColor: Colors.gold, opacity: 0.5, marginVertical: Spacing.sm },
  goPlantHintNew: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeMD, color: Colors.cream, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xs },
  goPlantPastNew: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeMD, color: Colors.gold, textAlign: 'center', lineHeight: 22 },
  goPlantEveningNew: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.cream, textAlign: 'center', opacity: 0.9, marginTop: Spacing.sm },
  goPlantButtonNew: { backgroundColor: Colors.cream, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.full },
  goPlantButtonTextNew: { fontFamily: Typography.fontFamilyBodyBold, fontSize: Typography.fontSizeMD, color: Colors.mocha },
  goPlantHintSmall: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeXS, color: Colors.cream, textAlign: 'center', marginTop: Spacing.md, opacity: 0.8 },
  
  // Catalyst message - visually distinct
  catalystContainer: { 
    backgroundColor: 'rgba(212, 175, 55, 0.25)', 
    borderRadius: BorderRadius.lg, 
    paddingVertical: Spacing.md, 
    paddingHorizontal: Spacing.lg, 
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.4)',
  },
  catalystText: { 
    fontFamily: Typography.fontFamilyBodyMedium, 
    fontSize: Typography.fontSizeMD, 
    color: Colors.cream, 
    textAlign: 'center', 
    lineHeight: 24,
  },
  catalystContainerCompact: { 
    backgroundColor: 'rgba(212, 175, 55, 0.2)', 
    borderRadius: BorderRadius.md, 
    paddingVertical: Spacing.sm, 
    paddingHorizontal: Spacing.md, 
    marginBottom: Spacing.md,
  },
  catalystTextCompact: { 
    fontFamily: Typography.fontFamilyBody, 
    fontSize: Typography.fontSizeSM, 
    color: Colors.gold, 
    textAlign: 'center',
  },
  
  // Go Plant Card - Experienced User Styles
  goPlantExpGradient: { padding: Spacing.xl, alignItems: 'center', borderRadius: BorderRadius.lg },
  goPlantExpEmoji: { fontSize: 40, marginBottom: Spacing.sm },
  goPlantExpTitle: { fontFamily: Typography.fontFamilyHeading, fontSize: Typography.fontSize2XL, color: Colors.cream, marginBottom: Spacing.md },
  goPlantExpHint: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeMD, color: Colors.cream, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xs },
  goPlantExpDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.lg },
  goPlantExpDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.gold },
  goPlantExpLine: { width: 40, height: 1, backgroundColor: Colors.gold, marginHorizontal: Spacing.sm },
  goPlantExpPast: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeSM, color: Colors.gold, textAlign: 'center' },
  goPlantExpButton: { backgroundColor: Colors.cream, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxl, borderRadius: BorderRadius.full },
  goPlantExpButtonText: { fontFamily: Typography.fontFamilyBodyBold, fontSize: Typography.fontSizeMD, color: Colors.mocha },
  goPlantExpHintSingle: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeMD, color: Colors.cream, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.lg, paddingHorizontal: Spacing.md },
  goPlantWaterHint: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.cream, textAlign: 'center', marginTop: Spacing.md, opacity: 0.9 },
  
  // Go Plant - New User simplified styles  
  goPlantHintSingle: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeMD, color: Colors.cream, textAlign: 'center', lineHeight: 24, marginBottom: Spacing.lg, paddingHorizontal: Spacing.md },
  goPlantWaterHintNew: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.cream, textAlign: 'center', marginTop: Spacing.md, opacity: 0.9 },
  
  // Log Seeds Styles
  logSeedsContainer: { backgroundColor: Colors.surface, padding: Spacing.lg },
  logSeedsTitle: { fontFamily: Typography.fontFamilyHeading, fontSize: Typography.fontSizeXL, color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.xs },
  logSeedsSubtitle: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg },
  loggedSeedItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.cream, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  loggedSeedContent: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  loggedSeedNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.sage, fontFamily: Typography.fontFamilyBodyBold, fontSize: Typography.fontSizeSM, color: Colors.surface, textAlign: 'center', lineHeight: 24, marginRight: Spacing.sm },
  loggedSeedText: { flex: 1, fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.textPrimary, lineHeight: 20 },
  removeSeedButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  removeSeedText: { fontSize: 18, color: Colors.textMuted, lineHeight: 20 },
  seedInputContainer: { marginTop: Spacing.sm },
  seedInput: { backgroundColor: Colors.cream, borderRadius: BorderRadius.md, padding: Spacing.md, fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.textPrimary, minHeight: 80, textAlignVertical: 'top' },
  addSeedButton: { backgroundColor: Colors.mocha, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, alignSelf: 'flex-start', marginTop: Spacing.sm },
  addSeedButtonDisabled: { backgroundColor: Colors.border },
  addSeedButtonText: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeSM, color: Colors.cream },
  logSeedsDivider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.lg },
  logSeedsReady: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeMD, color: Colors.sage, textAlign: 'center', marginBottom: Spacing.md },
  startMeditationButton: { borderRadius: BorderRadius.lg, overflow: 'hidden', ...Shadows.md },
  startMeditationGradient: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, alignItems: 'center' },
  startMeditationText: { fontFamily: Typography.fontFamilyBodyBold, fontSize: Typography.fontSizeMD, color: Colors.cream },
  
  // Input & Suggestions
  suggestionsContainer: { marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  // First screen should feel compact so the starters are visible immediately.
  suggestionsContainerInitial: { marginTop: Spacing.sm, paddingTop: 0, borderTopWidth: 0, marginBottom: Spacing.md },
  suggestionsLabel: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeSM, color: Colors.textMuted, marginBottom: Spacing.md, textAlign: 'center' },
  suggestionsLabelInitial: { marginBottom: Spacing.sm },
  suggestionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center' },
  suggestionsCarouselWrap: { position: 'relative' },
  suggestionsRow: { paddingLeft: Spacing.sm, paddingRight: Spacing.sm, paddingBottom: Spacing.xs },
  suggestionChip: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, ...Shadows.sm },
  suggestionChipRow: { marginRight: Spacing.sm },
  suggestionText: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.textSecondary },
  inputContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  inputWrapper: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: Colors.cream, borderRadius: BorderRadius.xl, paddingLeft: Spacing.lg, paddingRight: Spacing.xs, paddingVertical: Spacing.xs, ...Shadows.sm },
  textInput: { flex: 1, fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeMD, color: Colors.textPrimary, maxHeight: 100, paddingVertical: Spacing.sm },
  sendButton: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', marginLeft: Spacing.sm },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sendIcon: { fontSize: 20, color: Colors.surface, fontWeight: 'bold' },
  inputHint: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeXS, color: Colors.textLight, textAlign: 'center', marginTop: Spacing.sm },
  
  // History Drawer Styles
  drawerOverlay: { flex: 1, backgroundColor: 'transparent' },
  drawerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  drawerContainer: { 
    position: 'absolute', 
    left: 0, 
    top: 0, 
    bottom: 0, 
    width: '80%', 
    maxWidth: 320,
    backgroundColor: Colors.surface, 
    ...Shadows.lg,
  },
  drawerHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: Spacing.lg, 
    borderBottomWidth: 1, 
    borderBottomColor: Colors.border,
    paddingTop: 60,
  },
  drawerTitle: { fontFamily: Typography.fontFamilyHeading, fontSize: Typography.fontSizeXL, color: Colors.espresso },
  drawerClose: { fontSize: 24, color: Colors.textMuted },
  newChatButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: Spacing.md, 
    margin: Spacing.md, 
    backgroundColor: Colors.cream, 
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  newChatIcon: { fontSize: 18, color: Colors.mocha },
  newChatText: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeMD, color: Colors.mocha },
  newChatTip: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    marginHorizontal: Spacing.md,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.sm,
  },
  conversationsList: { flex: 1 },
  emptyHistory: { padding: Spacing.xl, alignItems: 'center' },
  emptyHistoryEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyHistoryText: { fontFamily: Typography.fontFamilyHeading, fontSize: Typography.fontSizeLG, color: Colors.textPrimary, marginBottom: Spacing.xs },
  emptyHistoryHint: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.textMuted },
  conversationItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: Spacing.md, 
    marginHorizontal: Spacing.md, 
    marginBottom: Spacing.sm,
    backgroundColor: Colors.background, 
    borderRadius: BorderRadius.lg,
  },
  conversationItemActive: { backgroundColor: Colors.cream, borderWidth: 1, borderColor: Colors.mocha },
  conversationContent: { flex: 1 },
  conversationTitle: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeMD, color: Colors.textPrimary, marginBottom: 4 },
  conversationMeta: { flexDirection: 'row', alignItems: 'center' },
  conversationDate: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeXS, color: Colors.textMuted },
  conversationStatus: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeXS, color: Colors.textMuted, marginLeft: 4 },
  deleteConvoButton: { padding: Spacing.sm },
  deleteConvoIcon: { fontSize: 16 },
  
  // Conversation action buttons (edit, delete)
  convoActionButtons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  convoActionButton: { padding: 8, borderRadius: BorderRadius.sm },
  convoActionIcon: { fontSize: 16 },
  
  // Edit title input
  editTitleInput: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.latte,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginBottom: 4,
  },
  
  // Post-completion Styles
  postCompletionContainer: { marginTop: Spacing.lg, padding: Spacing.lg, backgroundColor: Colors.cream, borderRadius: BorderRadius.xl },
  postCompletionLabel: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeSM, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.md },
  postCompletionButtons: { gap: Spacing.sm },
  postCompletionButton: { borderRadius: BorderRadius.lg, overflow: 'hidden' },
  postCompletionButtonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  postCompletionButtonIcon: { fontSize: 20 },
  postCompletionButtonText: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeMD, color: Colors.cream },
  postCompletionButtonSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border },
  postCompletionButtonTextSecondary: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: Typography.fontSizeMD, color: Colors.mocha },
  
  // Switch mode styles
  switchModeLink: { marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, alignItems: 'center' },
  switchModeContainer: { backgroundColor: Colors.surface, marginHorizontal: Spacing.lg, marginVertical: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  switchModeLinkText: { fontFamily: Typography.fontFamilyBody, fontSize: Typography.fontSizeSM, color: Colors.mocha, textAlign: 'center' },
  
  // Topic Change Prompt styles
  topicChangeContainer: { 
    marginTop: Spacing.lg, 
    padding: Spacing.xl, 
    backgroundColor: Colors.cream, 
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
  },
  topicChangeEmoji: { fontSize: 36, marginBottom: Spacing.md },
  topicChangeTitle: { 
    fontFamily: Typography.fontFamilyHeading, 
    fontSize: Typography.fontSizeXL, 
    color: Colors.mocha, 
    textAlign: 'center', 
    marginBottom: Spacing.sm,
  },
  topicChangeText: { 
    fontFamily: Typography.fontFamilyBody, 
    fontSize: Typography.fontSizeMD, 
    color: Colors.textSecondary, 
    textAlign: 'center', 
    marginBottom: Spacing.sm,
    lineHeight: 22,
  },
  topicChangeQuestion: { 
    fontFamily: Typography.fontFamilyBodyMedium, 
    fontSize: Typography.fontSizeMD, 
    color: Colors.mocha, 
    textAlign: 'center', 
    marginBottom: Spacing.lg,
  },
  topicChangeButtons: { width: '100%', gap: Spacing.sm },
  topicChangeButtonPrimary: { borderRadius: BorderRadius.lg, overflow: 'hidden' },
  topicChangeButtonGradient: { 
    paddingVertical: Spacing.md, 
    paddingHorizontal: Spacing.lg, 
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
  },
  topicChangeButtonTextPrimary: { 
    fontFamily: Typography.fontFamilyBodyBold, 
    fontSize: Typography.fontSizeMD, 
    color: Colors.cream,
  },
  topicChangeButtonSecondary: { 
    paddingVertical: Spacing.md, 
    paddingHorizontal: Spacing.lg, 
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  topicChangeButtonTextSecondary: { 
    fontFamily: Typography.fontFamilyBody, 
    fontSize: Typography.fontSizeMD, 
    color: Colors.textSecondary,
  },
  
  // Direct Chat Mode Styles
  directChatActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  directChatActionsOuter: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  directChatActionsCompactRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  directChatActionsInfoDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  directChatActionCompactButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  directChatActionCompactEmoji: {
    fontSize: 18,
    fontFamily: undefined,
  },
  directChatActionButton: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.md,
  },
  directChatActionButtonDisabled: {
    opacity: 0.9,
  },
  directChatActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    minHeight: 52,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  directChatActionGradientDisabled: {
    borderColor: Colors.border,
  },
  directChatActionSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    minHeight: 52,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
  },
  directChatActionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexShrink: 1,
  },
  directChatActionLabelText: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeMD,
    lineHeight: Typography.fontSizeMD + 2,
    color: Colors.cream,
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
  },
  directChatActionLabelTextSecondary: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    lineHeight: Typography.fontSizeMD + 2,
    color: Colors.mocha,
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
  },
  directChatActionIcon: {
    fontSize: 18,
  },
  directChatActionText: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeMD,
    lineHeight: Typography.fontSizeMD + 2,
    color: Colors.cream,
  },
  directChatActionTextDisabled: {
    color: Colors.mocha,
  },
  directChatActionTextSecondary: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    lineHeight: Typography.fontSizeMD + 2,
    color: Colors.mocha,
  },
  directChatActionEmoji: {
    // Let the platform render emoji with its own font metrics.
    fontFamily: undefined,
  },
  directChatActionButtonHarvested: {
    opacity: 0.7,
  },
  directChatActionHarvested: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.gold,
    borderRadius: BorderRadius.lg,
  },
  directChatActionTextHarvested: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.gold,
  },
  
  // Direct Chat Seed Modal Styles
  directChatModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  directChatModalKeyboardAvoid: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  directChatModalContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    maxHeight: '80%',
  },
  directChatModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  directChatModalTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeXL,
    color: Colors.espresso,
  },
  directChatModalClose: {
    fontSize: 24,
    color: Colors.textMuted,
    padding: Spacing.xs,
  },
  directChatModalSubtitle: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  directChatModalHint: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    marginTop: -Spacing.md,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  directChatSeedInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  directChatSeedInput: {
    flex: 1,
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
    minHeight: 60,
    maxHeight: 100,
    textAlignVertical: 'top',
  },
  directChatAddSeedButton: {
    backgroundColor: Colors.mocha,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  directChatAddSeedButtonDisabled: {
    backgroundColor: Colors.border,
  },
  directChatAddSeedButtonText: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
  },
  directChatSeedsList: {
    maxHeight: 200,
    marginBottom: Spacing.lg,
  },
  directChatSeedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  directChatSeedNumber: {
    width: 24,
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeSM,
    color: Colors.sage,
  },
  directChatSeedText: {
    flex: 1,
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
  },
  directChatSeedRemove: {
    fontSize: 16,
    color: Colors.textMuted,
    padding: Spacing.xs,
  },
  directChatSaveButton: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.md,
  },
  directChatSaveButtonDisabled: {
    opacity: 0.6,
  },
  directChatSaveGradient: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  directChatSaveText: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeMD,
    color: Colors.cream,
  },
});
