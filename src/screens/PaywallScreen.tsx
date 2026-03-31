import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import Purchases, { PurchasesPackage, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { useTranslation } from 'react-i18next';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import {
  applyCustomerInfoFromSdk,
  getCurrentOffering,
  getRevenueCatEntitlementId,
  isRevenueCatPremium,
  refreshRevenueCatCaches,
} from '../services/revenueCat';
import { showAlert } from '../utils/crossPlatformAlert';
import { markPlanChoiceSeen } from '../services/planChoice';
import { FREE_CYCLE_DAYS, FREE_GARDEN_TICKET_LIMIT, FREE_MESSAGE_LIMIT } from '../services/subscriptionGate';
import { getEffectivePremiumFlag } from '../services/subscriptionGate';
import { getFirebaseAuth } from '../services/firebase';

type Props = {
  navigation: any;
  route?: any;
};

const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

type AppExtra = { websiteBaseUrl?: string };

const getAppExtra = (): AppExtra => {
  const extra =
    (Constants.expoConfig?.extra as AppExtra | undefined) ??
    ((Constants as any).manifest?.extra as AppExtra | undefined) ??
    ((Constants as any).manifest2?.extra?.expoClient?.extra as AppExtra | undefined) ??
    {};
  return extra;
};

type PaywallLegalComplianceProps = {
  t: (k: string, opts?: any) => string;
  planTermLabel: string;
  priceString: string;
  websiteBaseUrl: string;
};

function PaywallLegalCompliance({ t, planTermLabel, priceString, websiteBaseUrl }: PaywallLegalComplianceProps) {
  const openPrivacy = async () => {
    if (!websiteBaseUrl) {
      showAlert(t('settings.common.comingSoonTitle'), t('settings.common.comingSoonBody'));
      return;
    }
    const url = `${websiteBaseUrl}/privacy`;
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

  const openTerms = async () => {
    try {
      const supported = await Linking.canOpenURL(APPLE_EULA_URL);
      if (supported) {
        await Linking.openURL(APPLE_EULA_URL);
      }
    } catch {
      // ignore
    }
  };

  const price = (priceString || '').trim();

  return (
    <View style={styles.complianceBlock}>
      <Text style={styles.complianceText}>{t('paywall.compliance.lead', { title: t('paywall.title') })}</Text>
      <Text style={styles.complianceText}>
        {price
          ? t('paywall.compliance.termPrice', { term: planTermLabel, price })
          : t('paywall.compliance.termFallback', { term: planTermLabel })}
      </Text>
      <View style={styles.legalLinksRow}>
        <TouchableOpacity onPress={openPrivacy} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} activeOpacity={0.7}>
          <Text style={styles.legalLink}>{t('paywall.legal.privacy')}</Text>
        </TouchableOpacity>
        <Text style={styles.legalSep}>·</Text>
        <TouchableOpacity onPress={openTerms} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} activeOpacity={0.7}>
          <Text style={styles.legalLink}>{t('paywall.legal.terms')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function formatPlanLabel(pkg: PurchasesPackage, t: (k: string, opts?: any) => string): string {
  const id = (pkg.identifier || '').toLowerCase();
  if (id.includes('year') || id.includes('annual')) return t('paywall.plans.yearly');
  if (id.includes('month')) return t('paywall.plans.monthly');
  return pkg.product?.title || t('paywall.plans.plan');
}

function formatPlanHint(pkg: PurchasesPackage, t: (k: string, opts?: any) => string): string {
  const id = (pkg.identifier || '').toLowerCase();
  if (id.includes('year') || id.includes('annual')) return t('paywall.plans.yearlyHint');
  if (id.includes('month')) return t('paywall.plans.monthlyHint');
  return pkg.product?.description || '';
}

export default function PaywallScreen({ navigation, route }: Props) {
  const { t, i18n } = useTranslation();
  const paywallSource = route?.params?.source;
  const paywallMode = route?.params?.mode;
  // Treat plan_choice as a "first run" paywall too (needs Continue Free).
  const isFirstLaunch = paywallSource === 'first_launch' || paywallSource === 'plan_choice';

  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [premiumActive, setPremiumActive] = useState<boolean | null>(null);
  const [activeProductIds, setActiveProductIds] = useState<string[]>([]);
  const [currentPlanLabel, setCurrentPlanLabel] = useState<string | null>(null);
  const [premiumExpiresAt, setPremiumExpiresAt] = useState<string | null>(null);
  const [premiumWillRenew, setPremiumWillRenew] = useState<boolean | null>(null);
  const [premiumIsSandbox, setPremiumIsSandbox] = useState(false);

  const hydrateFromCustomerInfo = useCallback(
    (info: any) => {
      const active = Array.isArray(info?.activeSubscriptions) ? (info.activeSubscriptions as string[]) : [];
      setActiveProductIds(active);

      // Track expiry + renewal state (important for "cancelled but still active" UX).
      try {
        const entId = getRevenueCatEntitlementId();
        const ent =
          (entId && info?.entitlements?.active?.[entId]) ||
          (entId && info?.entitlements?.all?.[entId]) ||
          null;
        setPremiumExpiresAt(ent?.expirationDate ?? null);
        setPremiumWillRenew(typeof ent?.willRenew === 'boolean' ? ent.willRenew : null);
        setPremiumIsSandbox(!!(ent?.isSandbox ?? info?.isSandbox));
      } catch {
        setPremiumExpiresAt(null);
        setPremiumWillRenew(null);
        setPremiumIsSandbox(false);
      }

      const anyId = active[0] || '';
      const idLower = anyId.toLowerCase();
      if (idLower.includes('year') || idLower.includes('annual')) {
        setCurrentPlanLabel(t('paywall.plans.yearly'));
      } else if (idLower.includes('month')) {
        setCurrentPlanLabel(t('paywall.plans.monthly'));
      } else {
        setCurrentPlanLabel(null);
      }
    },
    [t]
  );

  const refreshPremiumState = useCallback(async () => {
    setPremiumActive(null);
    try {
      await refreshRevenueCatCaches();
    } catch {
      // ignore
    }

    try {
      const active = await getEffectivePremiumFlag();
      setPremiumActive(active);
    } catch {
      setPremiumActive(false);
    }

    try {
      const info = await Purchases.getCustomerInfo();
      hydrateFromCustomerInfo(info as any);
    } catch {
      setActiveProductIds([]);
      setCurrentPlanLabel(null);
      setPremiumExpiresAt(null);
      setPremiumWillRenew(null);
      setPremiumIsSandbox(false);
    }
  }, [hydrateFromCustomerInfo]);

  const confirmPurchaseForCurrentAccount = useCallback(async (): Promise<boolean> => {
    const email = (getFirebaseAuth().currentUser?.email || '').trim();
    const accountLabel = email || t('paywall.alerts.confirmAccountUnknown', { defaultValue: 'your current account' });
    return await new Promise<boolean>((resolve) => {
      showAlert(
        t('paywall.alerts.confirmAccountTitle', { defaultValue: 'Confirm your account' }),
        t('paywall.alerts.confirmAccountBody', {
          account: accountLabel,
          defaultValue:
            `You’re about to buy Premium for ${accountLabel}.\n\nPremium will be linked to this SeedMind account and won’t transfer to other accounts.`,
        }),
        [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel', onPress: () => resolve(false) },
          {
            text: t('paywall.alerts.confirmAccountContinue', { defaultValue: 'Continue' }),
            style: 'default',
            onPress: () => resolve(true),
          },
        ]
      );
    });
  }, [t]);

  const yearlyDiscountPercent = useMemo(() => {
    const monthly = packages.find((p) => (p.identifier || '').toLowerCase().includes('month'));
    const yearly = packages.find((p) => {
      const id = (p.identifier || '').toLowerCase();
      return id.includes('year') || id.includes('annual');
    });
    const monthPrice = monthly?.product?.price;
    const yearPrice = yearly?.product?.price;
    if (typeof monthPrice !== 'number' || typeof yearPrice !== 'number') return null;
    if (!(monthPrice > 0) || !(yearPrice > 0)) return null;
    const pct = Math.round((1 - yearPrice / (monthPrice * 12)) * 100);
    if (!Number.isFinite(pct)) return null;
    // Keep it sane (avoid weird StoreKit edge cases).
    return Math.max(0, Math.min(95, pct));
  }, [packages]);

  useEffect(() => {
    (async () => {
      await refreshPremiumState();
    })();
    return () => {
      // no-op
    };
  }, [refreshPremiumState]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        await refreshPremiumState();
      })();
      return () => {
        // no-op
      };
    }, [refreshPremiumState])
  );

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        // StoreKit/ASC propagation can be flaky right after setup changes.
        // Retry a couple times to avoid scary transient failures.
        let offering = await getCurrentOffering();
        if (!offering) {
          await new Promise((r) => setTimeout(r, 1200));
          offering = await getCurrentOffering();
        }
        if (!offering) {
          await new Promise((r) => setTimeout(r, 2500));
          offering = await getCurrentOffering();
        }
        const pkgs = offering?.availablePackages ?? [];
        if (!alive) return;
        setPackages(pkgs);
        setSelectedId(pkgs[0]?.identifier ?? '');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.identifier === selectedId) ?? null,
    [packages, selectedId]
  );

  const websiteBaseUrl = useMemo(() => {
    const extra = getAppExtra();
    return typeof extra.websiteBaseUrl === 'string' ? extra.websiteBaseUrl.trim().replace(/\/+$/, '') : '';
  }, []);

  const activeSubscriptionPackage = useMemo(() => {
    const ids = new Set(activeProductIds.filter(Boolean));
    if (!ids.size) return null;
    return packages.find((p) => p.product?.identifier && ids.has(p.product.identifier)) ?? null;
  }, [packages, activeProductIds]);

  const safeClose = () => {
    try {
      if (navigation?.canGoBack?.()) {
        navigation.goBack();
        return;
      }
      const parent = navigation?.getParent?.();
      if (parent?.canGoBack?.()) {
        parent.goBack();
        return;
      }
    } catch {
      // fall through
    }

    // Fallback: if we can't go back (e.g. after a dev reload), send user to the main tabs.
    try {
      navigation?.navigate?.('Main');
    } catch {
      // ignore
    }
  };

  const goToMain = async () => {
    try {
      await markPlanChoiceSeen();
    } catch {
      // ignore
    }

    // Always reset to Main (Seeds Guide) so the Paywall can't "dismiss" back to Start.
    // Use a root reset dispatch which is reliable even with modal presentation.
    const action = CommonActions.reset({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'Chat' } }],
    });

    try {
      navigation?.dispatch?.(action);
      return;
    } catch {}

    try {
      const parent = navigation?.getParent?.();
      parent?.dispatch?.(action);
      return;
    } catch {}

    try {
      navigation?.reset?.({ index: 0, routes: [{ name: 'Main', params: { screen: 'Chat' } }] });
      return;
    } catch {}

    try {
      navigation?.navigate?.('Main', { screen: 'Chat' });
    } catch {
      // ignore
    }
  };

  const handleClose = () => {
    if (isFirstLaunch) {
      void goToMain();
      return;
    }
    safeClose();
  };

  const handleRestore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await refreshPremiumState();
      // Brief wait: Firebase currentUser can lag right after sign-in before restore.
      const authWaitUntil = Date.now() + 1800;
      while (Date.now() < authWaitUntil && !getFirebaseAuth().currentUser?.uid) {
        await new Promise<void>((r) => setTimeout(r, 120));
      }
      const restoredInfo = await Purchases.restorePurchases();
      applyCustomerInfoFromSdk(restoredInfo);
      let latestInfo: any = restoredInfo;
      let premium = await getEffectivePremiumFlag();
      if (!premium) {
        try {
          const sync = await Purchases.syncPurchasesForResult();
          applyCustomerInfoFromSdk(sync.customerInfo);
          latestInfo = sync.customerInfo;
          premium = await getEffectivePremiumFlag();
        } catch {
          // ignore
        }
      }
      setPremiumActive(premium);
      try {
        hydrateFromCustomerInfo(latestInfo);
      } catch {
        // ignore
      }
      if (premium) {
        showAlert(t('paywall.alerts.restoredTitle'), t('paywall.alerts.restoredBody'));
        if (isFirstLaunch) {
          await goToMain();
        } else {
          safeClose();
        }
      } else {
        // Option C (ChatGPT-style): purchases do not transfer between SeedMind accounts.
        showAlert(
          t('paywall.alerts.linkedDifferentAccountTitle', { defaultValue: 'Subscription is linked to another account' }),
          t('paywall.alerts.linkedDifferentAccountBody', {
            defaultValue:
              'No purchases were restored for this SeedMind account. If you already subscribed, please sign into the account you purchased with.',
          })
        );
      }
    } catch (e: any) {
      showAlert(t('paywall.alerts.restoreFailedTitle'), e?.message || t('paywall.alerts.tryAgain'));
    } finally {
      setBusy(false);
    }
  };

  const handlePurchase = async () => {
    if (busy) return;
    if (!selectedPackage) {
      showAlert(t('paywall.alerts.notAvailableTitle'), t('paywall.alerts.notAvailableBody'));
      return;
    }
    setBusy(true);
    try {
      const confirmed = await confirmPurchaseForCurrentAccount();
      if (!confirmed) return;

      // Avoid confusing "instant premium" flows: if the user is already subscribed on this Apple ID,
      // don't try to repurchase. Show a clear message and offer Manage instead.
      await refreshPremiumState();
      const entitledOnThisDevice = await isRevenueCatPremium();
      const premiumForThisAccount = await getEffectivePremiumFlag();
      if (premiumForThisAccount) {
        setPremiumActive(true);
        showAlert(
          t('paywall.alerts.alreadyPremiumTitle', { defaultValue: 'Premium is already active' }),
          t('paywall.alerts.alreadyPremiumBody', {
            defaultValue: 'Your subscription is already active on this device. You can manage it in your Apple subscription settings.',
          })
        );
        if (isFirstLaunch) {
          await goToMain();
        } else {
          safeClose();
        }
        return;
      }
      // Strict Option C: if a subscription exists on this Apple ID but is owned by another SeedMind account,
      // do not even show the App Store sheet. Explain clearly.
      if (entitledOnThisDevice && !premiumForThisAccount) {
        showAlert(
          t('paywall.alerts.linkedDifferentAccountTitle', { defaultValue: 'Subscription is linked to another account' }),
          t('paywall.alerts.linkedDifferentAccountBody', {
            defaultValue:
              'This Apple ID already has a SeedMind subscription, but it’s linked to a different SeedMind account. Please sign into the account you purchased with.',
          })
        );
        return;
      }

      const purchaseResult: any = await Purchases.purchasePackage(selectedPackage);
      applyCustomerInfoFromSdk(purchaseResult?.customerInfo ?? null);
      await refreshPremiumState();
      const premiumAfter = await getEffectivePremiumFlag();
      setPremiumActive(premiumAfter);
      if (premiumAfter) {
        showAlert(t('paywall.alerts.welcomeTitle'), t('paywall.alerts.welcomeBody'));
        if (isFirstLaunch) {
          await goToMain();
        } else {
          safeClose();
        }
      } else {
        showAlert(
          t('paywall.alerts.linkedDifferentAccountTitle', { defaultValue: 'Subscription is linked to another account' }),
          t('paywall.alerts.linkedDifferentAccountBody', {
            defaultValue:
              'This Apple ID already has a SeedMind subscription, but it’s linked to a different SeedMind account. Please sign into the account you purchased with.',
          })
        );
      }
    } catch (e: any) {
      if (e?.userCancelled) {
        showAlert(t('paywall.alerts.purchaseTitle'), t('paywall.alerts.purchaseCancelled'));
        return;
      }

      const code = e?.code;
      const message = String(e?.message || '');
      const likelyOptionCLinkedAccount =
        code === PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR ||
        code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR ||
        code === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR ||
        /problem with the app store/i.test(message) ||
        /receipt/i.test(message);

      if (likelyOptionCLinkedAccount) {
        showAlert(
          t('paywall.alerts.linkedDifferentAccountTitle', { defaultValue: 'Subscription is linked to another account' }),
          t('paywall.alerts.linkedDifferentAccountBody', {
            defaultValue:
              'This Apple ID already has a SeedMind subscription, but it’s linked to a different SeedMind account. Please sign into the account you purchased with.',
          })
        );
        return;
      }

      showAlert(t('paywall.alerts.purchaseTitle'), message || t('paywall.alerts.purchaseFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleContinueFree = async () => {
    if (busy) return;
    await goToMain();
  };

  const handleManageSubscriptions = async () => {
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

  const benefits = [
    t('paywall.benefits.allMeditations'),
    t('paywall.benefits.unlimitedJourneys'),
    t('paywall.benefits.messagesPerCycle'),
  ];
  const benefitsActive = [
    t('paywall.benefitsActive.allMeditations'),
    t('paywall.benefitsActive.unlimitedJourneys'),
    t('paywall.benefitsActive.messagesPerCycle'),
  ];

  // "Manage" mode: avoid a jarring upsell->active flip while we refresh state.
  if (paywallMode === 'manage' && premiumActive === null) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[Colors.background, Colors.cream]} style={styles.gradient}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{t('settings.premium.title')}</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={[styles.content, styles.manageContent]}>
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.mocha} />
              <Text style={styles.loadingText}>
                {t('paywall.loadingStatus', { defaultValue: 'Checking your subscription…' })}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // "Manage" mode: if the user is already Premium, show an "active" state instead of upsell UI.
  if (paywallMode === 'manage' && premiumActive === true) {
    const prettyDate = (iso: string) => {
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      } catch {
        return '';
      }
    };
    const expiresText = premiumExpiresAt ? prettyDate(premiumExpiresAt) : '';

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[Colors.background, Colors.cream]} style={styles.gradient}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{t('settings.premium.title')}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={[styles.content, styles.manageContent]}>
            <View style={styles.heroCard}>
              <Text style={styles.heroTitle}>👑 {t('settings.premium.labelActive')}</Text>
              {!!currentPlanLabel && (
                <Text style={styles.currentPlanText}>
                  {t('paywall.currentPlan', { plan: currentPlanLabel })}
                </Text>
              )}
              {!!expiresText && (
                <Text style={styles.currentPlanText}>
                  {premiumWillRenew === false
                    ? t('paywall.activeUntil', { date: expiresText })
                    : t('paywall.renewsOn', { date: expiresText })}
                </Text>
              )}
              <Text style={styles.manageNote}>{t('paywall.cancelNote')}</Text>
              {premiumIsSandbox ? (
                <Text style={styles.manageNoteSubtle}>{t('paywall.sandboxNote')}</Text>
              ) : null}
              <View style={styles.benefits}>
                {benefitsActive.map((b) => (
                  <View key={b} style={styles.benefitRow}>
                    <Text style={styles.benefitIcon}>✓</Text>
                    <Text style={styles.benefitText}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>

            <PaywallLegalCompliance
              t={t}
              planTermLabel={
                currentPlanLabel ||
                (activeSubscriptionPackage ? formatPlanLabel(activeSubscriptionPackage, t) : '') ||
                t('paywall.plans.plan')
              }
              priceString={activeSubscriptionPackage?.product?.priceString ?? ''}
              websiteBaseUrl={websiteBaseUrl}
            />

            <TouchableOpacity
              style={[styles.primaryButton, { marginTop: Spacing.md }, busy && { opacity: 0.6 }]}
              onPress={handleManageSubscriptions}
              disabled={busy}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryButtonText}>{t('settings.premium.manage')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.restoreLinkButton, busy && { opacity: 0.6 }]}
              onPress={handleRestore}
              disabled={busy}
              activeOpacity={0.7}
            >
              <Text style={styles.restoreLinkText}>{t('paywall.restore')}</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={[Colors.background, Colors.cream]} style={styles.gradient}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('paywall.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>{t('paywall.heroTitle')}</Text>
            <Text style={styles.heroBody}>
              {t('paywall.heroBody')}
            </Text>

            <View style={styles.benefits}>
              {benefits.map((b) => (
                <View key={b} style={styles.benefitRow}>
                  <Text style={styles.benefitIcon}>✓</Text>
                  <Text style={styles.benefitText}>{b}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.freeIncludes}>
            {t('paywall.freeIncludes', {
              messages: FREE_MESSAGE_LIMIT,
              journeys: FREE_GARDEN_TICKET_LIMIT,
              days: FREE_CYCLE_DAYS,
              daily: t('meditations.items.4.title', { defaultValue: 'Daily Gratitude Brew' }),
            })}
          </Text>

          <Text style={styles.sectionLabel}>{t('paywall.choosePlan')}</Text>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.mocha} />
              <Text style={styles.loadingText}>{t('paywall.loadingPlans')}</Text>
            </View>
          ) : packages.length === 0 ? (
            <View style={styles.loadingBox}>
              <Text style={styles.loadingText}>
                {t('paywall.noPlans')}
              </Text>
            </View>
          ) : (
            <View style={styles.plans}>
              {packages.map((pkg) => {
                const active = pkg.identifier === selectedId;
                const isCurrentPlan =
                  premiumActive === true && !!pkg.product?.identifier && activeProductIds.includes(pkg.product.identifier);
                const price = pkg.product?.priceString || '';
                const label = formatPlanLabel(pkg, t);
                const hint = formatPlanHint(pkg, t);
                const idLower = (pkg.identifier || '').toLowerCase();
                const isYearly = idLower.includes('year') || idLower.includes('annual');
                const savePct = typeof yearlyDiscountPercent === 'number' ? yearlyDiscountPercent : 40;
                return (
                  <TouchableOpacity
                    key={pkg.identifier}
                    style={[styles.planCard, active && styles.planCardActive]}
                    onPress={() => setSelectedId(pkg.identifier)}
                    activeOpacity={0.9}
                  >
                    <View style={styles.planLeft}>
                      <View style={styles.planLabelRow}>
                        <Text style={[styles.planLabel, active && styles.planLabelActive]}>{label}</Text>
                        {isYearly && savePct > 0 ? (
                          <View style={styles.saveBadge}>
                            <Text style={styles.saveBadgeText}>
                              {t('paywall.savePercent', { percent: savePct, defaultValue: `Save ${savePct}%` })}
                            </Text>
                          </View>
                        ) : null}
                        {isCurrentPlan && (
                          <View style={styles.currentPlanBadge}>
                            <Text style={styles.currentPlanBadgeText}>{t('paywall.currentPlanBadge')}</Text>
                          </View>
                        )}
                      </View>
                      {!!hint && (
                        <Text style={[styles.planHint, active && styles.planHintActive]} numberOfLines={2}>
                          {hint}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.planPrice, active && styles.planPriceActive]}>{price}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {premiumActive === true ? (
            <TouchableOpacity
              style={[styles.primaryButton, busy && { opacity: 0.6 }]}
              onPress={handleManageSubscriptions}
              disabled={busy}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryButtonText}>{t('settings.premium.manage')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, (busy || !selectedPackage) && { opacity: 0.6 }]}
              onPress={handlePurchase}
              disabled={busy || !selectedPackage}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryButtonText}>
                {busy ? t('paywall.pleaseWait') : Platform.OS === 'ios' ? t('paywall.continueWithApple') : t('paywall.continue')}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.secondaryButton, busy && { opacity: 0.6 }]}
            onPress={handleRestore}
            disabled={busy}
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryButtonText}>{t('paywall.restore')}</Text>
          </TouchableOpacity>

          {isFirstLaunch && (
            <TouchableOpacity
              style={[styles.continueFreeButton, busy && { opacity: 0.6 }]}
              onPress={handleContinueFree}
              disabled={busy}
              activeOpacity={0.9}
            >
              <Text style={styles.continueFreeText}>{t('paywall.continueFree')}</Text>
            </TouchableOpacity>
          )}

          {!loading ? (
            <PaywallLegalCompliance
              t={t}
              planTermLabel={selectedPackage ? formatPlanLabel(selectedPackage, t) : t('paywall.plans.plan')}
              priceString={selectedPackage?.product?.priceString ?? ''}
              websiteBaseUrl={websiteBaseUrl}
            />
          ) : null}

          <Text style={styles.disclaimer}>
            {t('paywall.disclaimer')}
          </Text>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  gradient: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 26, color: Colors.textPrimary, marginTop: -2 },
  title: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeXL,
    color: Colors.espresso,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...Shadows.md,
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSize2XL,
    color: Colors.espresso,
    marginBottom: Spacing.xs,
  },
  heroBody: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  manageContent: {
    paddingTop: Spacing.lg,
  },
  currentPlanText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textMuted,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.md,
    textAlign: 'left',
  },
  manageNote: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textMuted,
    marginTop: -Spacing.xs,
    textAlign: 'left',
  },
  manageNoteSubtle: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 11,
    lineHeight: 15,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    textAlign: 'left',
    opacity: 0.85,
  },
  planLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currentPlanBadge: {
    backgroundColor: Colors.softSage,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  currentPlanBadgeText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: 11,
    color: Colors.espresso,
  },
  saveBadge: {
    backgroundColor: 'rgba(255, 214, 107, 0.22)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 107, 0.45)',
  },
  saveBadgeText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: 11,
    color: Colors.espresso,
  },
  benefits: { gap: Spacing.sm },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  benefitIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.softSage,
    color: Colors.espresso,
    textAlign: 'center',
    lineHeight: 22,
    overflow: 'hidden',
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: 12,
  },
  benefitText: {
    flex: 1,
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textPrimary,
  },
  sectionLabel: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  freeIncludes: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: -Spacing.sm,
    marginBottom: Spacing.lg,
  },
  loadingBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...Shadows.sm,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  plans: { gap: Spacing.sm, marginBottom: Spacing.lg },
  planCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Shadows.sm,
  },
  planCardActive: {
    borderColor: Colors.gold,
    backgroundColor: Colors.cream,
  },
  planLeft: { flex: 1, paddingRight: Spacing.md },
  planLabel: {
    fontFamily: Typography.fontFamilyBodyBold,
    fontSize: Typography.fontSizeLG,
    color: Colors.espresso,
    marginBottom: 2,
  },
  planLabelActive: { color: Colors.mocha },
  planHint: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  planHintActive: { color: Colors.textSecondary },
  planPrice: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeXL,
    color: Colors.espresso,
  },
  planPriceActive: { color: Colors.mocha },
  primaryButton: {
    backgroundColor: Colors.mocha,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
    marginTop: Spacing.lg,
  },
  primaryButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.cream,
  },
  secondaryButton: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  secondaryButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.textSecondary,
  },
  restoreLinkButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreLinkText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeSM,
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  continueFreeButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueFreeText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
  disclaimer: {
    marginTop: Spacing.md,
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  complianceBlock: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.sm,
  },
  complianceText: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: Spacing.xs,
  },
  legalLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: Spacing.xs,
    gap: 6,
  },
  legalSep: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
  },
  legalLink: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeXS,
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
});

