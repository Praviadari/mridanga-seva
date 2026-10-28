// The approximate pitch line on Android and iOS: not available in this app (docs/DECISIONS.md #764). expo-audio
// records to a file and gives JavaScript no live samples, so a pitch line on the phone needs either the WebView
// route or new native code (a new APK) — see docs/PLAYGROUND_MIC_SPIKE.md. The browser version is pitch.web.ts.

import type { PitchEstimate } from './pitch-estimate';

export type PitchFrame = { estimate: PitchEstimate | null; level: number };
export type PitchLine = { stop: () => void };

/** Never on the phone app (yet). */
export function pitchLineAvailable(): boolean {
  return false;
}

export async function startPitchLine(_onFrame: (frame: PitchFrame) => void): Promise<PitchLine | null> {
  return null;
}
