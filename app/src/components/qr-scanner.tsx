// Camera view that reads QR codes, for the attendance screen (C5). Asks for the camera
// permission first, and explains what to do when the camera is refused or missing.
// Uses expo-camera (https://docs.expo.dev/versions/v57.0.0/sdk/camera/). On the web version the
// camera works in the browser too; iPhones without built-in QR reading use a helper that
// expo-camera downloads once (docs/ARCHITECTURE.md "How attendance flows").

import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Notice } from './notice';

/** Props for QrScanner. */
export type QrScannerProps = {
  /**
   * Called with the text of a QR code the camera sees. It can be called several times a second
   * for the same code, so the caller must ignore repeats (the attendance screen does).
   */
  onScan: (text: string) => void;
  /** Keeps the camera picture but stops reading codes, e.g. while a result is shown. */
  paused?: boolean;
};

/** Square camera picture that reports QR codes, with the permission steps around it. */
export function QrScanner({ onScan, paused }: QrScannerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraFailed, setCameraFailed] = useState(false);
  // Set when asking did not give the camera. A browser with no camera, or one that blocks it,
  // refuses without showing anything, so the screen must say so itself.
  const [refused, setRefused] = useState(false);

  async function askForCamera() {
    const answer = await requestPermission().catch(() => null);
    if (!answer?.granted) setRefused(true);
  }
  // expo-camera allows one camera picture at a time, and asks apps to remove it when the screen
  // is covered by another one (e.g. "Who is here now" opened on top).
  const isFocused = useIsFocused();

  if (!permission) return <AppText tone="muted">{t('common.loading')}</AppText>;

  if (!permission.granted) {
    return (
      <View style={styles.message}>
        <AppText>{t('scanner.permissionNeeded')}</AppText>
        {permission.canAskAgain && !refused ? (
          <Button label={t('scanner.allowCamera')} onPress={() => void askForCamera()} />
        ) : (
          <AppText tone="muted">{t('scanner.permissionBlocked')}</AppText>
        )}
      </View>
    );
  }

  // No camera on this device, or the browser refused it (the web version needs https).
  if (cameraFailed) return <Notice tone="error">{t('scanner.noCamera')}</Notice>;

  if (!isFocused) return null;

  return (
    <View
      accessibilityLabel={t('scanner.label')}
      style={[styles.frame, { borderColor: colors.border, backgroundColor: colors.text }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        // Leaving the handler out is how expo-camera is told to stop reading codes.
        onBarcodeScanned={paused ? undefined : (result) => onScan(result.data)}
        onMountError={() => setCameraFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  message: {
    gap: spacing.sm,
  },
  frame: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: radius,
    overflow: 'hidden',
  },
});
