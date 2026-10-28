// The Playground's clip player on Android and iOS (docs/RHYTHM_PLAYGROUND.md §7.7, §7.9, §11.1, §11.5; docs/DECISIONS.md
// #762): one recorded clip (a kīrtan, an instrument, a voice prompt — a signed link from the bucket playground-audio)
// or one generated sound (lib/playground/tones.ts, written once to a WAV in the cache folder and reused). The game
// reads the player's own clock (currentTime), as the tap pad does, so taps line up with what is playing. One sound at
// a time: starting any clip stops the one before (spec §11). Never starts by itself — only from a tap.
// Slower playback keeps the pitch (shouldCorrectPitch); how well that sounds on cheap Android phones must be
// checked before Kīrtan games rely on it (§7.14) — until then the clips' own slow/medium versions are used.
// The browser version is clip-player.web.ts.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { TONE_RATE, toWav } from './tones';

/** A clip: a file link, or a generated sound with a key (same key = same sound, rendered once). */
export type ClipSource = { uri: string } | { key: string; render: () => Float32Array };

export type ClipPlayer = {
  /** Plays from `fromMs` at `rate` (1 = as recorded). False when it could not play. */
  play: (source: ClipSource, fromMs?: number, rate?: number) => Promise<boolean>;
  stop: () => void;
  /** Where the clip is, in ms on its own clock (0 when stopped). */
  positionMs: () => number;
  isPlaying: () => boolean;
  /** Called once when a clip plays to its end. */
  onEnd: (fn: (() => void) | null) => void;
  dispose: () => void;
};

let active: ClipPlayer | null = null;
let audioModeSet = false;

/** A safe file name for a generated sound's key. */
function fileName(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return `playground-${h.toString(16)}.wav`;
}

/** The generated sound's file in the cache, written the first time. */
function generatedUri(key: string, render: () => Float32Array): string {
  const file = new File(Paths.cache, fileName(key));
  if (!file.exists) {
    file.create();
    file.write(toWav(render(), TONE_RATE));
  }
  return file.uri;
}

export function createClipPlayer(): ClipPlayer {
  let player: AudioPlayer | null = null;
  let playing = false;
  let ended: (() => void) | null = null;
  let sub: { remove: () => void } | null = null;

  const self: ClipPlayer = {
    async play(source, fromMs = 0, rate = 1) {
      if (active && active !== self) active.stop();
      active = self;
      self.stop();
      try {
        if (!audioModeSet) {
          await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
          audioModeSet = true;
        }
        const uri = 'uri' in source ? source.uri : generatedUri(source.key, source.render);
        if (!player) {
          player = createAudioPlayer(null, { updateInterval: 100 });
          sub = player.addListener('playbackStatusUpdate', (status) => {
            if (status.didJustFinish && playing) {
              playing = false;
              ended?.();
            }
          });
        }
        player.replace({ uri });
        for (let i = 0; i < 60 && !player.isLoaded; i++) await new Promise((resolve) => setTimeout(resolve, 50));
        if (!player.isLoaded) return false;
        player.shouldCorrectPitch = true;
        player.setPlaybackRate(rate, 'high');
        if (fromMs > 0) await player.seekTo(fromMs / 1000);
        player.play();
        playing = true;
        return true;
      } catch {
        playing = false;
        return false;
      }
    },
    stop() {
      if (!player) return;
      playing = false;
      player.pause();
      void player.seekTo(0).catch(() => undefined);
    },
    positionMs: () => (player && playing ? Math.round(player.currentTime * 1000) : 0),
    isPlaying: () => playing,
    onEnd(fn) {
      ended = fn;
    },
    dispose() {
      self.stop();
      sub?.remove();
      player?.remove();
      player = null;
      if (active === self) active = null;
    },
  };
  return self;
}

/** Stops whatever Playground clip is playing (another sound is about to start). */
export function stopAllClips(): void {
  active?.stop();
}
