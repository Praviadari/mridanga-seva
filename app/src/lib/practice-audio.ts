// The practice player on Android and iOS (expo-audio, in the next planned APK; DECISIONS #52, #54).
// A JavaScript timer on a phone is not steady enough to start each click itself, and expo-audio
// has no way to start a sound at an exact future time. So the whole cycle (one metronome bar or one
// taal cycle) is mixed into one WAV file at the chosen tempo (lib/practice-sounds.ts renderLoop),
// written to the cache folder and played with `loop` on: the phone's audio hardware clock then
// keeps the time, sample-exact, for as long as it plays. The screen reads player.currentTime to
// light the beat. A tempo change mixes a new file and continues at the same place in the cycle.
// The browser version is practice-audio.web.ts (Web Audio API, look-ahead scheduler).

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import type { Pattern } from './practice-pattern';
import type { PlayerPosition, PracticePlayer } from './practice-player';
import { renderLoop, wavFile } from './practice-sounds';

export type { PlayerPosition, PracticePlayer } from './practice-player';

/** Samples a second of the rendered loop: enough for these sounds, half the file size of 44.1 kHz. */
const RATE = 22050;

let audioModeSet = false;

class NativePracticePlayer implements PracticePlayer {
  private player: AudioPlayer | null = null;
  private pattern: Pattern | null = null;
  private bpm = 80;
  private playing = false;
  /** Two file names in turn, so a new loop never overwrites the file being played. */
  private flip = false;

  async start(pattern: Pattern, bpm: number): Promise<boolean> {
    this.stop();
    try {
      if (!audioModeSet) {
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
        audioModeSet = true;
      }
      this.pattern = pattern;
      this.bpm = bpm;
      await this.load(0);
      this.playing = true;
      return true;
    } catch {
      this.playing = false;
      return false;
    }
  }

  setTempo(bpm: number): void {
    if (bpm === this.bpm) return;
    const at = this.position();
    this.bpm = bpm;
    if (!this.playing || !at) return;
    void this.load(at.beat).catch(() => {
      this.playing = false;
    });
  }

  stop(): void {
    this.playing = false;
    this.player?.pause();
  }

  position(): PlayerPosition | null {
    if (!this.playing || !this.player || !this.pattern) return null;
    const beat = (this.player.currentTime * this.bpm) / 60;
    const cycle = Math.floor(beat / this.pattern.beats);
    return { beat: beat - cycle * this.pattern.beats, cycle };
  }

  dispose(): void {
    this.stop();
    this.player?.remove();
    this.player = null;
  }

  /** Mixes the loop at the current tempo, plays it from `beat`. */
  private async load(beat: number): Promise<void> {
    const pattern = this.pattern;
    if (!pattern) return;
    const samples = renderLoop(pattern, this.bpm, RATE);
    this.flip = !this.flip;
    const file = new File(Paths.cache, this.flip ? 'practice-loop-a.wav' : 'practice-loop-b.wav');
    if (file.exists) file.delete();
    file.create();
    file.write(wavFile(samples, RATE));
    if (!this.player) this.player = createAudioPlayer(null);
    const player = this.player;
    player.replace({ uri: file.uri });
    player.loop = true;
    // replace() loads in the background; wait for it (at most 2 s) before seeking.
    for (let i = 0; i < 40 && !player.isLoaded; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (beat > 0) await player.seekTo((beat * 60) / this.bpm);
    player.play();
  }
}

/** A new player for one screen. Call dispose() when the screen goes. */
export function createPracticePlayer(): PracticePlayer {
  return new NativePracticePlayer();
}
