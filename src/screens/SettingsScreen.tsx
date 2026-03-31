import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Linking,
  Share,
} from 'react-native';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import * as Clipboard from 'expo-clipboard';
import { showAlert } from '../utils/crossPlatformAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';

import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { changeLanguage, getCurrentLanguage } from '../i18n';
import {
  NotificationSettings,
  getNotificationSettings,
  saveNotificationSettings,
  formatReminderTime,
  sendTestNotification,
  checkNotificationPermissions,
  requestNotificationPermissions,
} from '../services/notificationService';
import { 
  getGardenStats, 
  getMeditationHistory, 
  getStreakData,
  getSoundSettings,
  saveSoundSettings,
  SoundSettings,
  resetGardenAndMeditationDataForCloud,
} from '../services/meditationStorage';
import { clearAllChatData, getConversationCount } from '../services/chatStorage';
import { resetOnboarding } from '../services/onboardingStorage';
import { resetPlanChoiceSeen } from '../services/planChoice';
import { getFirebaseAuth } from '../services/firebase';
import { deleteUser, signOut } from 'firebase/auth';
import Purchases from 'react-native-purchases';
import {
  getDevForceFree,
  getDevForcePremium,
  getEffectivePremiumFlag,
  setDevForceFree,
  setDevForcePremium,
  FREE_CYCLE_DAYS,
  FREE_GARDEN_TICKET_LIMIT,
  FREE_MESSAGE_LIMIT,
  getFreeLimitsSnapshot,
  refreshFreeLimitsFromServer,
} from '../services/subscriptionGate';
import * as Updates from 'expo-updates';
import { refreshRevenueCatCaches } from '../services/revenueCat';
import { resetNotificationPromptForTesting } from '../services/notificationService';
import { isInternalBuild } from '../utils/buildFlags';
import { wipeSeedMindCloudData, wipeSeedMindLocalData } from '../services/accountDeletion';
import { allowEmptyChatSnapshotSyncForMs, syncLocalSnapshotsToCloud } from '../services/cloudSync';

type AppExtra = {
  websiteBaseUrl?: string;
  supportEmail?: string;
  appStoreUrl?: string;
};

const getAppExtra = (): AppExtra => {
  const extra =
    (Constants.expoConfig?.extra as AppExtra | undefined) ??
    // Legacy Expo manifests
    ((Constants as any).manifest?.extra as AppExtra | undefined) ??
    // Some Expo Go/dev-client shapes
    ((Constants as any).manifest2?.extra?.expoClient?.extra as AppExtra | undefined) ??
    {};
  return extra;
};

