import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import type { AuthSessionResult } from 'expo-auth-session';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';

import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  OAuthProvider,
  linkWithCredential,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
} from 'firebase/auth';

import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { getFirebaseAuth, getGoogleAuthConfig, isFirebaseConfigured } from '../services/firebase';
import { trackEvent } from '../services/analytics';
import { refreshFreeLimitsFromServer } from '../services/subscriptionGate';
import { showAlert } from '../utils/crossPlatformAlert';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  mode?: 'signup' | 'signin';
  onComplete: (result?: { isNewUser?: boolean }) => void;
};

export default function SignUpScreen({ mode = 'signup', onComplete }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [viewMode, setViewMode] = useState<'signup' | 'signin'>(mode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [postAuthEmail, setPostAuthEmail] = useState<string | null>(null);
  const [seedmindPassword, setSeedmindPassword] = useState('');
  const [seedmindPasswordConfirm, setSeedmindPasswordConfirm] = useState('');

  useEffect(() => {
    setViewMode(mode);
    // Avoid carrying error banners between modes (e.g., sign-up error showing on sign-in screen).
    setError(null);
    setNeedsPasswordSetup(false);
  }, [mode]);

  const title = viewMode === 'signin' ? t('auth.signIn.title') : t('auth.signUp.title');
  const subtitle = viewMode === 'signin' ? t('auth.signIn.subtitle') : t('auth.signUp.subtitle');

  const handleBackToStart = () => {
    try {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
    } catch {
      // fall through
    }
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Start' }],
      })
    );
  };

  const firebaseReady = isFirebaseConfigured();
  const googleCfg = getGoogleAuthConfig();
  const googleIosClientId = useMemo(() => (googleCfg.iosClientId ?? '').trim(), [googleCfg.iosClientId]);
  const googleWebClientId = useMemo(() => (googleCfg.webClientId ?? '').trim(), [googleCfg.webClientId]);
  const googleAndroidClientId = useMemo(() => (googleCfg.androidClientId ?? '').trim(), [googleCfg.androidClientId]);
  const googleReady = Platform.OS === 'ios' ? !!googleIosClientId : !!googleWebClientId;

  // For iOS dev builds, Google requires a redirect URI using the reversed client id scheme.
  // Example: com.googleusercontent.apps.<CLIENT_ID_WITHOUT_DOMAIN>:/oauthredirect
  const googleNativeRedirect = useMemo(() => {
    const suffix = '.apps.googleusercontent.com';
    const idWithoutDomain = googleIosClientId.endsWith(suffix)
      ? googleIosClientId.slice(0, -suffix.length)
      : googleIosClientId;
    const iosUrlScheme = `com.googleusercontent.apps.${idWithoutDomain}`;
    return `${iosUrlScheme}:/oauthredirect`;
  }, [googleIosClientId]);

  // Use the recommended installed-app flow (code -> auto-exchanged to id_token).
  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest(
    {
      iosClientId: googleIosClientId,
      androidClientId: googleAndroidClientId,
      webClientId: googleWebClientId,
      // Force redirectUri so we don't depend on environment detection.
      // For iOS, this MUST match the "iOS URL scheme" from Google Cloud Console.
      redirectUri: Platform.OS === 'ios' ? googleNativeRedirect : undefined,
      scopes: ['profile', 'email'],
    },
    {}
  );

  const primaryCta = useMemo(() => {
    return viewMode === 'signin' ? t('auth.actions.signIn') : t('auth.actions.signUp');
  }, [t, viewMode]);

  const resetError = () => setError(null);

  const getFriendlyAuthError = (e: any): string => {
    const code: string | undefined = e?.code;
    switch (code) {
      case 'auth/email-already-in-use':
        return t('auth.errors.emailAlreadyInUse');
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return t('auth.errors.invalidCredential');
      case 'auth/invalid-email':
        return t('auth.errors.invalidEmail');
      case 'auth/weak-password':
        return t('auth.errors.weakPassword');
      case 'auth/too-many-requests':
        return t('auth.errors.tooManyRequests');
      case 'auth/account-exists-with-different-credential':
        return t('auth.errors.accountExistsDifferentProvider');
      default:
        return e?.message || t('auth.errors.generic');
    }
  };

  const maybeOfferPasswordSetup = async (): Promise<boolean> => {
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      const uEmail = u?.email?.trim();
      if (!u || !uEmail) return false;

      const methods = await fetchSignInMethodsForEmail(auth, uEmail);
      if (methods.includes('password')) return false;

      setPostAuthEmail(uEmail);
      setSeedmindPassword('');
      setSeedmindPasswordConfirm('');
      setPasswordVisible(false);
      setNeedsPasswordSetup(true);
      return true;
    } catch {
      return false;
    }
  };

  const handleEmailAuth = async () => {
    if (!firebaseReady) return;
    resetError();
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const trimmedEmail = email.trim();
      if (viewMode === 'signin') {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
        trackEvent('auth_email_signin_success').catch(() => {});
      } else {
        await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        trackEvent('auth_email_signup_success').catch(() => {});
      }
      // Ensure device-wide free limits are restored/backfilled for this uid (uninstall-safe).
      await refreshFreeLimitsFromServer().catch(() => {});
      onComplete({ isNewUser: viewMode === 'signup' });
    } catch (e: any) {
      const code: string | undefined = e?.code;
      trackEvent('auth_email_error', { code: code ?? 'unknown', mode: viewMode }).catch(() => {});
      if (viewMode === 'signup' && code === 'auth/email-already-in-use') {
        setViewMode('signin');
      }
      setError(getFriendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!firebaseReady) return;
    resetError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t('auth.errors.enterEmailFirst'));
      return;
    }

    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      await sendPasswordResetEmail(auth, trimmedEmail);
      trackEvent('auth_password_reset_requested').catch(() => {});
      showAlert(t('auth.forgotPassword.sentTitle'), t('auth.forgotPassword.sentBody'));
    } catch (e: any) {
      // Behave like most apps: do not block based on provider detection and do not reveal account existence.
      const code: string | undefined = e?.code;
      if (code === 'auth/invalid-email') {
        setError(t('auth.errors.invalidEmail'));
      } else {
        showAlert(t('auth.forgotPassword.sentTitle'), t('auth.forgotPassword.sentBody'));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSeedMindPassword = async () => {
    if (!firebaseReady) return;
    resetError();

    const trimmedEmail = (postAuthEmail ?? '').trim();
    if (!trimmedEmail) {
      setError(t('auth.errors.generic'));
      return;
    }

    if (seedmindPassword.length < 6) {
      setError(t('auth.passwordSetup.errors.passwordTooShort'));
      return;
    }
    if (seedmindPassword !== seedmindPasswordConfirm) {
      setError(t('auth.passwordSetup.errors.passwordsDontMatch'));
      return;
    }

    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) {
        setError(t('auth.errors.generic'));
        return;
      }

      const cred = EmailAuthProvider.credential(trimmedEmail, seedmindPassword);
      await linkWithCredential(u, cred);
      trackEvent('auth_password_linked_success').catch(() => {});
      showAlert(t('auth.passwordSetup.successTitle'), t('auth.passwordSetup.successBody'));
      onComplete({ isNewUser: true });
    } catch (e: any) {
      trackEvent('auth_password_linked_error', { code: e?.code ?? 'unknown' }).catch(() => {});
      setError(getFriendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleApple = async () => {
    if (!firebaseReady) return;
    resetError();
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error(t('auth.errors.appleNoIdentityToken'));
      }

      const provider = new OAuthProvider('apple.com');
      const firebaseCredential = provider.credential({
        idToken: credential.identityToken,
        rawNonce,
      });

      const result = await signInWithCredential(auth, firebaseCredential);
      const isNewUser = !!(result as any)?.additionalUserInfo?.isNewUser;
      trackEvent(isNewUser ? 'auth_apple_signup_success' : 'auth_apple_signin_success').catch(() => {});
      // Ensure device-wide free limits are restored/backfilled for this uid (uninstall-safe).
      await refreshFreeLimitsFromServer().catch(() => {});
      if (isNewUser) {
        const offered = await maybeOfferPasswordSetup();
        if (!offered) {
          onComplete({ isNewUser: true });
        }
      } else {
        onComplete({ isNewUser: false });
      }
    } catch (e: any) {
      // User cancel is not an error to show loudly
      if (e?.code === 'ERR_REQUEST_CANCELED') {
        // no-op
      } else {
        trackEvent('auth_apple_error', { code: e?.code ?? 'unknown' }).catch(() => {});
        setError(getFriendlyAuthError(e));
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const handleGoogleResponse = async (res: AuthSessionResult) => {
      if (!firebaseReady) return;
      if (res.type !== 'success') return;
      resetError();
      setBusy(true);
      try {
        const idToken = (res as any)?.authentication?.idToken ?? (res as any)?.params?.id_token;
        if (!idToken) throw new Error(t('auth.errors.googleNoIdToken'));
        const auth = getFirebaseAuth();
        const googleCred = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, googleCred);
        const isNewUser = !!(result as any)?.additionalUserInfo?.isNewUser;
        trackEvent(isNewUser ? 'auth_google_signup_success' : 'auth_google_signin_success').catch(() => {});
        // Ensure device-wide free limits are restored/backfilled for this uid (uninstall-safe).
        await refreshFreeLimitsFromServer().catch(() => {});
        if (isNewUser) {
          const offered = await maybeOfferPasswordSetup();
          if (!offered) {
            onComplete({ isNewUser: true });
          }
        } else {
          onComplete({ isNewUser: false });
        }
      } catch (e: any) {
        trackEvent('auth_google_error', { code: e?.code ?? 'unknown' }).catch(() => {});
        setError(getFriendlyAuthError(e));
      } finally {
        setBusy(false);
      }
    };

    handleGoogleResponse(googleResponse as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <Pressable
          onPress={handleBackToStart}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backButtonText}>←</Text>
        </Pressable>
        <View style={{ width: 44 }} />
      </View>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={Platform.OS === 'ios' ? 18 : 24}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {!firebaseReady ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('auth.configMissing.title')}</Text>
            <Text style={styles.cardText}>{t('auth.configMissing.body')}</Text>
          </View>
        ) : (
          <>
            <View style={styles.providers}>
              {Platform.OS === 'ios' && (
                <Pressable
                  disabled={busy}
                  onPress={handleApple}
                  style={({ pressed }) => [
                    styles.providerButton,
                    styles.providerApple,
                    pressed && { transform: [{ scale: 0.995 }] },
                    busy && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.providerIcon, styles.providerIconApple]}></Text>
                  <Text style={[styles.providerText, styles.providerTextApple]}>{t('auth.providers.apple')}</Text>
                </Pressable>
              )}

              <Pressable
                disabled={busy || !googleRequest || !googleReady}
                onPress={() => promptGoogleAsync()}
                style={({ pressed }) => [
                  styles.providerButton,
                  pressed && { transform: [{ scale: 0.995 }] },
                  (busy || !googleRequest || !googleReady) && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.providerIcon}>G</Text>
                <Text style={styles.providerText}>
                  {googleReady ? t('auth.providers.google') : t('auth.providers.googleNotReady')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>{t('auth.or')}</Text>
              <View style={styles.orLine} />
            </View>

            <View style={styles.form}>
              <TextInput
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) resetError();
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={t('auth.fields.email')}
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                editable={!busy}
                textContentType="emailAddress"
              />
              {!needsPasswordSetup ? (
                <View style={styles.passwordWrap}>
                  <TextInput
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v);
                      if (error) resetError();
                    }}
                    secureTextEntry={!passwordVisible}
                    placeholder={t('auth.fields.password')}
                    placeholderTextColor={Colors.textMuted}
                    style={[styles.input, styles.passwordInput]}
                    editable={!busy}
                    textContentType={viewMode === 'signin' ? 'password' : 'newPassword'}
                  />
                  <Pressable
                    onPress={() => setPasswordVisible((s) => !s)}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.eyeButton,
                      pressed && { opacity: 0.85 },
                      busy && { opacity: 0.5 },
                    ]}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.passwordToggle')}
                  >
                    <Ionicons
                      name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={Colors.textMuted}
                    />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.passwordSetup}>
                  <Text style={styles.passwordSetupTitle}>{t('auth.passwordSetup.title')}</Text>
                  <Text style={styles.passwordSetupBody}>{t('auth.passwordSetup.body')}</Text>

                  {!!postAuthEmail && (
                    <View style={styles.passwordSetupEmailPill}>
                      <Text style={styles.passwordSetupEmailText} numberOfLines={1}>
                        {postAuthEmail}
                      </Text>
                    </View>
                  )}

                  <View style={styles.passwordWrap}>
                    <TextInput
                      value={seedmindPassword}
                      onChangeText={(v) => {
                        setSeedmindPassword(v);
                        if (error) resetError();
                      }}
                      secureTextEntry={!passwordVisible}
                      placeholder={t('auth.passwordSetup.fields.newPassword')}
                      placeholderTextColor={Colors.textMuted}
                      style={[styles.input, styles.passwordInput]}
                      editable={!busy}
                      textContentType="newPassword"
                    />
                    <Pressable
                      onPress={() => setPasswordVisible((s) => !s)}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.eyeButton,
                        pressed && { opacity: 0.85 },
                        busy && { opacity: 0.5 },
                      ]}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={t('auth.passwordToggle')}
                    >
                      <Ionicons
                        name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={Colors.textMuted}
                      />
                    </Pressable>
                  </View>

                  <View style={styles.passwordWrap}>
                    <TextInput
                      value={seedmindPasswordConfirm}
                      onChangeText={(v) => {
                        setSeedmindPasswordConfirm(v);
                        if (error) resetError();
                      }}
                      secureTextEntry={!passwordVisible}
                      placeholder={t('auth.passwordSetup.fields.confirmPassword')}
                      placeholderTextColor={Colors.textMuted}
                      style={[styles.input, styles.passwordInput]}
                      editable={!busy}
                      textContentType="newPassword"
                    />
                    <Pressable
                      onPress={() => setPasswordVisible((s) => !s)}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.eyeButton,
                        pressed && { opacity: 0.85 },
                        busy && { opacity: 0.5 },
                      ]}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={t('auth.passwordToggle')}
                    >
                      <Ionicons
                        name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={Colors.textMuted}
                      />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            {!needsPasswordSetup && viewMode === 'signin' && (
              <Text style={styles.forgotRow}>
                <Text onPress={handleForgotPassword} style={styles.forgotLink}>
                  {t('auth.forgotPassword.link')}
                </Text>
              </Text>
            )}

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText} numberOfLines={4}>
                  {error}
                </Text>
              </View>
            )}

            <Pressable
              onPress={needsPasswordSetup ? handleCreateSeedMindPassword : handleEmailAuth}
              disabled={
                needsPasswordSetup
                  ? busy || !seedmindPassword || !seedmindPasswordConfirm
                  : busy || !email.trim() || !password
              }
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && { transform: [{ scale: 0.99 }] },
                (needsPasswordSetup
                  ? busy || !seedmindPassword || !seedmindPasswordConfirm
                  : busy || !email.trim() || !password) && { opacity: 0.75 },
              ]}
            >
              <LinearGradient colors={[Colors.mocha, Colors.espresso]} style={styles.primaryButtonGradient}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {needsPasswordSetup ? t('auth.passwordSetup.actions.create') : primaryCta}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            {needsPasswordSetup && (
              <Text style={styles.switchRow}>
                <Text onPress={() => onComplete({ isNewUser: true })} style={styles.switchLink}>
                  {t('auth.passwordSetup.actions.skip')}
                </Text>
              </Text>
            )}

            <Text style={styles.switchRow}>
              {viewMode === 'signin' ? t('auth.switch.noAccount') : t('auth.switch.haveAccount')}{' '}
              <Text
                    onPress={() => {
                      resetError();
                      setPassword('');
                      setPasswordVisible(false);
                      setSeedmindPassword('');
                      setSeedmindPasswordConfirm('');
                      setNeedsPasswordSetup(false);
                      setViewMode(viewMode === 'signin' ? 'signup' : 'signin');
                    }}
                style={styles.switchLink}
              >
                {viewMode === 'signin' ? t('auth.switch.createAccount') : t('auth.switch.signIn')}
              </Text>
            </Text>
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  backButtonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: 22,
    color: Colors.espresso,
    marginTop: -1,
  },
  scrollContent: { flexGrow: 1, paddingHorizontal: Spacing.xxl, paddingTop: Spacing.lg, paddingBottom: Spacing.xxl },
  title: { fontFamily: Typography.fontFamilyHeading, fontSize: 34, color: Colors.espresso, textAlign: 'center' },
  subtitle: { fontFamily: Typography.fontFamilyBody, fontSize: 16, color: Colors.textMuted, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  card: { marginTop: 24, backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.xl, ...Shadows.sm },
  cardTitle: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: 16, color: Colors.espresso },
  cardText: { fontFamily: Typography.fontFamilyBody, fontSize: 14, color: Colors.textMuted, marginTop: 8, lineHeight: 20 },
  providers: { marginTop: 22, gap: 12 },
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  providerApple: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  providerIcon: { fontFamily: Typography.fontFamilyBodyBold, fontSize: 16, color: Colors.espresso },
  providerIconApple: { color: '#fff', fontSize: 18 },
  providerText: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: 15, color: Colors.espresso },
  providerTextApple: { color: '#fff' },

  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  orText: { fontFamily: Typography.fontFamilyBody, fontSize: 13, color: Colors.textMuted },

  form: { marginTop: 16, gap: 12 },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontFamily: Typography.fontFamilyBody,
    fontSize: 15,
    color: Colors.espresso,
  },
  passwordWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  forgotRow: { marginTop: 10, textAlign: 'right' },
  forgotLink: { fontFamily: Typography.fontFamilyBodyMedium, color: Colors.espresso, fontSize: 14 },

  passwordSetup: { gap: 12 },
  passwordSetupTitle: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: 16, color: Colors.espresso, marginTop: 6 },
  passwordSetupBody: { fontFamily: Typography.fontFamilyBody, fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  passwordSetupEmailPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  passwordSetupEmailText: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: 13, color: Colors.espresso, maxWidth: '100%' },

  errorBox: {
    marginTop: 12,
    backgroundColor: '#FFF3F0',
    borderColor: '#F2B8A6',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: 12,
  },
  errorText: { fontFamily: Typography.fontFamilyBody, fontSize: 13, color: '#8A2E1C', lineHeight: 18 },

  infoBox: {
    marginTop: 12,
    backgroundColor: '#F6F2EA',
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: 12,
  },
  infoText: { fontFamily: Typography.fontFamilyBody, fontSize: 13, color: Colors.textMuted, lineHeight: 18 },

  primaryButton: { marginTop: 18, borderRadius: 999, overflow: 'hidden', ...Shadows.md },
  primaryButtonGradient: { paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { fontFamily: Typography.fontFamilyBodyMedium, fontSize: 17, color: '#fff' },

  switchRow: { textAlign: 'center', marginTop: 14, fontFamily: Typography.fontFamilyBody, fontSize: 14, color: Colors.textMuted },
  switchLink: { fontFamily: Typography.fontFamilyBodyMedium, color: Colors.espresso },
});
