import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import i18n from '../i18n';
import { 
  getStreakData, 
  getPendingMeditation,
  checkSeedMilestones,
  markFirstSeedlingNotified,
  markSeedsBloomNotified,
  SeedMilestones,
  GardenSeed,
} from './meditationStorage';

// ===================
// STORAGE KEYS
// ===================

const NOTIFICATION_KEYS = {
  SETTINGS: 'seedmind_notification_settings',
  LAST_NOTIFICATION: 'seedmind_last_notification',
  PROMPTED: 'seedmind_notification_prompted_v1',
};

// ===================
// TYPES
// ===================

export interface NotificationSettings {
  enabled: boolean;
  reminderTime: { hour: number; minute: number };
  lastMessageIndex: number;
}

// ===================
// NOTIFICATION MESSAGES
// ===================

// Message types with weights (higher = more frequent)
interface NotificationMessage {
  title: string;
  body: string;
  type: 'ritual' | 'streak' | 'gentle' | 'growth' | 'past_seeds' | 'streak_at_risk' | 'seeds_pending';
}

const getNotifLng = (): 'en' | 'ru' => (i18n.language === 'ru' ? 'ru' : 'en');
const tN = (key: string, opts?: Record<string, any>) => i18n.t(key, { ...(opts || {}), lng: getNotifLng() });

// Get streak-at-risk messages (when user has a streak to protect)
const getStreakAtRiskMessages = (streakDays: number): NotificationMessage[] => [
  {
    title: tN('notifications.streakAtRisk.title1', { count: streakDays }),
    body: tN('notifications.streakAtRisk.body1'),
    type: 'streak_at_risk',
  },
  {
    title: tN('notifications.streakAtRisk.title2', { count: streakDays }),
    body: tN('notifications.streakAtRisk.body2', { nextDay: streakDays + 1 }),
    type: 'streak_at_risk',
  },
];

// Get seeds-pending messages (when user planted seeds but hasn't meditated)
const getSeedsPendingMessages = (seedCount: number): NotificationMessage[] => [
  {
    title: tN('notifications.seedsPending.title1'),
    body: tN('notifications.seedsPending.body1', { count: seedCount }),
    type: 'seeds_pending',
  },
  {
    title: tN('notifications.seedsPending.title2'),
    body: tN('notifications.seedsPending.body2', { count: seedCount }),
    type: 'seeds_pending',
  },
];

const getNotificationMessages = (streakDays: number): NotificationMessage[] => {
  const messages: NotificationMessage[] = [
    // Ritual reminders (40%)
    {
      title: tN('notifications.ritual.title1'),
      body: tN('notifications.ritual.body1'),
      type: 'ritual',
    },
    {
      title: tN('notifications.ritual.title2'),
      body: tN('notifications.ritual.body2'),
      type: 'ritual',
    },
    {
      title: tN('notifications.ritual.title3'),
      body: tN('notifications.ritual.body3'),
      type: 'ritual',
    },
    {
      title: tN('notifications.ritual.title4'),
      body: tN('notifications.ritual.body4'),
      type: 'ritual',
    },
    
    // Streak motivators (25%)
    {
      title: streakDays > 0
        ? tN('notifications.streak.titleNextDay', { day: streakDays + 1 })
        : tN('notifications.streak.titleStart'),
      body: streakDays > 0
        ? tN('notifications.streak.bodyKeepAlive', { count: streakDays })
        : tN('notifications.streak.bodyBegin'),
      type: 'streak',
    },
    {
      title: streakDays >= 7 ? tN('notifications.streak.titleIncredible') : tN('notifications.streak.titleMomentum'),
      body: streakDays >= 7
        ? tN('notifications.streak.bodyIncredible', { count: streakDays })
        : tN('notifications.streak.bodyMomentum'),
      type: 'streak',
    },
    
    // Gentle encouragement (20%)
    {
      title: tN('notifications.gentle.title1'),
      body: tN('notifications.gentle.body1'),
      type: 'gentle',
    },
    {
      title: tN('notifications.gentle.title2'),
      body: tN('notifications.gentle.body2'),
      type: 'gentle',
    },
    
    // Growth focus (10%)
    {
      title: tN('notifications.growth.title1'),
      body: tN('notifications.growth.body1'),
      type: 'growth',
    },
    {
      title: tN('notifications.growth.title2'),
      body: tN('notifications.growth.body2'),
      type: 'growth',
    },
    
    // Past seeds reminder (5%) - subtle, not frequent
    {
      title: tN('notifications.pastSeeds.title1'),
      body: tN('notifications.pastSeeds.body1'),
      type: 'past_seeds',
    },
  ];
  
  return messages;
};

