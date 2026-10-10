// A short buzz for the result of a QR scan (D7-20; docs/DECISIONS.md #239), so the coordinator at the door
// feels the scan landed without looking at the screen. Uses expo-haptics
// (https://docs.expo.dev/versions/v57.0.0/sdk/haptics/); the phone's own "touch vibration" setting can turn it
// off. Nothing on the web version.

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Buzzes once for a scan: the success pattern when it worked, the error pattern when it did not (unknown
 * code, no internet, refused). Never throws: a phone without a vibration motor just stays still.
 * @param worked whether the scan marked the visit.
 */
export function scanFeedback(worked: boolean): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(
    worked ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
  ).catch(() => undefined);
}