type SettingsScreenProps = {
  navigation: NativeStackNavigationProp<any>;
};

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const isWeb = Platform.OS === 'web';
  const extra = getAppExtra();
  const showInternalTools = isInternalBuild();
  const websiteBaseUrl =
    typeof extra.websiteBaseUrl === 'string' ? extra.websiteBaseUrl.trim().replace(/\/+$/, '') : '';
  const supportEmail = typeof extra.supportEmail === 'string' ? extra.supportEmail.trim() : '';
  const appStoreUrl = typeof extra.appStoreUrl === 'string' ? extra.appStoreUrl.trim() : '';

  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [soundSettings, setSoundSettings] = useState<SoundSettings | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());
  const [devForcePremium, setDevForcePremiumState] = useState(false);
  const [devForceFree, setDevForceFreeState] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [freeMessagesUsed, setFreeMessagesUsed] = useState<number | null>(null);
  const [debugUid, setDebugUid] = useState<string | null>(null);
  const [debugEmail, setDebugEmail] = useState<string | null>(null);
  const [debugMessagesUsed, setDebugMessagesUsed] = useState<number | null>(null);
  const [debugGardenUsed, setDebugGardenUsed] = useState<number | null>(null);
  const [debugCycleEndAt, setDebugCycleEndAt] = useState<number | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [debugUpdateId, setDebugUpdateId] = useState<string | null>(null);
  const [stats, setStats] = useState({ 
    totalSeeds: 0, 
    currentStreak: 0,
    longestStreak: 0,
    totalMeditations: 0,
    totalConversations: 0,
  });

  useEffect(() => {
    loadSettings();
    loadStats();
    loadSoundSettings();
    refreshPremium();
    refreshUsage();
    if (showInternalTools) {
      getDevForcePremium().then(setDevForcePremiumState).catch(() => {});
      getDevForceFree().then(setDevForceFreeState).catch(() => {});
      refreshAuthDebug().catch(() => {});
      try {
        setDebugUpdateId(String((Updates as any)?.updateId || (Updates as any)?.manifest?.id || '') || null);
      } catch {
        setDebugUpdateId(null);
      }
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener?.('focus', () => {
      refreshPremium();
      refreshUsage();
      if (showInternalTools) {
        getDevForcePremium().then(setDevForcePremiumState).catch(() => {});
        getDevForceFree().then(setDevForceFreeState).catch(() => {});
        refreshAuthDebug().catch(() => {});
      }
    });
    return unsub;
  }, [navigation]);

  const refreshPremium = async () => {
    try {
      const premium = await getEffectivePremiumFlag();
      setIsPremium(premium);
    } catch {
      setIsPremium(false);
    }
  };

  const refreshUsage = async () => {
    try {
      const premium = await getEffectivePremiumFlag();
      if (premium) {
        setFreeMessagesUsed(null);
        return;
      }
      // Prefer server snapshot so UI matches server-enforced limits after reinstall.
      const remote = await refreshFreeLimitsFromServer();
      const snap = remote ?? (await getFreeLimitsSnapshot());
      setFreeMessagesUsed(snap.messagesUsed);

      // Retry briefly on fresh install/login where auth or RevenueCat may not be ready yet.
      // (If remote was missing and local is 0, give it a second to hydrate and try again.)
      const uid = getFirebaseAuth().currentUser?.uid;
      if (!remote && uid && snap.messagesUsed === 0) {
        setTimeout(() => {
          refreshFreeLimitsFromServer()
            .then((s) => {
              if (s) setFreeMessagesUsed(s.messagesUsed);
            })
            .catch(() => {});
        }, 900);
      }
    } catch {
      setFreeMessagesUsed(null);
    }
  };

  const refreshAuthDebug = async () => {
    try {
      const u = getFirebaseAuth().currentUser;
      setDebugUid(u?.uid ?? null);
      setDebugEmail(u?.email?.trim() ?? null);
      const snap = await getFreeLimitsSnapshot();
      setDebugMessagesUsed(snap.messagesUsed);
      setDebugGardenUsed(snap.gardenTicketsUsed);
      setDebugCycleEndAt(snap.cycleEndAt);
    } catch {
      // ignore (best-effort debug UI)
    }
  };

  const handleCopyUid = async () => {
    try {
      if (!debugUid) {
        showAlert('Not available', 'No Firebase UID found. Sign in first.');
        return;
      }
      await Clipboard.setStringAsync(debugUid);
      showAlert('Copied', 'Firebase UID copied.\n\nPaste it into Firestore: users/{uid}');
    } catch {
      showAlert('Error', 'Could not copy UID.');
    }
  };

  // Keep local UI state in sync if language changes elsewhere (or on hydration from storage)
  useEffect(() => {
    const handler = (lng: string) => setCurrentLang(lng);
    i18n.on('languageChanged', handler);
    return () => {
      i18n.off('languageChanged', handler);
    };
  }, [i18n]);

  const handleLanguageChange = async (lang: string) => {
    await changeLanguage(lang);
  };

  const loadSettings = async () => {
    const notifSettings = await getNotificationSettings();
    setSettings(notifSettings);
    const permission = await checkNotificationPermissions();
    setHasPermission(permission);
  };

  const loadSoundSettings = async () => {
    const settings = await getSoundSettings();
    setSoundSettings(settings);
  };

  const handleSoundToggle = async (enabled: boolean) => {
    setSoundSettings(prev => prev ? { ...prev, meditationSoundsEnabled: enabled } : null);
    await saveSoundSettings({ meditationSoundsEnabled: enabled });
  };

  const handleDevForcePremiumToggle = async (enabled: boolean) => {
    setDevForcePremiumState(enabled);
    try {
      if (enabled) {
        setDevForceFreeState(false);
        await setDevForceFree(false);
      }
      await setDevForcePremium(enabled);
      await refreshRevenueCatCaches();
      await refreshPremium();
    } catch {
      // ignore
    }
  };

  const handleDevForceFreeToggle = async (enabled: boolean) => {
    setDevForceFreeState(enabled);
    try {
      if (enabled) {
        setDevForcePremiumState(false);
        await setDevForcePremium(false);
      }
      await setDevForceFree(enabled);
      await refreshRevenueCatCaches();
      await refreshPremium();
    } catch {
      // ignore
    }
  };

  const openWebsitePath = async (path: string) => {
    if (!websiteBaseUrl) {
      showAlert(t('settings.common.comingSoonTitle'), t('settings.common.comingSoonBody'));
      return;
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${websiteBaseUrl}${normalizedPath}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        showAlert(t('settings.common.comingSoonTitle'), t('settings.common.comingSoonBody'));
      }
    } catch {
      showAlert(t('settings.common.comingSoonTitle'), t('settings.common.comingSoonBody'));
    }
  };

  const handleRateApp = async () => {
    try {
      const isAvailable = await StoreReview.isAvailableAsync();
      if (isAvailable) {
        await StoreReview.requestReview();
        return;
      }
    } catch {
      // Fall back to store URL (if configured)
    }

    try {
      if (!appStoreUrl) {
        showAlert(t('settings.common.comingSoonTitle'), t('settings.common.comingSoonBody'));
        return;
      }

      const supported = await Linking.canOpenURL(appStoreUrl);
      if (supported) {
        await Linking.openURL(appStoreUrl);
      } else {
        showAlert(t('settings.common.comingSoonTitle'), t('settings.common.comingSoonBody'));
      }
    } catch (error) {
      showAlert(t('settings.common.comingSoonTitle'), t('settings.common.comingSoonBody'));
    }
  };

  const handleShareApp = async () => {
    try {
      const link = (appStoreUrl || websiteBaseUrl).trim();
      const body = t('settings.share.shareMessage');
      const message = link ? `${body}\n${link}` : body;
      await Share.share({
        message,
        title: t('settings.share.shareTitle'),
      });
    } catch (error) {
      console.log('Error sharing:', error);
    }
  };

  const handleContact = async () => {
    if (supportEmail) {
      try {
        await Linking.openURL(`mailto:${supportEmail}?subject=${encodeURIComponent(t('settings.support.emailSubject'))}`);
        return;
      } catch {
        // Fall through to website support page / coming soon
      }
    }
    await openWebsitePath('/support');
  };

  const handlePrivacyPolicy = () => openWebsitePath('/privacy');
  const handleTermsOfService = () => openWebsitePath('/terms');
  const handleSupportPage = () => openWebsitePath('/support');
  const handleUpgrade = () => navigation.navigate('Paywall', { source: 'settings' });
  const handleViewPlans = () => navigation.navigate('Paywall', { source: 'settings_view_plans' });
  const handleManageSubscription = async () => {
    if (Platform.OS !== 'ios') {
      showAlert('Not available', 'Subscription management is only available on iOS right now.');
      return;
    }
    try {
      await Purchases.showManageSubscriptions();
    } catch {
      showAlert('Not available', 'Could not open Apple subscription management.');
    }
  };

  const handleDevResetPremium = async () => {
    try {
      await setDevForcePremium(false);
      await setDevForceFree(false);
      setDevForcePremiumState(false);
      setDevForceFreeState(false);
      await refreshRevenueCatCaches();
      await refreshPremium();
      showAlert(
        'Reset complete',
        'Premium state has been refreshed.\n\nIf you still appear Premium because your sandbox subscription is active, clear sandbox purchase history in App Store Connect to simulate free again.'
      );
    } catch {
      showAlert('Error', 'Could not reset premium state.');
    }
  };

  const handleDevResetNotificationsPrompt = async () => {
    try {
      await resetNotificationPromptForTesting();
      showAlert(
        'Reset complete',
        Platform.OS === 'ios'
          ? 'SeedMind will try to ask again, but iOS will only show the system prompt once per install.\n\nIf you want to change it now, open iOS Settings → Notifications → SeedMind.'
          : 'Reset complete.'
      );
      if (Platform.OS === 'ios') {
        // Optional convenience: open OS settings to change notification permission.
        Linking.openSettings().catch(() => {});
      }
    } catch {
      showAlert('Error', 'Could not reset notification prompt state.');
    }
  };

  const loadStats = async () => {
    const [gardenStats, meditationHistory, streakData, conversationCount] = await Promise.all([
      getGardenStats(),
      getMeditationHistory(),
      getStreakData(),
      getConversationCount(),
    ]);
    setStats({
      totalSeeds: gardenStats.totalSeeds,
      currentStreak: streakData.currentStreak,
      longestStreak: streakData.longestStreak,
      totalMeditations: meditationHistory.length,
      totalConversations: conversationCount,
    });
  };

  const handleNotificationToggle = async (enabled: boolean) => {
    if (enabled && !hasPermission) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        showAlert(
          t('settings.notifications.permissionRequiredTitle'),
          t('settings.notifications.permissionRequiredBody'),
          [{ text: t('common.ok') }]
        );
        return;
      }
      setHasPermission(true);
    }

    setSettings(prev => prev ? { ...prev, enabled } : null);
    await saveNotificationSettings({ enabled });
  };

  const handleTimeChange = async (event: any, selectedDate?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    
    if (selectedDate && settings) {
      const hour = selectedDate.getHours();
      const minute = selectedDate.getMinutes();
      const newTime = { hour, minute };
      
      setSettings({ ...settings, reminderTime: newTime });
      await saveNotificationSettings({ reminderTime: newTime });
    }
  };

  const handleTestNotification = async () => {
    if (!hasPermission) {
      showAlert(t('settings.notifications.permissionRequiredTitle'), t('settings.notifications.enableFirstBody'));
      return;
    }
    
    await sendTestNotification();
    showAlert(t('settings.notifications.testSentTitle'), t('settings.notifications.testSentBody'));
  };

  const handleClearChatHistory = () => {
    showAlert(
      t('settings.data.clearChatTitle'),
      t('settings.data.clearChatBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.data.clearChatConfirm'),
          style: 'destructive',
          onPress: async () => {
            // Allow syncing an empty chat snapshot so cloud history is cleared too.
            // (This avoids "cleared on this device" but still visible after reinstall.)
            await allowEmptyChatSnapshotSyncForMs().catch(() => {});
            await clearAllChatData();
            // Push immediately so restore can't bring it back later.
            const uid = getFirebaseAuth().currentUser?.uid;
            if (uid) {
              await syncLocalSnapshotsToCloud(uid).catch(() => {});
            }
            await loadStats();
            showAlert(t('settings.data.clearChatSuccessTitle'), t('settings.data.clearChatSuccessBody'));
          },
        },
      ]
    );
  };

  const handleResetData = () => {
    showAlert(
      t('settings.data.resetAllTitle'),
      t('settings.data.resetAllBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.data.resetAllConfirm'),
          style: 'destructive',
          onPress: async () => {
            // Make reset final across devices: write explicit empty/default snapshots,
            // then sync to cloud immediately (instead of removing keys locally only).
            await allowEmptyChatSnapshotSyncForMs().catch(() => {});
            await resetGardenAndMeditationDataForCloud();
            await clearAllChatData();
            const uid = getFirebaseAuth().currentUser?.uid;
            if (uid) {
              await syncLocalSnapshotsToCloud(uid).catch(() => {});
            }
            await loadStats();
            showAlert(t('settings.data.resetAllSuccessTitle'), t('settings.data.resetAllSuccessBody'));
          },
        },
      ]
    );
  };

  const handleReplayOnboarding = () => {
    showAlert(
      t('settings.data.replayOnboardingTitle'),
      t('settings.data.replayOnboardingBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.data.replayOnboardingConfirm'),
          style: 'default',
          onPress: async () => {
            // For internal testing: replay onboarding as a true "fresh user" run.
            // This ensures the app shows Auth after onboarding.
            try {
              await signOut(getFirebaseAuth());
            } catch {
              // ignore
            }
            // Prevent cross-account data leakage when switching users during testing.
            await Promise.all([wipeSeedMindLocalData(), Purchases.logOut().catch(() => {})]);
            await resetOnboarding();
            await resetPlanChoiceSeen();
            // Immediately jump back to the Start screen so you can replay onboarding.
            navigation.reset({ index: 0, routes: [{ name: 'Start' }] });
            showAlert(t('settings.data.replayOnboardingSuccessTitle'), t('settings.data.replayOnboardingSuccessBody'));
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    showAlert(
      t('settings.data.signOutTitle'),
      t('settings.data.signOutBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.data.signOutConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(getFirebaseAuth());
            } catch (e) {
              // Even if sign out fails, route back to Start so the user can continue testing.
              console.log('Sign out error:', e);
            }
            // Clear local cache so signing into a different account can't show the previous user's data.
            await Promise.all([wipeSeedMindLocalData(), Purchases.logOut().catch(() => {})]);
            navigation.reset({ index: 0, routes: [{ name: 'Start' }] });
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    if (isWeb) {
      showAlert(t('settings.common.comingSoonTitle'), t('settings.common.comingSoonBody'));
      return;
    }
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) {
      showAlert(t('settings.data.deleteAccountNotSignedInTitle'), t('settings.data.deleteAccountNotSignedInBody'));
      return;
    }

    showAlert(
      t('settings.data.deleteAccountTitle'),
      t('settings.data.deleteAccountBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.data.deleteAccountConfirm'),
          style: 'destructive',
          onPress: async () => {
            if (isDeletingAccount) return;
            setIsDeletingAccount(true);
            try {
              const uid = user.uid;

              // 1) Wipe cloud data (best-effort) while the user is still authenticated.
              await wipeSeedMindCloudData(uid).catch(() => {});

              // 2) Delete Firebase Auth user (may require recent login).
              await deleteUser(user);

              // 3) Wipe local data and log out of RevenueCat.
              await Promise.all([
                wipeSeedMindLocalData(),
                Purchases.logOut().catch(() => {}),
              ]);

              navigation.reset({ index: 0, routes: [{ name: 'Start' }] });
              showAlert(t('settings.data.deleteAccountSuccessTitle'), t('settings.data.deleteAccountSuccessBody'));
            } catch (e: any) {
              const code = e?.code || '';
              if (String(code).includes('requires-recent-login')) {
                showAlert(
                  t('settings.data.deleteAccountReauthTitle'),
                  t('settings.data.deleteAccountReauthBody'),
                  [
                    {
                      text: t('common.gotIt'),
                      style: 'default',
                      onPress: async () => {
                        try {
                          await signOut(getFirebaseAuth());
                        } catch {
                          // ignore
                        }
                        await wipeSeedMindLocalData();
                        navigation.reset({ index: 0, routes: [{ name: 'Start' }] });
                      },
                    },
                  ]
                );
              } else {
                showAlert(t('settings.data.deleteAccountErrorTitle'), t('settings.data.deleteAccountErrorBody'));
              }
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const getTimePickerDate = () => {
    if (!settings) return new Date();
    const date = new Date();
    date.setHours(settings.reminderTime.hour);
    date.setMinutes(settings.reminderTime.minute);
    return date;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={[Colors.background, Colors.cream]}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('settings.title')}</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Notifications Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.reminders.title')}</Text>
            <Text style={styles.sectionDescription}>
              {t('settings.reminders.description')}
            </Text>

            <View style={styles.card}>
              {/* Enable Toggle */}
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>{t('settings.reminders.enableLabel')}</Text>
                  <Text style={styles.settingHint}>
                    {isWeb
                      ? t('settings.reminders.webUnsupportedHint')
                      : settings?.enabled
                        ? t('settings.reminders.enabledHint')
                        : t('settings.reminders.disabledHint')}
                  </Text>
                </View>
                <Switch
                  value={settings?.enabled ?? false}
                  onValueChange={handleNotificationToggle}
                  disabled={isWeb}
                  trackColor={{ false: Colors.border, true: Colors.sage }}
                  thumbColor={settings?.enabled ? Colors.mocha : Colors.cream}
                  ios_backgroundColor={Colors.border}
                />
              </View>

              {/* Time Picker */}
              {settings?.enabled && !isWeb && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity
                    style={styles.settingRow}
                    onPress={() => setShowTimePicker(true)}
                  >
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>{t('settings.reminders.timeLabel')}</Text>
                      <Text style={styles.settingHint}>
                        {t('settings.reminders.dailyAt', {
                          time:
                            settings &&
                            formatReminderTime(settings.reminderTime.hour, settings.reminderTime.minute),
                        })}
                      </Text>
                    </View>
                    <Text style={styles.timeValue}>
                      {settings && formatReminderTime(
                        settings.reminderTime.hour,
                        settings.reminderTime.minute
                      )}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Test Button (internal builds only) */}
              {showInternalTools && settings?.enabled && !isWeb && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity
                    style={styles.testButton}
                    onPress={handleTestNotification}
                  >
                    <Text style={styles.testButtonText}>
                      {t('settings.reminders.sendTest')}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* Sound Settings Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.sections.sounds')}</Text>
            <Text style={styles.sectionDescription}>
              {t('settings.sounds.meditation')}
            </Text>

            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>{t('settings.sounds.meditation')}</Text>
                  <Text style={styles.settingHint}>
                    {soundSettings?.meditationSoundsEnabled 
                      ? t('settings.sounds.meditationOn')
                      : t('settings.sounds.meditationOff')}
                  </Text>
                </View>
                <Switch
                  value={soundSettings?.meditationSoundsEnabled ?? true}
                  onValueChange={handleSoundToggle}
                  trackColor={{ false: Colors.border, true: Colors.sage }}
                  thumbColor={soundSettings?.meditationSoundsEnabled ? Colors.mocha : Colors.cream}
                  ios_backgroundColor={Colors.border}
                />
              </View>
            </View>
          </View>

          {/* Language Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.sections.language')}</Text>
            <Text style={styles.sectionDescription}>
              {t('settings.language.current')}
            </Text>

            <View style={styles.card}>
              <TouchableOpacity
                style={[
                  styles.languageOption,
                  currentLang === 'en' && styles.languageOptionActive,
                ]}
                onPress={() => handleLanguageChange('en')}
              >
                <Text style={styles.languageFlag}>🇬🇧</Text>
                <Text style={[
                  styles.languageText,
                  currentLang === 'en' && styles.languageTextActive,
                ]}>
                  {t('settings.language.english')}
                </Text>
                {currentLang === 'en' && <Text style={styles.languageCheck}>✓</Text>}
              </TouchableOpacity>
              
              <View style={styles.divider} />
              
              <TouchableOpacity
                style={[
                  styles.languageOption,
                  currentLang === 'ru' && styles.languageOptionActive,
                ]}
                onPress={() => handleLanguageChange('ru')}
              >
                <Text style={styles.languageFlag}>🇷🇺</Text>
                <Text style={[
                  styles.languageText,
                  currentLang === 'ru' && styles.languageTextActive,
                ]}>
                  {t('settings.language.russian')}
                </Text>
                {currentLang === 'ru' && <Text style={styles.languageCheck}>✓</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {/* Account Stats Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.sections.journey')}</Text>
            <Text style={styles.sectionDescription}>
              {t('settings.journey.description')}
            </Text>
            
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statEmoji}>🌱</Text>
                <Text style={styles.statNumber}>{stats.totalSeeds}</Text>
                <Text style={styles.statLabel}>{t('settings.journey.seedsPlanted')}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statEmoji}>☕</Text>
                <Text style={styles.statNumber}>{stats.totalMeditations}</Text>
                <Text style={styles.statLabel}>{t('settings.journey.meditations')}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statEmoji}>🔥</Text>
                <Text style={styles.statNumber}>{stats.currentStreak}</Text>
                <Text style={styles.statLabel}>{t('settings.journey.currentStreak')}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statEmoji}>🏆</Text>
                <Text style={styles.statNumber}>{stats.longestStreak}</Text>
                <Text style={styles.statLabel}>{t('settings.journey.longestStreak')}</Text>
              </View>
            </View>
          </View>

          {/* Premium Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.premium.title')}</Text>
            <Text style={styles.sectionDescription}>
              {isPremium ? t('settings.premium.descriptionActive') : t('settings.premium.descriptionInactive')}
            </Text>

            <View style={styles.premiumCard}>
              <View style={styles.premiumCardTop}>
                <Text style={styles.premiumCardIcon}>👑</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.premiumCardTitle}>
                    {isPremium ? t('settings.premium.labelActive') : t('settings.premium.labelInactive')}
                  </Text>
                  {isPremium ? (
                    <Text style={styles.premiumCardHint}>{t('chat.usage.unlimitedMessages')}</Text>
                  ) : freeMessagesUsed !== null ? (
                    <Text style={styles.premiumCardHint}>
                      {t('chat.usage.messagesUsed', { used: freeMessagesUsed, limit: FREE_MESSAGE_LIMIT })}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.premiumActionsRow}>
                {!isPremium ? (
                  <TouchableOpacity style={styles.premiumPrimary} onPress={handleUpgrade} activeOpacity={0.9}>
                    <Text style={styles.premiumPrimaryText}>{t('settings.premium.upgrade')}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.premiumPrimary} onPress={handleManageSubscription} activeOpacity={0.9}>
                    <Text style={styles.premiumPrimaryText}>{t('settings.premium.manage')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.premiumSecondary} onPress={handleViewPlans} activeOpacity={0.9}>
                  <Text style={styles.premiumSecondaryText}>{t('settings.premium.viewPlans')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Support Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.sections.support')}</Text>
            <Text style={styles.sectionDescription}>
              {t('settings.support.description')}
            </Text>

            <View style={styles.card}>
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => showAlert(
                  t('settings.support.howItWorksTitle'),
                  t('settings.support.howItWorksBody'),
                  [{ text: t('common.gotIt') }]
                )}
              >
                <Text style={styles.linkText}>{t('settings.support.howItWorksLabel')}</Text>
                <Text style={styles.linkArrow}>→</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => showAlert(
                  t('settings.support.faqTitle'),
                  t('settings.support.faqBody'),
                  [{ text: t('settings.support.thanksButton') }]
                )}
              >
                <Text style={styles.linkText}>{t('settings.support.faqLabel')}</Text>
                <Text style={styles.linkArrow}>→</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.linkRow}
                onPress={handleContact}
              >
                <Text style={styles.linkText}>{t('settings.support.contactLabel')}</Text>
                <Text style={styles.linkArrow}>→</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Spread the Word Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.sections.share')}</Text>
            <Text style={styles.sectionDescription}>
              {t('settings.share.description')}
            </Text>

            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleRateApp}
              >
                <Text style={styles.actionButtonEmoji}>⭐</Text>
                <Text style={styles.actionButtonLabel}>{t('settings.share.rate')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleShareApp}
              >
                <Text style={styles.actionButtonEmoji}>📤</Text>
                <Text style={styles.actionButtonLabel}>{t('settings.share.share')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Legal Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.sections.legal')}</Text>

            <View style={styles.card}>
              <TouchableOpacity
                style={styles.linkRow}
                onPress={handlePrivacyPolicy}
              >
                <Text style={styles.linkText}>{t('settings.legal.privacyLabel')}</Text>
                <Text style={styles.linkArrow}>→</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.linkRow}
                onPress={handleTermsOfService}
              >
                <Text style={styles.linkText}>{t('settings.legal.termsLabel')}</Text>
                <Text style={styles.linkArrow}>→</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.linkRow}
                onPress={handleSupportPage}
              >
                <Text style={styles.linkText}>{t('settings.legal.supportLabel')}</Text>
                <Text style={styles.linkArrow}>→</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* About Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.about.title')}</Text>
            
            <View style={styles.card}>
              <Text style={styles.aboutText}>
                {t('settings.about.body')}
              </Text>
              <Text style={styles.versionText}>{t('settings.about.version', { version: '1.0.0' })}</Text>
            </View>
          </View>

          {/* Developer Testing (internal builds only) */}
          {showInternalTools && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('settings.developer.title')}</Text>
              <Text style={styles.sectionDescription}>
                {t('settings.developer.description')}
              </Text>

              <View style={styles.card}>
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>Auth Debug</Text>
                    <Text style={styles.settingHint}>Email: {debugEmail || '—'}</Text>
                    <Text style={styles.settingHint}>UID: {debugUid || '—'}</Text>
                    <Text style={styles.settingHint}>Update ID: {debugUpdateId || '—'}</Text>
                    <Text style={styles.settingHint}>
                      Local free usage: {typeof debugMessagesUsed === 'number' ? debugMessagesUsed : '—'}/{FREE_MESSAGE_LIMIT}{' '}
                      messages, {typeof debugGardenUsed === 'number' ? debugGardenUsed : '—'}/{FREE_GARDEN_TICKET_LIMIT} journeys
                    </Text>
                    {typeof debugCycleEndAt === 'number' ? (
                      <Text style={styles.settingHint}>Cycle ends: {new Date(debugCycleEndAt).toLocaleString()}</Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.divider} />

                <TouchableOpacity style={styles.secondaryButton} onPress={refreshAuthDebug}>
                  <Text style={styles.secondaryButtonText}>Refresh Auth Debug</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity style={styles.secondaryButton} onPress={handleCopyUid}>
                  <Text style={styles.secondaryButtonText}>Copy Firebase UID</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>{t('settings.developer.forcePremiumLabel')}</Text>
                    <Text style={styles.settingHint}>
                      {t('settings.developer.forcePremiumHint')}
                    </Text>
                  </View>
                  <Switch
                    value={devForcePremium}
                    onValueChange={handleDevForcePremiumToggle}
                    trackColor={{ false: Colors.border, true: Colors.sage }}
                    thumbColor={devForcePremium ? Colors.mocha : Colors.cream}
                    ios_backgroundColor={Colors.border}
                  />
                </View>

                <View style={styles.divider} />

                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>{t('settings.developer.forceFreeLabel')}</Text>
                    <Text style={styles.settingHint}>
                      {t('settings.developer.forceFreeHint')}
                    </Text>
                  </View>
                  <Switch
                    value={devForceFree}
                    onValueChange={handleDevForceFreeToggle}
                    trackColor={{ false: Colors.border, true: Colors.sage }}
                    thumbColor={devForceFree ? Colors.mocha : Colors.cream}
                    ios_backgroundColor={Colors.border}
                  />
                </View>

                <View style={styles.divider} />

                <TouchableOpacity style={styles.secondaryButton} onPress={handleDevResetPremium}>
                  <Text style={styles.secondaryButtonText}>{t('settings.developer.resetPremiumState')}</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity style={styles.secondaryButton} onPress={handleDevResetNotificationsPrompt}>
                  <Text style={styles.secondaryButtonText}>Reset Notification Prompt (Testing)</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity style={styles.secondaryButton} onPress={handleReplayOnboarding}>
                  <Text style={styles.secondaryButtonText}>{t('settings.data.replayOnboardingLabel')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Data Management */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.sections.data')}</Text>
            <Text style={styles.sectionDescription}>
              {t('settings.data.conversationsSaved', { count: stats.totalConversations })}
            </Text>

            {(() => {
              const u = getFirebaseAuth().currentUser;
              const email = u?.email?.trim();
              if (!email) return null;
              const providerIds = Array.isArray(u?.providerData) ? u!.providerData.map((p) => p?.providerId).filter(Boolean) : [];
              const isApple = providerIds.includes('apple.com');
              const isRelay = email.toLowerCase().endsWith('@privaterelay.appleid.com');
              const title = isApple
                ? t('settings.data.signedInWithApple', { defaultValue: 'Signed in with Apple' })
                : t('settings.data.signedInAs', { defaultValue: 'Signed in as' });
              return (
                <View style={[styles.card, { marginTop: Spacing.sm, marginBottom: Spacing.sm }]}>
                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>{title}</Text>
                      <Text style={styles.settingHint}>{email}</Text>
                      {isApple && isRelay ? (
                        <Text style={[styles.settingHint, { marginTop: 4 }]}>
                          {t('settings.data.appleRelayHint', {
                            defaultValue:
                              'This is an Apple relay email (“Hide My Email”) that forwards to your Apple ID inbox.',
                          })}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })()}

            <TouchableOpacity
              style={[styles.warningButton, { marginBottom: Spacing.sm }]}
              onPress={handleSignOut}
            >
              <Text style={styles.warningButtonText}>{t('settings.data.signOutLabel')}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.warningButton, { marginTop: Spacing.sm }]}
              onPress={handleClearChatHistory}
            >
              <Text style={styles.warningButtonText}>{t('settings.data.clearChatLabel')}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.dangerButton, { marginTop: Spacing.sm }]}
              onPress={handleResetData}
            >
              <Text style={styles.dangerButtonText}>{t('settings.data.resetAllLabel')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dangerButton, { marginTop: Spacing.sm, opacity: isDeletingAccount ? 0.7 : 1 }]}
              onPress={handleDeleteAccount}
              disabled={isDeletingAccount}
            >
              <Text style={styles.dangerButtonText}>
                {isDeletingAccount ? t('settings.data.deleteAccountDeleting') : t('settings.data.deleteAccountLabel')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>

        {/* Time Picker Modal */}
        {showTimePicker && (
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={styles.pickerDone}>{t('common.done')}</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={getTimePickerDate()}
              mode="time"
              is24Hour={false}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleTimeChange}
              style={styles.timePicker}
            />
          </View>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: Colors.mocha,
  },
  title: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSize2XL,
    color: Colors.espresso,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeXL,
    color: Colors.espresso,
    marginBottom: Spacing.xs,
  },
  sectionDescription: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  settingInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingLabel: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.espresso,
    marginBottom: 2,
  },
  settingHint: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
  },
  settingHintSubtle: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textMuted,
    marginTop: 6,
  },
  timeValue: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.mocha,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: Spacing.sm,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  languageOptionActive: {
    backgroundColor: Colors.latte + '30',
  },
  languageFlag: {
    fontSize: 24,
    marginRight: Spacing.md,
  },
  languageText: {
    flex: 1,
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.espresso,
  },
  languageTextActive: {
    color: Colors.mocha,
  },
  languageCheck: {
    fontSize: 18,
    color: Colors.mocha,
    fontWeight: '600',
  },
  styleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  styleOptionSelected: {
    backgroundColor: Colors.latte + '30',
  },
  styleOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  styleOptionEmoji: {
    fontSize: 24,
    marginRight: Spacing.md,
  },
  styleOptionText: {
    flex: 1,
  },
  styleOptionTitle: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.espresso,
    marginBottom: 2,
  },
  styleOptionTitleSelected: {
    color: Colors.mocha,
  },
  styleOptionHint: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
  },
  styleCheckmark: {
    fontSize: 18,
    color: Colors.mocha,
    fontWeight: '600',
  },
  testButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  testButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.mocha,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  statCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.sm,
  },
  statEmoji: {
    fontSize: 24,
    marginBottom: Spacing.xs,
  },
  statNumber: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSize2XL,
    color: Colors.mocha,
  },
  statLabel: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  aboutText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeMD,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: Spacing.md,
  },
  versionText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  linkText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.espresso,
  },
  linkArrow: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeLG,
    color: Colors.textMuted,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  actionButtonEmoji: {
    fontSize: 28,
    marginBottom: Spacing.xs,
  },
  actionButtonLabel: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.espresso,
  },
  premiumActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  premiumCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.sm,
  },
  premiumCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  premiumCardIcon: {
    fontSize: 22,
  },
  premiumCardTitle: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.espresso,
  },
  premiumCardHint: {
    marginTop: 4,
    fontFamily: Typography.fontFamilyBody,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textMuted,
  },
  premiumActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'space-between',
  },
  premiumPrimary: {
    flex: 1,
    backgroundColor: Colors.mocha,
    borderRadius: BorderRadius.full,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  premiumPrimaryText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
  },
  premiumSecondary: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  premiumSecondaryText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
  },
  pillButtonPrimary: {
    backgroundColor: Colors.mocha,
    borderRadius: BorderRadius.full,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  pillButtonPrimaryText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.cream,
  },
  pillButtonSecondary: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  pillButtonSecondaryText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
  },
  secondaryButton: {
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  secondaryButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.mocha,
  },
  warningButton: {
    backgroundColor: '#FEF3C7',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  warningButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: '#92400E',
  },
  dangerButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  dangerButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: '#DC2626',
  },
  bottomPadding: {
    height: 100,
  },
  pickerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    ...Shadows.lg,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  pickerDone: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.mocha,
  },
  timePicker: {
    height: 200,
  },
});