// Format bloom celebration message
const formatBloomMessage = (seeds: GardenSeed[]): string => {
  if (seeds.length === 0) return '';
  
  if (seeds.length === 1) {
    // Use the problem title for a personal touch
    const locale = getNotifLng();
    const seedName =
      seeds[0].problemTitleByLocale?.[locale] ||
      seeds[0].problemTitle ||
      tN('notifications.bloom.fallbackTitle');
    return tN('notifications.bloom.single', { title: seedName });
  } else {
    return tN('notifications.bloom.multi', { count: seeds.length });
  }
};

// Get a smart, context-aware message (with milestone celebrations)
const getSmartMessage = async (): Promise<NotificationMessage> => {
  const streakData = await getStreakData();
  const pendingMeditation = await getPendingMeditation();
  const milestones = await checkSeedMilestones();
  
  // Get the base message
  let baseMessage: NotificationMessage;
  
  // Priority 1: Seeds pending (user planted seeds today but hasn't meditated)
  if (pendingMeditation && !pendingMeditation.completed) {
    const seedCount = pendingMeditation.seeds.length;
    const seedsPendingMessages = getSeedsPendingMessages(seedCount);
    
    // If they also have a streak, 50% chance to use streak-at-risk message instead
    if (streakData.currentStreak >= 3 && Math.random() < 0.5) {
      const streakMessages = getStreakAtRiskMessages(streakData.currentStreak);
      baseMessage = streakMessages[Math.floor(Math.random() * streakMessages.length)];
    } else {
      baseMessage = seedsPendingMessages[Math.floor(Math.random() * seedsPendingMessages.length)];
    }
  }
  // Priority 2: Streak at risk (user has a good streak going)
  else if (streakData.currentStreak >= 5 && Math.random() < 0.4) {
      const streakMessages = getStreakAtRiskMessages(streakData.currentStreak);
    baseMessage = streakMessages[Math.floor(Math.random() * streakMessages.length)];
  }
  // Default: Use weighted random from general messages
  else {
    baseMessage = getWeightedRandomMessage(streakData.currentStreak);
  }
  
  // Check for first seedling ever (one-time special notification)
  if (milestones.isFirstSeedlingEver) {
    // Mark as notified
    await markFirstSeedlingNotified();
    
    // Return the special first seedling message
    return {
      title: tN('notifications.milestones.firstSeedlingTitle'),
      body: tN('notifications.milestones.firstSeedlingBody'),
      type: 'growth',
    };
  }
  
  // Check for newly bloomed seeds
  if (milestones.newlyBloomedSeeds.length > 0) {
    // Mark these seeds as notified
    await markSeedsBloomNotified(milestones.newlyBloomedSeeds.map(s => s.id));
    
    // Append bloom celebration to base message body
    const bloomMessage = formatBloomMessage(milestones.newlyBloomedSeeds);
    return {
      ...baseMessage,
      body: `${baseMessage.body} ${bloomMessage}`,
    };
  }
  
  return baseMessage;
};

