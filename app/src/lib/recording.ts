// Recording audio in the app (Phase 2 slice 4, docs/DECISIONS.md #52, #56), with expo-audio (in
// the next planned APK): "Record myself" on S5, a recording for an assessment on S7 and the
// coordinator's voice note on C14 (components/audio-recorder.tsx).
// Phones record AAC in an .m4a file (mono, 96 kbit/s: about 0.7 MB a minute, so 50 MB is over an
// hour); the browser records Opus in a .webm file through MediaRecorder.

import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, type RecordingOptions } from 'expo-audio';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/** Recording settings: the high-quality preset in mono at 96 kbit/s. */
export const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 96000,
  web: { mimeType: 'audio/webm', bitsPerSecond: 96000 },
};

/** One finished recording, before it is kept or uploaded. */
export type RecordedTake = {
  /** A file:// address on a phone, a blob: address in the browser. */
  uri: string;
  durationMs: number;
  /** 'm4a' on phones, 'webm' in the browser. */
  ending: string;
  mimeType: string;
  size: number;
  /** The browser's recording. */
  webFile?: Blob;
  /** ISO time the recording started. */
  recordedAt: string;
};

/** Asks for the microphone. False when it was refused (or the browser has none). */
export async function askMicrophone(): Promise<boolean> {
  try {
    return (await requestRecordingPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Switches the phone to recording (iOS needs this; while it is on, sound may come out of the
 * earpiece) or back to playing only. Playing in silent mode and beside other apps stays on, as in
 * the practice player (lib/practice-audio.ts).
 */
export async function setRecordingMode(recording: boolean): Promise<void> {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers', allowsRecording: recording });
  } catch {
    // The browser has no audio mode; a phone that refuses still records with its defaults.
  }
}

/** Turns the recorder's file into a take: its size, ending and type (and the browser's Blob). */
export async function takeOf(uri: string, durationMs: number, recordedAt: string): Promise<RecordedTake> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    const type = (blob.type || 'audio/webm').split(';')[0];
    const ending = type === 'audio/mp4' ? 'm4a' : type === 'audio/ogg' ? 'ogg' : 'webm';
    return { uri, durationMs, ending, mimeType: type, size: blob.size, webFile: blob, recordedAt };
  }
  const file = new File(uri);
  const ending = (uri.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? 'm4a').replace('3gpp', '3gp');
  return { uri, durationMs, ending, mimeType: ending === '3gp' ? 'audio/3gpp' : 'audio/mp4', size: file.size ?? 0, recordedAt };
}
