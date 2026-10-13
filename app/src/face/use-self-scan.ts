// Face self-scan (Phase 3 P3-5, docs/DECISIONS.md #344): what the student home's "Check in" / "Check out" circle
// shows. Asked each time the home comes into view, and only where a self-scan can happen at all: the Android
// app, face scan switched on, and a face code kept on this phone (the start check, src/face/face-status.ts).
// Everyone else never calls the server for it, and sees no circle — so while face_enabled is off nothing shows.

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { fetchSelfScanState } from '@/data/self-scan';

import { useFaceStatus } from './face-status';
import { FACE_SCAN_SUPPORTED } from './face-store';
import { SELF_SCAN_SUPPORTED } from './integrity';
import type { SelfScanState } from './self-scan-rules';

/**
 * The self-scan state for the home, or null (no circle).
 * @param profileId the signed-in student's login.
 */
export function useSelfScanState(profileId: string | undefined): SelfScanState | null {
  const status = useFaceStatus(FACE_SCAN_SUPPORTED && SELF_SCAN_SUPPORTED ? profileId : undefined);
  const deviceKey = status?.server?.face_enabled === true && status.stored?.enrolled ? status.stored.deviceKey : null;
  const [state, setState] = useState<{ key: string; value: SelfScanState | null } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!deviceKey) return;
      let live = true;
      void fetchSelfScanState(deviceKey).then((value) => {
        if (live) setState({ key: deviceKey, value });
      });
      return () => {
        live = false;
      };
    }, [deviceKey]),
  );

  return deviceKey && state?.key === deviceKey ? state.value : null;
}
