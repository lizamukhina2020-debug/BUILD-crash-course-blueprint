import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { registerWebAlertPresenter, WebAlertRequest } from '../utils/crossPlatformAlert';

type NormalizedButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

function normalizeButtons(buttons?: WebAlertRequest['buttons']): NormalizedButton[] {
  if (!buttons || buttons.length === 0) return [{ text: 'OK', style: 'default' }];
  return buttons.map(b => ({
    text: b.text,
    onPress: b.onPress,
    style: b.style ?? 'default',
  }));
}

export default function WebAlertHost() {
  const [req, setReq] = useState<WebAlertRequest | null>(null);
  const [visible, setVisible] = useState(false);

  const buttons = useMemo(() => normalizeButtons(req?.buttons), [req?.buttons]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    registerWebAlertPresenter((next) => {
      setReq(next);
      setVisible(true);
    });
    return () => registerWebAlertPresenter(null);
  }, []);

  if (Platform.OS !== 'web') return null;

  const close = () => {
    setVisible(false);
    // Let the close animation finish before clearing.
    setTimeout(() => setReq(null), 0);
  };

  const handlePress = (btn: NormalizedButton) => {
    close();
    btn.onPress?.();
  };

  const title = req?.title ?? '';
  const message = req?.message ?? '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.card}>
          {!!title && <Text style={styles.title}>{title}</Text>}
          {!!message && <Text style={styles.message}>{message}</Text>}

          <View style={styles.buttonsRow}>
            {buttons.map((b, idx) => {
              const isCancel = b.style === 'cancel';
              const isDestructive = b.style === 'destructive';
              return (
                <Pressable
                  key={`${b.text}-${idx}`}
                  onPress={() => handlePress(b)}
                  style={({ pressed }) => [
                    styles.buttonBase,
                    isCancel && styles.buttonCancel,
                    isDestructive && styles.buttonDestructive,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isCancel && styles.buttonTextCancel,
                      isDestructive && styles.buttonTextDestructive,
                    ]}
                  >
                    {b.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    ...Shadows.lg,
  },
  title: {
    fontFamily: Typography.fontFamilyHeading,
    fontSize: Typography.fontSizeXL,
    color: Colors.espresso,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontFamily: Typography.fontFamilyBody,
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  buttonBase: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonCancel: {
    backgroundColor: Colors.surface,
  },
  buttonDestructive: {
    backgroundColor: '#FFE8E8',
    borderColor: '#F2B6B6',
  },
  buttonText: {
    fontFamily: Typography.fontFamilyBodyMedium,
    fontSize: Typography.fontSizeMD,
    color: Colors.espresso,
  },
  buttonTextCancel: {
    color: Colors.textSecondary,
  },
  buttonTextDestructive: {
    color: '#8B1E1E',
  },
});

