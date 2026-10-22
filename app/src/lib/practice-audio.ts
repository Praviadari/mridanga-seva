// The practice player on Android and iOS (expo-audio, in the next planned APK; DECISIONS #52, #54).
// A JavaScript timer on a phone is not steady enough to start each click itself, and expo-audio
// has no way to start a sound at an exact future time. So the whole cycle (one metronome bar or one
// taal cycle) is mixed into one WAV file at the chosen tempo (lib/practice-sounds.ts renderLoop),
// written to the cache folder and played with `loop` on: the phone's audio hardware clock then
// keeps the time, sample-exact, for as long as it plays. The screen reads player.currentTime to
// light the beat. A tempo change mixes a new file and continues at the same place in the cycle.
// The count-in (#403) is a second, short file played once (lib/practice-sounds.ts renderOnce); the loop, already loaded and paused, starts
// when the count-in's time is over (a JavaScript timer, so sam may come some milliseconds early or
// late, once; from then on the loop keeps the time). The same second player plays one stroke in the step
// mode (#404). A layer's volume (the kartal, #492) is mixed in, so a change mixes the loop again like a tempo change.
// The browser version is practice-audio.web.ts (Web Audio API, look-ahead scheduler).

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { metronomePattern, type Layer, type Pattern } from './practice-pattern';
import type { PlayerPosition, PracticePlayer } from './practice-player';
import { renderLoop, renderOnce, wavFile, type LayerVolumes } from './practice-sounds';

export type { PlayerPosition, PracticePlayer } from './practice-player';

/** Samples a second of the rendered loop: enough for these sounds, half the file size of 44.1 kHz. */
const RATE = 22050;

let audioModeSet = false;

/** Writes samples to a WAV in the cache folder and loads it into `player` (at most 2 s), not playing. */
async function loadInto(player: AudioPlayer, name: string, samples: Float32Array, loop: boolean): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(wavFile(samples, RATE));
  player.replace({ uri: file.uri });
  player.loop = loop;
  // replace() loads in the background; wait for it before seeking or playing.
  for (let i = 0; i < 40 && !player.isLoaded; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

class NativePracticePlayer implements PracticePlayer {
  private player: AudioPlayer | null = null;
  /** Plays the count-in and single strokes. */
  private once: AudioPlayer | null = null;
  private pattern: Pattern | null = null;
  private bpm = 80;
  private playing = false;
  /** Two file names in turn, so a new loop never overwrites the file being played. */
  private flip = false;
  /** True while a new loop is mixed and loaded: currentTime is not the cycle's then. */
  private loading = false;
  /** The count-in is sounding: the loop waits, paused. */
  private counting = false;
  private countTimer: ReturnType<typeof setTimeout> | null = null;
  /** The layers' volumes (#492): mixed into the loop, so a change mixes it again. */
  private volumes: LayerVolumes = {};

  private async audioMode(): Promise<void> {
    if (!audioModeSet) {
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
      audioModeSet = true;
    }
  }

  async start(pattern: Pattern, bpm: number, countIn = 0): Promise<boolean> {
    this.stop();
    try {
      await this.audioMode();
      this.pattern = pattern;
      this.bpm = bpm;
      if (countIn <= 0) {
        await this.load(0, true);
        this.playing = true;
        return true;
      }
      await this.load(0, false);
      this.once ??= createAudioPlayer(null);
      await loadInto(this.once, 'practice-count-in.wav', renderOnce(metronomePattern(countIn), bpm, RATE), false);
      this.playing = true;
      this.counting = true;
      this.once.play();
      this.countTimer = setTimeout(() => {
        this.countTimer = null;
        this.counting = false;
        if (this.playing) this.player?.play();
      }, (countIn * 60000) / bpm);
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  async playOnce(pattern: Pattern, bpm: number): Promise<boolean> {
    this.stop();
    try {
      await this.audioMode();
      this.once ??= createAudioPlayer(null);
      await loadInto(this.once, 'practice-once.wav', renderOnce(pattern, bpm, RATE), false);
      this.once.play();
      return true;
    } catch {
      return false;
    }
  }

  setTempo(bpm: number): void {
    if (bpm === this.bpm) return;
    const at = this.position();
    this.bpm = bpm;
    if (!this.playing) return;
    // During the count-in the loop is mixed again at the new tempo and waits as before.
    if (this.counting) {
      void this.load(0, false).catch(() => this.stop());
      return;
    }
    if (!at) return;
    void this.load(at.beat, true).catch(() => {
      this.playing = false;
    });
  }

  setLayerVolume(layer: Layer, volume: number): void {
    const v = Math.min(1, Math.max(0, volume));
    if (this.volumes[layer] === v) return;
    this.volumes = { ...this.volumes, [layer]: v };
    // Only a loop that has this layer is mixed again, at the same place (as a tempo change).
    if (!this.playing || !this.pattern?.events.some((e) => e.layer === layer)) return;
    if (this.counting) {
      void this.load(0, false).catch(() => this.stop());
      return;
    }
    const at = this.position();
    if (!at) return;
    void this.load(at.beat, true).catch(() => {
      this.playing = false;
    });
  }

  stop(): void {
    this.playing = false;
    this.counting = false;
    if (this.countTimer !== null) clearTimeout(this.countTimer);
    this.countTimer = null;
    this.player?.pause();
    this.once?.pause();
  }

  position(): PlayerPosition | null {
    // While a new loop loads, currentTime may read 0 for a moment: no position, so no false new cycle (#403).
    if (!this.playing || this.counting || this.loading || !this.player || !this.pattern) return null;
    const beat = (this.player.currentTime * this.bpm) / 60;
    const cycle = Math.floor(beat / this.pattern.beats);
    return { beat: beat - cycle * this.pattern.beats, cycle };
  }

  dispose(): void {
    this.stop();
    this.player?.remove();
    this.player = null;
    this.once?.remove();
    this.once = null;
  }

  /** Mixes the loop at the current tempo and loads it at `beat`; plays it when `play`. */
  private async load(beat: number, play: boolean): Promise<void> {
    const pattern = this.pattern;
    if (!pattern) return;
    this.loading = true;
    try {
      this.flip = !this.flip;
      this.player ??= createAudioPlayer(null);
      const player = this.player;
      await loadInto(player, this.flip ? 'practice-loop-a.wav' : 'practice-loop-b.wav', renderLoop(pattern, this.bpm, RATE, this.volumes), true);
      if (beat > 0) await player.seekTo((beat * 60) / this.bpm);
      if (play) player.play();
    } finally {
      this.loading = false;
    }
  }
}

/** A new player for one screen. Call dispose() when the screen goes. */
export function createPracticePlayer(): PracticePlayer {
  return new NativePracticePlayer();
}