// Get a weighted random message (fallback)
const getWeightedRandomMessage = (streakDays: number): NotificationMessage => {
  const messages = getNotificationMessages(streakDays);
  
  // Weight distribution
  const weights: Record<string, number> = {
    ritual: 40,
    streak: 25,
    gentle: 20,
    growth: 10,
    past_seeds: 5,
  };
  
  // Create weighted pool
  const weightedPool: NotificationMessage[] = [];
  messages.forEach(msg => {
    const weight = weights[msg.type] || 10;
    for (let i = 0; i < weight; i++) {
      weightedPool.push(msg);
    }
  });
  
  // Random selection
  const randomIndex = Math.floor(Math.random() * weightedPool.length);
  return weightedPool[randomIndex];
};

// ===================
// CONFIGURATION
// ===================

// Configure how notifications appear
export const configureNotifications = () => {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};

// ===================
// PERMISSIONS
// ===================

export const requestNotificationPermissions = async (): Promise<boolean> => {
  try {
    if (Platform.OS === 'web') {
      // Web push/local scheduling isn't supported in this app (no service worker / backend).
      return false;
    }
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Notification permissions not granted');
      return false;
    }
    
    // For Android, create notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('daily-reminder', {
        name: tN('notifications.channelName'),
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#8B6B4D',
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
};

export const checkNotificationPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'web') return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
};

export const hasPromptedForNotifications = async (): Promise<boolean> => {
  try {
    const v = await AsyncStorage.getItem(NOTIFICATION_KEYS.PROMPTED);
    return v === '1';
  } catch {
    return false;
  }
};

export const markPromptedForNotifications = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(NOTIFICATION_KEYS.PROMPTED, '1');
  } catch {
    // ignore
  }
};

export const resetNotificationPromptForTesting = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(NOTIFICATION_KEYS.PROMPTED);
  } catch {
    // ignore
  }
};

/**
 * Ask for notification permission once, right after authentication.
 * Uses the real OS prompt (no custom UI).
 */
export const maybeRequestNotificationsAfterAuth = async (): Promise<boolean> => {
  try {
    if (Platform.OS === 'web') return false;

    const alreadyPrompted = await hasPromptedForNotifications();
    // If we already prompted before, DO NOT early-return.
    // We still need to ensure reminders are scheduled (users can toggle permissions in iOS Settings,
    // or scheduled reminders can be cleared by the OS).
    if (alreadyPrompted) {
      const granted = await checkNotificationPermissions();
      if (granted) {
        const settings = await getNotificationSettings();
        if (settings.enabled) {
          await scheduleDailyReminder(settings.reminderTime);
        }
        registerNotificationLanguageListener();
      }
      return granted;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let granted = existingStatus === 'granted';
    if (!granted) {
      granted = await requestNotificationPermissions();
    }

    await markPromptedForNotifications();
    await saveNotificationSettings({ enabled: granted });
    if (granted) {
      const settings = await getNotificationSettings();
      if (settings.enabled) {
        await scheduleDailyReminder(settings.reminderTime);
      }
      registerNotificationLanguageListener();
    }
    return granted;
  } catch {
    try {
      await markPromptedForNotifications();
    } catch {}
    return false;
  }
};

// ===================
// SETTINGS MANAGEMENT
// ===================

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  reminderTime: { hour: 20, minute: 0 }, // 8:00 PM default
  lastMessageIndex: 0,
};

export const getNotificationSettings = async (): Promise<NotificationSettings> => {
  try {
    const data = await AsyncStorage.getItem(NOTIFICATION_KEYS.SETTINGS);
    if (data) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return DEFAULT_SETTINGS;
  }
};

export const saveNotificationSettings = async (
  settings: Partial<NotificationSettings>
): Promise<void> => {
  try {
    const currentSettings = await getNotificationSettings();
    const newSettings = { ...currentSettings, ...settings };
    await AsyncStorage.setItem(
      NOTIFICATION_KEYS.SETTINGS,
      JSON.stringify(newSettings)
    );
    
    // Reschedule notifications if enabled setting or time changed
    if (newSettings.enabled) {
      await scheduleDailyReminder(newSettings.reminderTime);
    } else {
      await cancelAllNotifications();
    }
  } catch (error) {
    console.error('Error saving notification settings:', error);
  }
};

