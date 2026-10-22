// The tap pad's own sound on Android and iOS (docs/DECISIONS.md #470): when the student plays the strokes themself
// (the loop gives only the beat), each tap sounds its stroke at once. Each stroke is written once as a short WAV in
// the cache folder (lib/practice-sounds.ts, synthesised or recorded) and kept loaded in two expo-audio players, used
// in turn, so a stroke tapped again quickly does not cut the last one off. The browser version is pad-sound.web.ts.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import type { SoundId } from './bols';
import { soundSamples, soundsVersion, wavFile } from './practice-sounds';

/** Plays single strokes the moment a pad is tapped. */
export type PadSound = {
  /** Loads the strokes that may be tapped. */
  prepare(ids: readonly SoundId[]): Promise<void>;
  play(id: SoundId): void;
  dispose(): void;
};

const RATE = 22050;

class NativePadSound implements PadSound {
  private players = new Map<SoundId, { list: AudioPlayer[]; next: number; version: number }>();

  async prepare(ids: readonly SoundId[]): Promise<void> {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
    for (const id of ids) {
      const had = this.players.get(id);
      if (had && had.version === soundsVersion()) continue;
      const file = new File(Paths.cache, `pad-${id}.wav`);
      if (file.exists) file.delete();
      file.create();
      file.write(wavFile(soundSamples(id, RATE), RATE));
      const list = had?.list ?? [createAudioPlayer(null), createAudioPlayer(null)];
      for (const player of list) player.replace({ uri: file.uri });
      this.players.set(id, { list, next: 0, version: soundsVersion() });
    }
  }

  play(id: SoundId): void {
    const entry = this.players.get(id);
    if (!entry) return;
    const player = entry.list[entry.next];
    entry.next = (entry.next + 1) % entry.list.length;
    if (!player.isLoaded) return;
    void player.seekTo(0).then(() => player.play());
  }

  dispose(): void {
    for (const { list } of this.players.values()) for (const player of list) player.remove();
    this.players.clear();
  }
}

/** A pad sound for one screen. Call dispose() when the screen goes. */
export function createPadSound(): PadSound {
  return new NativePadSound();
}
