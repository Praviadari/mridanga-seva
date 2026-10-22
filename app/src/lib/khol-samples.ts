// Real khol sounds, prepared (docs/DECISIONS.md #473): a setting "synthesised / real khol" and the loading of the
// Guru's recorded strokes from the app's own files, used everywhere the practice tools sound a stroke (the taal player,
// step mode, the tap pad, Which bol?, Echo me) in place of the synthesised ones (lib/practice-sounds.ts). NO
// recordings ship yet: KHOL_SAMPLE_FILES is empty until the Guru records them (what to record: docs/KHOL_RECORDINGS.md),
// so "real" is offered but greyed out and the synthesised strokes play. Adding them is a JS-only change (an OTA): the
// WAV files go in app/assets/sounds/khol/ and one require() line each below; expo-asset is in the APK already.
// A stroke the recordings lack keeps its synthesised sound; the metronome clicks are always synthesised.
// The recordings are instrument sounds, made at the class: no personal data.

import type { SoundId } from './bols';
import { assetBytes } from './asset-bytes';
import { readLocal, writeLocal } from './local-storage';
import { setRecordedSounds } from './practice-sounds';
import { parseWav, prepareStroke, resample } from './stroke-samples';

/** The strokes the Guru records: every stroke sound of lib/bols.ts (the combined bols are two of these together). */
export const RECORDED_STROKES = ['ta', 'na', 'ti', 'ra', 'te', 'ka', 'gha', 'ga', 'gin'] as const satisfies readonly SoundId[];

/**
 * The recorded strokes in the app's files, by sound: WAV, 16-bit PCM, mono (docs/KHOL_RECORDINGS.md). Empty until the
 * Guru's recordings are added, for example:
 *   ta: require('../../assets/sounds/khol/ta.wav'),
 */
export const KHOL_SAMPLE_FILES: Partial<Record<SoundId, number>> = {};

/** Synthesised strokes, or the Guru's recordings. */
export type SoundChoice = 'synth' | 'real';

const CHOICE_KEY = 'kholSound';

/** True when the app carries recorded strokes. */
export function realSoundsReady(files: Partial<Record<SoundId, number>> = KHOL_SAMPLE_FILES): boolean {
  return Object.keys(files).length > 0;
}

/** The choice kept on this device: 'real' when the student chose it (it plays only when recordings exist). */
export function soundChoice(): SoundChoice {
  return readLocal(CHOICE_KEY) === 'real' ? 'real' : 'synth';
}

/** The recordings read so far: each stroke at its own rate, and at the rates asked for. */
const loaded = new Map<SoundId, { rate: number; samples: Float32Array }>();
const atRate = new Map<string, Float32Array>();

function recordedAt(id: SoundId, rate: number): Float32Array | null {
  const found = loaded.get(id);
  if (!found) return null;
  const key = `${id}@${rate}`;
  let samples = atRate.get(key);
  if (!samples) {
    samples = resample(found.samples, found.rate, rate);
    atRate.set(key, samples);
  }
  return samples;
}

/** Reads the recordings that are not read yet; one that cannot be read keeps the synthesised sound. */
async function loadRecordings(): Promise<void> {
  await Promise.all(
    Object.entries(KHOL_SAMPLE_FILES).map(async ([id, module]) => {
      if (loaded.has(id as SoundId) || module === undefined) return;
      try {
        const wav = parseWav(await assetBytes(module));
        if (wav) loaded.set(id as SoundId, { rate: wav.rate, samples: prepareStroke(wav.samples, wav.rate) });
      } catch {
        // A missing or broken file: that stroke stays synthesised.
      }
    }),
  );
}

/**
 * Makes the chosen sounds the ones the practice tools play. 'real' needs recordings in the app; without them the
 * synthesised strokes play. Returns what plays now.
 */
export async function applySoundChoice(choice: SoundChoice = soundChoice()): Promise<SoundChoice> {
  if (choice === 'real' && realSoundsReady()) {
    await loadRecordings();
    if (loaded.size > 0) {
      setRecordedSounds(recordedAt);
      return 'real';
    }
  }
  setRecordedSounds(null);
  return 'synth';
}

/** Keeps the choice on this device and applies it. */
export async function chooseSound(choice: SoundChoice): Promise<SoundChoice> {
  writeLocal(CHOICE_KEY, choice);
  return applySoundChoice(choice);
}