// ===================
// SCHEDULING
// ===================

export const scheduleDailyReminder = async (
  time: { hour: number; minute: number } = { hour: 20, minute: 0 }
): Promise<string | null> => {
  try {
    if (Platform.OS === 'web') return null;
    // Cancel existing reminders first
    await cancelAllNotifications();
    
    // Get a smart, context-aware message (includes milestone celebrations)
    const message = await getSmartMessage();
    
    // Calculate next trigger time
    const now = new Date();
    const trigger = new Date();
    trigger.setHours(time.hour, time.minute, 0, 0);
    
    // If the time has already passed today, schedule for tomorrow
    if (trigger <= now) {
      trigger.setDate(trigger.getDate() + 1);
    }
    
    // Schedule the notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: message.title,
        body: message.body,
        data: { type: 'daily_reminder' },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute,
      },
    });
    
    console.log('Scheduled daily reminder:', notificationId);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling daily reminder:', error);
    return null;
  }
};

// Keep old function name for backward compatibility
export const scheduleEveningReminder = scheduleDailyReminder;

export const cancelAllNotifications = async (): Promise<void> => {
  try {
    if (Platform.OS === 'web') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('Cancelled all notifications');
  } catch (error) {
    console.error('Error cancelling notifications:', error);
  }
};

export const getScheduledNotifications = async () => {
  return await Notifications.getAllScheduledNotificationsAsync();
};

// ===================
// INITIALIZATION
// ===================

export const initializeNotifications = async (): Promise<boolean> => {
  try {
    // Configure notification handling
    configureNotifications();
    
    // Do NOT request permissions here — we only prompt right after auth.
    const hasPermission = await checkNotificationPermissions();
    
    if (hasPermission) {
      // Get current settings
      const settings = await getNotificationSettings();
      
      // Schedule if enabled
      if (settings.enabled) {
        await scheduleDailyReminder(settings.reminderTime);
      }

      // Re-schedule when the app language changes so future notifications match the current locale.
      registerNotificationLanguageListener();
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error initializing notifications:', error);
    return false;
  }
};

let languageListenerRegistered = false;
const registerNotificationLanguageListener = () => {
  if (languageListenerRegistered) return;
  languageListenerRegistered = true;

  i18n.on('languageChanged', async () => {
    try {
      // Update Android channel display name (shows in OS settings)
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('daily-reminder', {
          name: tN('notifications.channelName'),
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#8B6B4D',
        });
      }

      const settings = await getNotificationSettings();
      if (settings.enabled) {
        await scheduleDailyReminder(settings.reminderTime);
      }
    } catch (e) {
      console.warn('[notifications] Failed to reschedule on language change:', e);
    }
  });
};

// ===================
// NOTIFICATION LISTENERS
// ===================

// Call this in App.tsx to set up listeners
export const setupNotificationListeners = (
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) => {
  // When notification is received while app is foregrounded
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    notification => {
      console.log('Notification received:', notification);
      onNotificationReceived?.(notification);
    }
  );
  
  // When user taps on notification
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    response => {
      console.log('Notification response:', response);
      onNotificationResponse?.(response);
    }
  );
  
  // Return cleanup function
  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
};

// ===================
// UTILITY
// ===================

// Format time for display
export const formatReminderTime = (hour: number, minute: number): string => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const displayMinute = minute.toString().padStart(2, '0');
  return `${displayHour}:${displayMinute} ${period}`;
};

// Send immediate test notification
export const sendTestNotification = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  const message = await getSmartMessage();
  
  await Notifications.scheduleNotificationAsync({
    content: {
      title: message.title,
      body: message.body,
      data: { type: 'test' },
      sound: true,
    },
    trigger: null, // Immediate
  });
};

