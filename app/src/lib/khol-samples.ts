// Real khol sounds, prepared (docs/DECISIONS.md #473): a setting "synthesised / real khol" and the loading of the
// Guru's recorded strokes from the app's own files, used everywhere the practice tools sound a stroke (the taal player,
// step mode, the tap pad, Which bol?, Echo me) in place of the synthesised ones (lib/practice-sounds.ts). The class's
// first recordings ship since #790 (what to record: docs/KHOL_RECORDINGS.md). Adding more is a JS-only change (an
// OTA): the WAV files go in app/assets/sounds/khol/ and one require() line each below; expo-asset is in the APK already.
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
 * The recorded strokes in the app's files, by sound: WAV, 16-bit PCM, mono (docs/KHOL_RECORDINGS.md). The class's
 * recordings of 02-11-2026 (#790): the team says the bol names are spoken variants of the same strokes, so one
 * recording serves each group (te = ti, tā = nā, ga = gha). gin (the slide) is not recorded yet and stays synthesised.
 */
export const KHOL_SAMPLE_FILES: Partial<Record<SoundId, number>> = {
  te: require('../../assets/sounds/khol/te.wav'),
  ti: require('../../assets/sounds/khol/te.wav'),
  ta: require('../../assets/sounds/khol/ta.wav'),
  na: require('../../assets/sounds/khol/ta.wav'),
  ra: require('../../assets/sounds/khol/ra.wav'),
  ka: require('../../assets/sounds/khol/ka.wav'),
  ga: require('../../assets/sounds/khol/ga.wav'),
  gha: require('../../assets/sounds/khol/ga.wav'),
};

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
